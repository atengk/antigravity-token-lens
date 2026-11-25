/**
 * notifier.mjs 单元测试：覆盖文案脱敏、凭据掩码、四类 Webhook 签名构建与退避重试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  buildChannelPayload,
  maskSecret,
  maskWebhookUrl,
  sanitizeAlertText,
  sendWebhookMessage,
} from '../notifier.mjs';

test('sanitizeAlertText 剥离本地路径、Token 凭据并控制长度', () => {
  const raw =
    'Request failed for file:///D:/Data/secret/app.js at C:\\Users\\alice\\project\\secret.json ' +
    'with Bearer eyJhbGciOiJIUzI1NiJ9.abc.def and sk-1234567890abcdef and ?token=xyz999&access_token=aaa';
  const clean = sanitizeAlertText(raw);
  assert.ok(!clean.includes('C:\\Users\\alice'));
  assert.ok(!clean.includes('D:/Data/secret'));
  assert.ok(!clean.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(!clean.includes('sk-1234567890abcdef'));
  assert.ok(!clean.includes('xyz999'));
  assert.ok(clean.includes('[path]'));
  assert.ok(clean.includes('[redacted]'));
});

test('maskWebhookUrl 与 maskSecret 仅保留非敏感前缀与末位掩码', () => {
  const maskedUrl = maskWebhookUrl('https://open.feishu.cn/open-apis/bot/v2/hook/12345678-abcd-ef90');
  assert.ok(maskedUrl.startsWith('https://open.feishu.cn/'));
  assert.ok(maskedUrl.includes('***ef90'));
  assert.ok(!maskedUrl.includes('12345678-abcd'));

  assert.equal(maskSecret('SECabcdef123456'), '***3456');
  assert.equal(maskSecret(''), '');
  assert.equal(maskWebhookUrl('not-a-url'), '');
});

test('buildChannelPayload 正确生成飞书与钉钉 HMAC 加签、企业微信及通用 JSON 负载', () => {
  const nowMs = 1_764_000_000_000;
  const secStr = String(Math.floor(nowMs / 1000));
  const alertEvent = {
    kind: 'alert',
    category: 'region_unavailable',
    severity: 'critical',
    title: 'Antigravity 地区不可用',
    summary: '任务因当前节点地区受限失败，请切换 VPN 节点后重试',
    incidents: [
      {
        id: 'region_unavailable:conv-1',
        category: 'region_unavailable',
        conversationId: 'conv-1',
        conversationTitle: '修复订单接口',
        retryCount: 3,
        message: '403 Your region is not supported',
      },
    ],
  };

  // 飞书（HMAC-SHA256，key = `${sec}\n${secret}`，空消息）
  const feishu = buildChannelPayload(
    { id: 'c1', type: 'feishu', name: '飞书告警', url: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx', secret: 'f-sec' },
    alertEvent,
    { nowMs, lang: 'zh-CN' },
  );
  const expectedFeishuSign = createHmac('sha256', `${secStr}\nf-sec`).update('').digest('base64');
  assert.equal(feishu.url, 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx');
  assert.equal(feishu.body.timestamp, secStr);
  assert.equal(feishu.body.sign, expectedFeishuSign);
  assert.equal(feishu.body.msg_type, 'post');

  // 钉钉（HMAC-SHA256，key = secret，data = `${ms}\n${secret}`，附加到 query）
  const ding = buildChannelPayload(
    { id: 'c2', type: 'dingtalk', name: '钉钉告警', url: 'https://oapi.dingtalk.com/robot/send?access_token=tok', secret: 'd-sec' },
    alertEvent,
    { nowMs, lang: 'zh-CN' },
  );
  const expectedDingSign = createHmac('sha256', 'd-sec').update(`${nowMs}\nd-sec`).digest('base64');
  const parsedDingUrl = new URL(ding.url);
  assert.equal(parsedDingUrl.searchParams.get('timestamp'), String(nowMs));
  assert.equal(parsedDingUrl.searchParams.get('sign'), expectedDingSign);
  assert.equal(ding.body.msgtype, 'markdown');

  // 企业微信
  const wecom = buildChannelPayload(
    { id: 'c3', type: 'wecom', name: '企微', url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=k' },
    alertEvent,
    { nowMs, lang: 'zh-CN' },
  );
  assert.equal(wecom.body.msgtype, 'markdown');
  assert.ok(wecom.body.markdown.content.includes('地区不可用'));

  // 通用 Webhook
  const generic = buildChannelPayload(
    { id: 'c4', type: 'webhook', name: '自定义', url: 'http://127.0.0.1:9000/hook' },
    alertEvent,
    { nowMs, lang: 'en' },
  );
  assert.equal(generic.body.event, 'watchdog.alert');
  assert.equal(generic.body.category, 'region_unavailable');
  assert.equal(generic.body.incidents.length, 1);
});

test('sendWebhookMessage 在 5xx 瞬态失败时重试并在业务错误码非 0 时准确返回失败', async () => {
  const alertEvent = {
    kind: 'test',
    category: 'test',
    severity: 'info',
    title: '测试告警',
    summary: '这是一条连通性测试消息',
    incidents: [],
  };
  const channel = {
    id: 'c1',
    type: 'feishu',
    name: '飞书',
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test1234',
    enabled: true,
  };

  let calls = 0;
  const okRes = await sendWebhookMessage(channel, alertEvent, {
    retryDelaysMs: [1, 1],
    requestFn: async () => {
      calls++;
      if (calls < 3) {
        return { statusCode: 502, text: 'Bad Gateway' };
      }
      return { statusCode: 200, text: JSON.stringify({ code: 0, msg: 'success' }) };
    },
  });
  assert.equal(okRes.ok, true);
  assert.equal(calls, 3);

  let bizCalls = 0;
  const bizErrRes = await sendWebhookMessage(channel, alertEvent, {
    retryDelaysMs: [1, 1],
    requestFn: async () => {
      bizCalls++;
      return { statusCode: 200, text: JSON.stringify({ code: 19021, msg: 'sign match fail' }) };
    },
  });
  assert.equal(bizErrRes.ok, false);
  assert.equal(bizCalls, 1);
  assert.ok(bizErrRes.error.includes('19021'));
});
