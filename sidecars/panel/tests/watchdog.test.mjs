/**
 * watchdog.mjs 单元测试：覆盖静默基线、地区不可用分类、重试去抖、静默卡死排除项、配额与 LS 失联、冷却聚合及恢复闭环。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AvailabilityWatchdog } from '../watchdog.mjs';
import { PanelService } from '../main.mjs';
import { PreferencesStore } from '../store.mjs';

function createFakeLsClient(initialState = {}) {
  const state = {
    summaries: {},
    projections: {},
    quota: { groups: [], models: [] },
    summariesError: null,
    quotaError: null,
    ...initialState,
  };
  return {
    state,
    async getSummaries() {
      if (state.summariesError) throw state.summariesError;
      return state.summaries;
    },
    async getProjection(id) {
      return state.projections[id] || { summary: state.summaries[id] || {}, steps: [], generatorMetadata: [] };
    },
    async getQuotaSummary() {
      if (state.quotaError) throw state.quotaError;
      return state.quota;
    },
  };
}

function createHarness(initialLsState = {}, configPatch = {}) {
  let nowMs = 1_764_000_000_000;
  const sent = [];
  const lsClient = createFakeLsClient(initialLsState);
  const watchdog = new AvailabilityWatchdog({
    lsClient,
    nowFn: () => nowMs,
    aggregationWindowMs: 5000,
    sendFn: async (channel, alertEvent) => {
      sent.push({ channelId: channel.id, alertEvent, atMs: nowMs });
      return {
        ok: true,
        channelId: channel.id,
        channelName: channel.name,
        type: channel.type,
        attempts: 1,
        error: null,
      };
    },
    config: {
      enabled: true,
      retryThreshold: 3,
      retryDurationSec: 60,
      silentStallSec: 180,
      cooldownMin: 10,
      notifyRecovery: true,
      channels: [
        { id: 'ch1', type: 'feishu', name: '飞书测试', enabled: true, url: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc1234', secret: '' },
      ],
      ...configPatch,
    },
  });

  return {
    lsClient,
    watchdog,
    sent,
    advanceMs(ms) {
      nowMs += ms;
    },
    getNow() {
      return nowMs;
    },
  };
}

test('启动首次扫描静默建立基线，不对历史既有 FAILED 会话补发旧账告警', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness({
    summaries: {
      'old-failed': { status: 'FAILED', stepCount: 4, summary: '历史失败任务', lastModifiedTime: '2026-11-24T10:00:00Z' },
      'active-1': { status: 'RUNNING', stepCount: 2, summary: '进行中任务', lastModifiedTime: '2026-11-25T06:00:00Z' },
    },
    quota: {
      groups: [{ displayName: 'Gemini', buckets: [{ bucketId: 'g-5h', displayName: '5h', window: '5h', remainingFraction: 0 }] }],
      models: [],
    },
  });

  await watchdog.pollOnce({ forceQuota: true });
  await watchdog.flushPending();
  assert.equal(sent.length, 0);

  // 启动后活跃任务才变为 FAILED，且在 5s 聚合窗后触发新告警
  advanceMs(15_000);
  lsClient.state.summaries['active-1'] = {
    status: 'FAILED',
    stepCount: 3,
    summary: '进行中任务',
    lastModifiedTime: '2026-11-25T06:00:15Z',
  };
  lsClient.state.projections['active-1'] = {
    summary: lsClient.state.summaries['active-1'],
    steps: [
      { index: 2, type: 'ERROR_MESSAGE', status: 'ERROR', errorSummary: { message: '403 Your region is not supported for this API' } },
    ],
  };

  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].alertEvent.category, 'region_unavailable');
  assert.equal(sent[0].alertEvent.incidents.length, 1);
  assert.equal(sent[0].alertEvent.incidents[0].conversationId, 'active-1');
});

test('短窗内多任务因地区不可用同时失败时合并成单条告警摘要', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness({
    summaries: {
      'q-1': { status: 'RUNNING', stepCount: 1, summary: '队列任务 A' },
      'q-2': { status: 'RUNNING', stepCount: 1, summary: '队列任务 B' },
    },
  });

  await watchdog.pollOnce();
  advanceMs(15_000);

  lsClient.state.summaries['q-1'] = { status: 'FAILED', stepCount: 2, summary: '队列任务 A' };
  lsClient.state.summaries['q-2'] = { status: 'FAILED', stepCount: 2, summary: '队列任务 B' };
  lsClient.state.projections['q-1'] = {
    steps: [{ index: 1, type: 'ERROR_MESSAGE', status: 'ERROR', errorSummary: { message: 'Location is not available in your country' } }],
  };
  lsClient.state.projections['q-2'] = {
    steps: [{ index: 1, type: 'ERROR_MESSAGE', status: 'ERROR', errorSummary: { message: 'Location is not available in your country' } }],
  };

  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].alertEvent.category, 'region_unavailable');
  assert.equal(sent[0].alertEvent.incidents.length, 2);
});

test('瞬时重试 1~2 次自愈不告警，重试达到阈值或超时后告警并在恢复后发送已恢复通知', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness({
    summaries: {
      'conv-r': { status: 'RUNNING', stepCount: 2, summary: '订单重构' },
    },
  });

  await watchdog.pollOnce();

  // 第 1 次瞬时重试
  advanceMs(15_000);
  lsClient.state.summaries['conv-r'] = { status: 'RETRY', stepCount: 3, summary: '订单重构' };
  lsClient.state.projections['conv-r'] = {
    steps: [{ index: 2, type: 'ERROR_MESSAGE', status: 'RETRY', errorSummary: { message: 'Connection reset (attempt 1/5)', attempt: 1, maxAttempts: 5 } }],
  };
  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 0);

  // 自愈恢复成 RUNNING（无错误）
  advanceMs(10_000);
  lsClient.state.summaries['conv-r'] = { status: 'RUNNING', stepCount: 4, summary: '订单重构' };
  lsClient.state.projections['conv-r'] = {
    steps: [{ index: 3, type: 'PLANNER_RESPONSE', status: 'GENERATING', viewableAt: '2026-11-25T06:00:30Z' }],
  };
  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 0);

  // 再次重试并达到 >= 3 次阈值
  advanceMs(15_000);
  lsClient.state.summaries['conv-r'] = { status: 'RETRY', stepCount: 5, summary: '订单重构' };
  lsClient.state.projections['conv-r'] = {
    steps: [{ index: 4, type: 'ERROR_MESSAGE', status: 'RETRY', errorSummary: { message: 'ECONNRESET (attempt 3/5)', attempt: 3, maxAttempts: 5 } }],
  };
  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].alertEvent.kind, 'alert');
  assert.equal(sent[0].alertEvent.category, 'retry_stall');

  // 随后任务成功完成 -> 发送恢复通知
  advanceMs(15_000);
  lsClient.state.summaries['conv-r'] = { status: 'COMPLETED', stepCount: 6, summary: '订单重构' };
  lsClient.state.projections['conv-r'] = { steps: [{ index: 5, type: 'PLANNER_RESPONSE', status: 'COMPLETED' }] };
  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].alertEvent.kind, 'recovery');
});

test('上游等待首字静默卡死超过 180s 告警，严格排除 WAITING_FOR_USER 与 run_command', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness({
    summaries: {
      'wait-user': { status: 'RUNNING', stepCount: 2, summary: '等用户确认' },
      'run-cmd': { status: 'RUNNING', stepCount: 2, summary: '跑长编译' },
      'hang-api': { status: 'RUNNING', stepCount: 2, summary: '卡死的模型请求' },
    },
    projections: {
      'wait-user': { steps: [{ index: 1, type: 'USER_INPUT', status: 'WAITING_FOR_USER' }] },
      'run-cmd': { steps: [{ index: 1, type: 'CODE_ACTION', status: 'RUNNING', toolSummary: { name: 'run_command' } }] },
      'hang-api': { steps: [{ index: 1, type: 'PLANNER_RESPONSE', status: 'GENERATING', viewableAt: null }] },
    },
  });

  await watchdog.pollOnce();

  // 推进 200 秒均无步骤推进
  advanceMs(200_000);
  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].alertEvent.category, 'silent_stall');
  assert.equal(sent[0].alertEvent.incidents.length, 1);
  assert.equal(sent[0].alertEvent.incidents[0].conversationId, 'hang-api');
});

test('配额归零与 Language Server 失联超 30s 告警、冷却防重及恢复闭环', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness({
    summaries: { c1: { status: 'IDLE', stepCount: 1, summary: '主会话' } },
    quota: {
      groups: [{ displayName: 'Gemini Models', buckets: [{ bucketId: 'g-5h', displayName: '5h Limit', window: '5h', remainingFraction: 0.4, resetTime: '2026-11-25T10:00:00Z' }] }],
      models: [{ rawModel: 'm1', display: 'Gemini 4', modelId: 'gemini-4', disabled: false }],
    },
  });

  await watchdog.pollOnce({ forceQuota: true });

  // 配额归零
  advanceMs(60_000);
  lsClient.state.quota.groups[0].buckets[0].remainingFraction = 0;
  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].alertEvent.category, 'quota_exhausted');

  // LS 连续失联 35s -> 触发 ls_unreachable
  lsClient.state.summariesError = new Error('Language Server unavailable');
  advanceMs(15_000);
  await watchdog.pollOnce(); // 首次失联 0s，不告警
  advanceMs(35_000);
  await watchdog.pollOnce(); // 持续失联 35s -> 告警
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].alertEvent.category, 'ls_unreachable');

  // LS 恢复且配额恢复 -> 推送两条恢复或合并恢复通知
  lsClient.state.summariesError = null;
  lsClient.state.quota.groups[0].buckets[0].remainingFraction = 1;
  advanceMs(60_000);
  await watchdog.pollOnce({ forceQuota: true });
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.ok(sent.slice(2).some((s) => s.alertEvent.kind === 'recovery'));
});

test('sendTestAlert 立即可验证通道连通性且投递记录严格封顶 20 条', async () => {
  const { watchdog, sent } = createHarness();
  for (let i = 0; i < 25; i++) {
    await watchdog.sendTestAlert();
  }
  assert.equal(sent.length, 25);
  const status = watchdog.getStatus();
  assert.equal(status.recentDeliveries.length, 20);
  assert.equal(status.recentDeliveries[0].kind, 'test');
});

test('同故障指纹在 10 分钟冷却期内不重复刷屏且 PanelService 快照严格脱敏通道凭据', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness(
    {
      summaries: { c1: { status: 'RUNNING', stepCount: 1, summary: '测试会话' } },
      quota: {
        groups: [{ displayName: 'Gemini', buckets: [{ bucketId: 'b1', displayName: '5h', window: '5h', remainingFraction: 0.5 }] }],
        models: [],
      },
    },
    { notifyRecovery: false },
  );

  await watchdog.pollOnce({ forceQuota: true });
  advanceMs(60_000);
  lsClient.state.quota.groups[0].buckets[0].remainingFraction = 0;
  await watchdog.pollOnce({ forceQuota: true });
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 1);

  // 短暂恢复后 2 分钟再次归零（仍在 10 分钟冷却期内）-> 应被冷却抑制
  advanceMs(60_000);
  lsClient.state.quota.groups[0].buckets[0].remainingFraction = 1;
  await watchdog.pollOnce({ forceQuota: true });
  advanceMs(60_000);
  lsClient.state.quota.groups[0].buckets[0].remainingFraction = 0;
  await watchdog.pollOnce({ forceQuota: true });
  advanceMs(5_500);
  await watchdog.flushPending();
  assert.equal(sent.length, 1);

  // PanelService 快照与偏好读取必须完全脱敏 Webhook URL 与密钥
  const dir = await mkdtemp(join(tmpdir(), 'tl-wd-svc-'));
  try {
    const prefs = new PreferencesStore(dir);
    const service = new PanelService({ lsClient, prefs, paths: { dataDir: dir, appDataCandidates: [] }, watchdog });
    await service.updatePreferences({
      watchdog: {
        enabled: true,
        channels: [
          {
            id: 'feishu-1',
            type: 'feishu',
            name: '飞书',
            enabled: true,
            url: 'https://open.feishu.cn/open-apis/bot/v2/hook/private-token-9988',
            secret: 'super-secret-7766',
          },
        ],
      },
    });

    const snap = await service.getSnapshot({ conversationId: null });
    const snapJson = JSON.stringify(snap);
    assert.ok(!snapJson.includes('private-token-9988'));
    assert.ok(!snapJson.includes('super-secret-7766'));
    assert.equal(snap.preferences.watchdog.channels[0].hasSecret, true);

    const testRes = await service.testWatchdogChannel({ channelId: 'feishu-1' });
    assert.equal(testRes.ok, true);
    assert.equal(service.getWatchdogStatus().enabledChannelCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('忽略已归档会话、聚合运行中子代理失败、识别纯 403 并捕获新增禁用模型', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness({
    summaries: {
      archived: { status: 'RUNNING', archived: true, stepCount: 1, summary: '已归档会话' },
      parent: { status: 'RUNNING', stepCount: 2, summary: '主协调会话' },
      'child-1': {
        status: 'FAILED',
        stepCount: 2,
        summary: '子代理执行',
        trajectoryMetadata: { parentConversationId: 'parent', rootConversationId: 'parent', subagentSpec: { role: 'Researcher' } },
      },
      'retry-403': { status: 'RUNNING', stepCount: 1, summary: '403 测试任务' },
    },
    projections: {
      'child-1': { steps: [{ index: 1, type: 'ERROR_MESSAGE', status: 'ERROR', errorSummary: { message: 'HTTP 403 Forbidden' } }] },
    },
    quota: { groups: [], models: [{ rawModel: 'm1', display: 'Model A', modelId: 'm1', disabled: false }] },
  });

  // 基线时只有 parent/archived/retry-403，稍后触发新事件
  delete lsClient.state.summaries['child-1'];
  await watchdog.pollOnce({ forceQuota: true });

  advanceMs(15_000);
  // 1) 已归档会话变成 FAILED 不应告警
  lsClient.state.summaries.archived = { status: 'FAILED', archived: true, stepCount: 2, summary: '已归档会话' };
  // 2) 运行中主会话下的子代理失败应聚合告警
  lsClient.state.summaries['child-1'] = {
    status: 'FAILED',
    stepCount: 2,
    summary: '子代理执行',
    trajectoryMetadata: { parentConversationId: 'parent', rootConversationId: 'parent', subagentSpec: { role: 'Researcher' } },
  };
  // 3) 纯 403 重试立即触发 auth_error
  lsClient.state.summaries['retry-403'] = { status: 'RETRY', stepCount: 2, summary: '403 测试任务' };
  lsClient.state.projections['retry-403'] = {
    steps: [{ index: 1, type: 'ERROR_MESSAGE', status: 'RETRY', errorSummary: { message: 'HTTP 403 Forbidden', attempt: 1 } }],
  };
  // 4) 新增一个初始即 disabled 的模型
  lsClient.state.quota.models.push({ rawModel: 'm-new', display: 'New Model', modelId: 'm-new', disabled: true });

  await watchdog.pollOnce({ forceQuota: true });
  advanceMs(5_500);
  await watchdog.flushPending();

  const categories = new Set(sent.map((s) => s.alertEvent.category));
  assert.ok(categories.has('auth_error'));
  assert.ok(categories.has('model_disabled'));
  const authEvent = sent.find((s) => s.alertEvent.category === 'auth_error');
  assert.equal(authEvent.alertEvent.incidents.length, 2);
  assert.ok(authEvent.alertEvent.incidents.every((inc) => inc.conversationId !== 'archived'));
});

test('识别真实 CASCADE_RUN_STATUS_* 枚举及异常终止后回落 IDLE 的末尾错误步', async () => {
  const { watchdog, sent, lsClient, advanceMs } = createHarness({
    summaries: {
      'hist-idle-err': {
        status: 'CASCADE_RUN_STATUS_IDLE',
        stepCount: 5,
        summary: '历史错误会话',
        lastModifiedTime: '2026-11-25T07:00:00Z',
      },
      'term-idle': {
        status: 'CASCADE_RUN_STATUS_RUNNING',
        stepCount: 6,
        summary: '熟悉交接文档',
        lastModifiedTime: '2026-11-25T07:50:00Z',
      },
      'normal-idle': {
        status: 'CASCADE_RUN_STATUS_RUNNING',
        stepCount: 3,
        summary: '正常结束会话',
        lastModifiedTime: '2026-11-25T07:50:00Z',
      },
    },
    projections: {
      'hist-idle-err': {
        steps: [
          {
            index: 4,
            type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE',
            status: 'CORTEX_STEP_STATUS_DONE',
            errorSummary: { message: 'Error Unknown: Agent execution terminated due to error.' },
          },
        ],
      },
    },
  });

  // 1) 基线扫描不补发历史错误
  await watchdog.pollOnce();
  await watchdog.flushPending();
  assert.equal(sent.length, 0);

  // 2) 运行中会话因未知错误终止并直接回到 CASCADE_RUN_STATUS_IDLE，正常结束会话回到 IDLE 不误报
  advanceMs(15_000);
  lsClient.state.summaries['term-idle'] = {
    status: 'CASCADE_RUN_STATUS_IDLE',
    stepCount: 7,
    summary: '熟悉交接文档',
    lastModifiedTime: '2026-11-25T07:50:15Z',
  };
  lsClient.state.projections['term-idle'] = {
    summary: lsClient.state.summaries['term-idle'],
    steps: [
      { index: 5, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE' },
      {
        index: 6,
        type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE',
        status: 'CORTEX_STEP_STATUS_ERROR',
        errorSummary: { message: 'Error Unknown: Agent execution terminated due to error.' },
      },
    ],
  };

  lsClient.state.summaries['normal-idle'] = {
    status: 'CASCADE_RUN_STATUS_IDLE',
    stepCount: 4,
    summary: '正常结束会话',
    lastModifiedTime: '2026-11-25T07:50:15Z',
  };
  lsClient.state.projections['normal-idle'] = {
    summary: lsClient.state.summaries['normal-idle'],
    steps: [
      { index: 3, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE' },
    ],
  };

  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].alertEvent.category, 'task_failed');
  assert.equal(sent[0].alertEvent.incidents.length, 1);
  assert.equal(sent[0].alertEvent.incidents[0].conversationId, 'term-idle');

  // 3) 同一会话后续恢复并正常完成时发送已恢复通知
  advanceMs(15_000);
  lsClient.state.summaries['term-idle'] = {
    status: 'CASCADE_RUN_STATUS_IDLE',
    stepCount: 8,
    summary: '熟悉交接文档',
    lastModifiedTime: '2026-11-25T07:50:30Z',
  };
  lsClient.state.projections['term-idle'] = {
    summary: lsClient.state.summaries['term-idle'],
    steps: [
      { index: 7, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE' },
    ],
  };

  await watchdog.pollOnce();
  advanceMs(5_500);
  await watchdog.flushPending();

  assert.equal(sent.length, 2);
  assert.equal(sent[1].alertEvent.kind, 'recovery');
  assert.equal(sent[1].alertEvent.category, 'task_failed');
});
