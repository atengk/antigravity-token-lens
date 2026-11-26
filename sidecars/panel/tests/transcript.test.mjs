/**
 * transcript.mjs 与 store.mjs 单元测试：覆盖并发半行容错与偏好原子持久化。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTranscriptText } from '../transcript.mjs';
import { PreferencesStore, normalizePreferences, redactPreferences } from '../store.mjs';

test('parseTranscriptText 能容忍末尾写入截断的半行并提取模型与子代理线索', () => {
  const raw = [
    JSON.stringify({
      step_index: 0,
      type: 'USER_INPUT',
      created_at: '2026-11-16T01:34:07Z',
      content: '<USER_REQUEST>\n分析缓存命中\n</USER_REQUEST>\nThe user changed setting `Model Selection` from Gemini 4 Hydrogen (High) to Gemini 4 Hydrogen (XHigh). No need to comment on this change if the user doesn\'t ask about it.',
    }),
    JSON.stringify({
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      created_at: '2026-11-16T01:34:08Z',
      input_tokens: 2000,
      cache_read_tokens: 18000,
      output_tokens: 340,
      tool_calls: [{ name: 'invoke_subagent', args: { TypeName: '"research"', Role: '"Code Explorer"' } }],
    }),
    '{"step_index":2,"type":"GENERIC","content":"尚未落盘完',
  ].join('\n');

  const parsed = parseTranscriptText(raw);
  assert.equal(parsed.steps.length, 2);
  assert.equal(parsed.skippedLines, 1);
  assert.equal(parsed.modelHint, 'Gemini 4 Hydrogen (XHigh)');
  assert.equal(parsed.titleHint, '分析缓存命中');
  assert.equal(parsed.subagentCalls.length, 1);
  assert.equal(parsed.subagentCalls[0].role, 'Code Explorer');
});

test('parseTranscriptText 完整保留带小数点的模型版本号并读取 PLANNER_RESPONSE.model', () => {
  const rawDotted = [
    JSON.stringify({
      step_index: 0,
      type: 'USER_INPUT',
      content: 'The user changed setting `Model Selection` from Gemini 4 Hydrogen (High) to Gemini 3.8 Flash (High). No need to comment on this change.',
    }),
    JSON.stringify({
      step_index: 1,
      type: 'USER_INPUT',
      content: 'The user changed setting `Model Selection` from Gemini 3.8 Flash (High) to Claude Sonnet 5.5 (Medium).',
    }),
  ].join('\n');

  const parsedDotted = parseTranscriptText(rawDotted);
  assert.equal(parsedDotted.modelHint, 'Claude Sonnet 5.5 (Medium)');

  const rawPlannerModel = JSON.stringify({
    step_index: 0,
    type: 'PLANNER_RESPONSE',
    model: 'MODEL_PLACEHOLDER_M532',
    input_tokens: 1200,
    cache_read_tokens: 0,
    output_tokens: 150,
  });
  const parsedPlanner = parseTranscriptText(rawPlannerModel);
  assert.equal(parsedPlanner.rawModelHint, 'MODEL_PLACEHOLDER_M532');
  assert.equal(parsedPlanner.modelHint, 'MODEL_PLACEHOLDER_M532');
});

test('PreferencesStore 支持原子更新、阈值校对与覆盖清除', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'token-lens-test-'));
  try {
    const store = new PreferencesStore(dir);
    const init = await store.load();
    assert.equal(init.lang, 'zh-CN');
    assert.equal(init.unitSystem, 'auto');
    assert.equal(init.warnAt, 70);

    const updated = await store.update({
      lang: 'en',
      unitSystem: 'intl',
      warnAt: 65,
      criticalAt: 90,
      contextLimitOverrides: { 'gemini-4-hydrogen': 1_048_576 },
    });
    assert.equal(updated.lang, 'en');
    assert.equal(updated.unitSystem, 'intl');
    assert.equal(updated.warnAt, 65);
    assert.equal(updated.criticalAt, 90);
    assert.equal(updated.contextLimitOverrides['gemini-4-hydrogen'], 1_048_576);

    // 清除单个模型覆盖
    const cleared = await store.update({
      contextLimitOverrides: { 'gemini-4-hydrogen': null },
    });
    assert.equal(cleared.contextLimitOverrides['gemini-4-hydrogen'], undefined);

    // 校验非法阈值与无效单位制防御
    const safe = normalizePreferences({ warnAt: 90, criticalAt: 80, unitSystem: 'invalid-unit' });
    assert.ok(safe.criticalAt > safe.warnAt);
    assert.equal(safe.unitSystem, 'auto');

    // Watchdog 配置持久化、凭据掩码回显与保留未修改密钥
    const withChannel = await store.update({
      watchdog: {
        enabled: true,
        retryThreshold: 4,
        retryDurationSec: 90,
        silentStallSec: 240,
        cooldownMin: 15,
        notifyRecovery: true,
        channels: [
          {
            id: 'ch-feishu',
            type: 'feishu',
            name: '团队飞书群',
            enabled: true,
            url: 'https://open.feishu.cn/open-apis/bot/v2/hook/secret-hook-9876',
            secret: 'my-secret-5678',
          },
        ],
      },
    });
    assert.equal(withChannel.watchdog.channels.length, 1);
    assert.equal(withChannel.watchdog.channels[0].secret, 'my-secret-5678');

    const redacted = redactPreferences(withChannel);
    const serialized = JSON.stringify(redacted);
    assert.ok(!serialized.includes('secret-hook-9876'));
    assert.ok(!serialized.includes('my-secret-5678'));
    assert.equal(redacted.watchdog.channels[0].hasSecret, true);
    assert.equal(redacted.watchdog.channels[0].secretMask, '***5678');

    // 更新非敏感字段（前端传回掩码或省略 secret）时应保留原 URL 与 Secret
    const patched = await store.update({
      lang: 'zh-CN',
      watchdog: {
        channels: [
          {
            id: 'ch-feishu',
            type: 'feishu',
            name: '改名飞书群',
            enabled: false,
            url: redacted.watchdog.channels[0].urlMask,
          },
        ],
      },
    });
    assert.equal(patched.watchdog.channels[0].name, '改名飞书群');
    assert.equal(patched.watchdog.channels[0].enabled, false);
    assert.equal(patched.watchdog.channels[0].url, 'https://open.feishu.cn/open-apis/bot/v2/hook/secret-hook-9876');
    assert.equal(patched.watchdog.channels[0].secret, 'my-secret-5678');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
