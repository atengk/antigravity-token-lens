/**
 * metrics.mjs 核心计算引擎单元测试。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarkdownSummary,
  computeMetricsFromProjection,
  computeMetricsFromTranscript,
  finalizeSnapshot,
  parseDurationSec,
  resolveModelInfo,
} from '../metrics.mjs';

test('parseDurationSec 支持秒字符串、毫秒字符串与异常值防御', () => {
  assert.ok(Math.abs(parseDurationSec('8.772352700s') - 8.7723527) < 1e-6);
  assert.equal(parseDurationSec('450ms'), 0.45);
  assert.equal(parseDurationSec(3.5), 3.5);
  assert.equal(parseDurationSec('-1s'), null);
  assert.equal(parseDurationSec(''), null);
  assert.equal(parseDurationSec(null), null);
});

test('resolveModelInfo 优先使用可读显示名并正确映射占位符', () => {
  const m1 = resolveModelInfo('MODEL_PLACEHOLDER_M528', 'Gemini 4 Hydrogen (XHigh)', 'gemini-4-hydrogen');
  assert.equal(m1.key, 'gemini-4-hydrogen');
  assert.equal(m1.display, 'Gemini 4 Hydrogen (XHigh)');

  const m2 = resolveModelInfo('MODEL_PLACEHOLDER_M318', null, null);
  assert.equal(m2.key, 'gemini-3.8-flash');
});

test('computeMetricsFromProjection 精确分离流式速率与 TTFT、拆解 Breakdown 与缓存重建标记', () => {
  const proj = {
    summary: {
      summary: 'Test Conv',
      status: 'CASCADE_RUN_STATUS_IDLE',
      stepCount: 6,
      createdTime: '2026-11-16T01:00:00Z',
      lastModifiedTime: '2026-11-16T01:02:00Z',
    },
    steps: [
      { index: 0, type: 'USER_INPUT', status: 'DONE', createdAt: '2026-11-16T01:00:00Z' },
      { index: 1, type: 'PLANNER_RESPONSE', status: 'DONE', createdAt: '2026-11-16T01:00:01Z' },
      { index: 2, type: 'USER_INPUT', status: 'DONE', createdAt: '2026-11-16T01:00:20Z' },
      { index: 3, type: 'PLANNER_RESPONSE', status: 'DONE', createdAt: '2026-11-16T01:00:21Z' },
      { index: 4, type: 'USER_INPUT', status: 'DONE', createdAt: '2026-11-16T01:01:00Z' },
      { index: 5, type: 'PLANNER_RESPONSE', status: 'DONE', createdAt: '2026-11-16T01:01:01Z' },
    ],
    generatorMetadata: [
      {
        index: 0,
        stepIndices: [1],
        model: 'MODEL_PLACEHOLDER_M528',
        modelDisplayName: 'Gemini 4 Hydrogen (XHigh)',
        responseModel: 'gemini-4-hydrogen',
        timeToFirstToken: '10.0s',
        streamingDuration: '2.0s',
        usage: {
          inputTokens: 20000,
          cacheReadTokens: 0,
          outputTokens: 400,
          thinkingOutputTokens: 100,
          responseOutputTokens: 300,
        },
        contextWindow: { estimatedTokensUsed: 20400, maxContextTokens: 512000 },
      },
      {
        index: 1,
        stepIndices: [3],
        model: 'MODEL_PLACEHOLDER_M528',
        modelDisplayName: 'Gemini 4 Hydrogen (XHigh)',
        responseModel: 'gemini-4-hydrogen',
        timeToFirstToken: '5.0s',
        streamingDuration: '4.0s',
        usage: {
          inputTokens: 2000,
          cacheReadTokens: 20000,
          outputTokens: 800,
          thinkingOutputTokens: 200,
          responseOutputTokens: 600,
        },
        contextWindow: { estimatedTokensUsed: 22800, maxContextTokens: 512000 },
      },
      {
        index: 2,
        stepIndices: [5],
        model: 'MODEL_PLACEHOLDER_M528',
        modelDisplayName: 'Gemini 4 Hydrogen (XHigh)',
        responseModel: 'gemini-4-hydrogen',
        timeToFirstToken: '15.0s',
        streamingDuration: '5.0s',
        usage: {
          inputTokens: 420000,
          cacheReadTokens: 20000,
          outputTokens: 1000,
          thinkingOutputTokens: 300,
          responseOutputTokens: 700,
        },
        contextWindow: {
          estimatedTokensUsed: 441000,
          maxContextTokens: 512000,
          tokenBreakdown: {
            totalTokens: 441000,
            groups: [
              { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 20000, children: [{ name: 'user_rules', numTokens: 6000 }] },
              { name: 'Tools', type: 'TOKEN_TYPE_TOOLS', numTokens: 8000, children: [{ name: 'swarm', numTokens: 1600 }] },
              { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', numTokens: 413000, children: [{ name: '4: USER_INPUT', numTokens: 300000 }, { name: '2: GENERIC', numTokens: 113000 }] },
            ],
          },
        },
      },
    ],
  };

  const prefs = { lang: 'zh-CN', warnAt: 70, criticalAt: 85, contextLimitOverrides: {} };
  const m = computeMetricsFromProjection('conv-1', proj, prefs);

  // 最新一轮流式速率 1000 / 5.0 = 200.0 tok/s，而非含 TTFT 的 50 tok/s
  assert.equal(m.throughput.latestStreamingTps, 200);
  assert.equal(m.throughput.latestTtftSec, 15);
  assert.equal(m.throughput.latestE2eTps, 50);
  assert.equal(m.throughput.latestThinkingTokens, 300);
  assert.equal(m.throughput.latestResponseTokens, 700);
  // 平均流式速率：(400 + 800 + 1000) / (2 + 4 + 5) = 200
  assert.equal(m.throughput.avgStreamingTps, 200);
  assert.equal(m.throughput.peakStreamingTps, 200);

  // 第 2 轮命中率 20000/22000 = 90.9%，第 3 轮骤降至 20000/440000 = 4.5% -> 应触发缓存重建标记
  assert.equal(m.cache.rebuildCount, 1);
  assert.equal(m.turns[0].cacheRebuilt, true);

  // 上下文水位优先采信服务端实测输入 440000 / 512000 = 85.94% -> critical，同时保留预估差值
  assert.equal(m.context.usedTokens, 440000);
  assert.equal(m.context.usedSource, 'measured');
  assert.equal(m.context.preflightTokens, 441000);
  assert.equal(m.context.estimationDelta, -1000);
  assert.equal(m.context.alertLevel, 'critical');
  assert.equal(m.context.maxSource, 'host');
  assert.equal(m.context.breakdown.topMessages[0].name, '4: USER_INPUT');

  // 验证汇总与 Markdown 报告生成
  const final = finalizeSnapshot(m, [
    {
      id: 'sub-1',
      role: 'Researcher',
      totals: { uncachedInput: 1000, cacheRead: 2000, cacheWrite: 0, output: 500, totalTokens: 3500 },
    },
  ]);
  assert.equal(final.totals.subagentCount, 1);
  assert.equal(final.totals.subagents.totalTokens, 3500);
  assert.equal(final.totals.grand.totalTokens, final.totals.main.totalTokens + 3500);
  assert.match(final.markdownSummary, /Gemini 4 Hydrogen \(XHigh\)/);
});

test('极短耗时与零输入边界不产生 Infinity 或 NaN', () => {
  const proj = {
    summary: { status: 'IDLE', stepCount: 1 },
    steps: [{ index: 0, type: 'PLANNER_RESPONSE', status: 'DONE' }],
    generatorMetadata: [
      {
        index: 0,
        stepIndices: [0],
        model: 'test-model',
        streamingDuration: '0.01s',
        usage: { inputTokens: 0, cacheReadTokens: 0, outputTokens: 10 },
      },
    ],
  };

  const m = computeMetricsFromProjection('conv-zero', proj, { warnAt: 70, criticalAt: 85, contextLimitOverrides: { 'conv-zero': 100000 } });
  assert.equal(m.throughput.latestStreamingTps, null);
  assert.equal(m.cache.cumulativeHitRate, null);
  assert.equal(m.context.maxTokens, 100000);
  assert.equal(m.context.maxSource, 'override');
});

test('computeMetricsFromTranscript 正确回退估算离线会话指标', () => {
  const local = {
    modelHint: 'Gemini 4 Hydrogen (High)',
    titleHint: '离线测试会话',
    steps: [
      { stepIndex: 0, type: 'USER_INPUT', createdAt: '2026-11-16T01:00:00Z', createdAtMs: 1000, inputTokens: null, cacheReadTokens: null, outputTokens: null },
      { stepIndex: 1, type: 'PLANNER_RESPONSE', createdAt: '2026-11-16T01:00:02Z', createdAtMs: 3000, inputTokens: 5000, cacheReadTokens: 15000, outputTokens: 200 },
      { stepIndex: 2, type: 'GENERIC', createdAt: '2026-11-16T01:00:06Z', createdAtMs: 7000, inputTokens: null, cacheReadTokens: null, outputTokens: null },
    ],
  };
  const m = computeMetricsFromTranscript('conv-off', local, { warnAt: 70, criticalAt: 85 });
  assert.equal(m.source, 'transcript');
  assert.equal(m.estimatedSpeed, true);
  assert.equal(m.throughput.latestStreamingTps, 50);
  assert.equal(m.cache.cumulativeHitRate, 0.75);
  assert.equal(m.context.usedTokens, 20000);
  assert.equal(m.context.maxTokens, 512000);
});

test('峰值毛刺过滤、步骤友好标签、缓存跌落检测、重试统计与工具诊断汇总', () => {
  const proj = {
    summary: { status: 'IDLE', stepCount: 6 },
    steps: [
      { index: 0, type: 'CORTEX_STEP_TYPE_USER_INPUT', status: 'DONE', userPreview: '请帮我排查缓存失效问题' },
      { index: 1, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'DONE', toolCallCount: 1, createdAt: '2026-11-16T01:00:01Z' },
      {
        index: 2,
        type: 'CORTEX_STEP_TYPE_VIEW_FILE',
        status: 'DONE',
        startedAt: '2026-11-16T01:00:02Z',
        completedAt: '2026-11-16T01:00:03.5Z',
        toolSummary: { name: 'read_file', target: 'hooks.md', hasError: false },
      },
      { index: 3, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'DONE', toolCallCount: 1, createdAt: '2026-11-16T01:00:05Z' },
      {
        index: 4,
        type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
        status: 'DONE',
        startedAt: '2026-11-16T01:00:06Z',
        completedAt: '2026-11-16T01:00:08Z',
        toolSummary: { name: 'run_command', target: 'npm test', hasError: true, exitCode: 1 },
      },
      { index: 5, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'DONE', toolCallCount: 0, createdAt: '2026-11-16T01:00:10Z' },
    ],
    generatorMetadata: [
      {
        index: 0,
        stepIndices: [1, 2],
        model: 'MODEL_PLACEHOLDER_M525',
        plannerModelName: 'gemini-4-hydrogen-high',
        timeToFirstToken: '4.0s',
        streamingDuration: '0.07s',
        usage: { inputTokens: 1000, cacheReadTokens: 19000, outputTokens: 500 },
        contextWindow: { estimatedTokensUsed: 20500, maxContextTokens: 512000 },
      },
      {
        index: 1,
        stepIndices: [3, 4],
        model: 'MODEL_PLACEHOLDER_M525',
        plannerModelName: 'gemini-4-hydrogen-high',
        timeToFirstToken: '6.0s',
        streamingDuration: '2.0s',
        retrySummary: { count: 1, inputTokens: 5000, cacheReadTokens: 0, outputTokens: 80 },
        usage: { inputTokens: 1500, cacheReadTokens: 25000, outputTokens: 400 },
        contextWindow: { estimatedTokensUsed: 26900, maxContextTokens: 512000 },
      },
      {
        index: 2,
        stepIndices: [5],
        model: 'MODEL_PLACEHOLDER_M525',
        plannerModelName: 'gemini-4-hydrogen-high',
        rulesTokenBudget: 20000,
        customizationTokenBudget: 20000,
        timeToFirstToken: '3.0s',
        streamingDuration: '2.5s',
        usage: { inputTokens: 26000, cacheReadTokens: 7000, outputTokens: 600 },
        contextWindow: {
          estimatedTokensUsed: 33600,
          maxContextTokens: 512000,
          tokenBreakdown: {
            totalTokens: 33600,
            groups: [
              { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 10000, children: [{ name: 'user_rules', numTokens: 4000 }, { name: 'skills', numTokens: 2000 }] },
              { name: 'Tools', type: 'TOKEN_TYPE_TOOLS', numTokens: 5000, children: [{ name: 'read_file', numTokens: 300 }] },
              {
                name: 'Chat Messages',
                type: 'TOKEN_TYPE_CHAT_MESSAGES',
                numTokens: 18600,
                children: [
                  { name: '4: GENERIC', numTokens: 9000 },
                  { name: '2: GENERIC', numTokens: 6000 },
                  { name: '0: USER_INPUT', numTokens: 600 },
                ],
              },
            ],
          },
        },
      },
    ],
  };

  const m = computeMetricsFromProjection('conv-enh', proj, { warnAt: 70, criticalAt: 85 });

  // 1. 0.07s 短样本算出 7142 tok/s 不应污染峰值，峰值应取稳定样本（600/2.5 = 240）
  assert.equal(m.throughput.peakStreamingTps, 240);
  assert.equal(m.turns[2].isShortSample, true);
  assert.equal(m.turns[0].isShortSample, false);

  // 2. 94.3% (25K/26.5K) 骤降到 21.2% (7K/33K) 应触发缓存重建标记，且 cache.series 完整
  assert.equal(m.cache.rebuildCount, 1);
  assert.equal(m.turns[0].cacheRebuilt, true);
  assert.equal(m.cache.series.length, 3);

  // 3. Top 10 步骤获得人类可读标签，并按步骤类型归因
  assert.equal(m.context.breakdown.topMessages[0].name, '4: GENERIC');
  assert.match(m.context.breakdown.topMessages[0].label, /run_command.*npm test/);
  assert.equal(m.context.breakdown.topMessages[0].hasError, true);

  // 4. 重试消耗与轮次工具标签
  assert.equal(m.diagnostics.retry.count, 1);
  assert.equal(m.diagnostics.retry.totalTokens, 5080);
  assert.equal(m.turns[1].retryCount, 1);
  assert.deepEqual(m.turns[1].tools, [{ name: 'run_command', count: 1, hasError: true }]);

  // 5. 续航预估 & 耗时分布 & 工具排行榜 & 规则预算
  assert.ok(m.context.growth.avgPerTurn > 0);
  assert.ok(m.context.growth.estTurnsToCritical > 0);
  assert.equal(m.timing.avgTtftSec, (4 + 6 + 3) / 3);
  assert.ok(Math.abs(m.timing.totalToolSec - 3.5) < 1e-6);
  assert.equal(m.diagnostics.tools[0].name, 'run_command');
  assert.equal(m.diagnostics.tools[0].contextTokens, 9000);
  assert.equal(m.diagnostics.tools[0].errorCount, 1);
  assert.equal(m.diagnostics.budgets.rulesTokenBudget, 20000);
  assert.equal(m.diagnostics.budgets.customUsedTokens, 6000);
});

test('Gemini 4 Argon 与未知模型可正确归一化 modelKey 并套用参考或自定义上限', () => {
  const argon = resolveModelInfo(null, 'Gemini 4 Argon (High)', null);
  assert.equal(argon.key, 'gemini-4-argon');
  assert.equal(argon.display, 'Gemini 4 Argon (High)');

  const custom = resolveModelInfo(null, 'Future Model X (Ultra)', null);
  assert.equal(custom.key, 'future-model-x');

  const m = computeMetricsFromTranscript(
    'conv-argon',
    {
      modelHint: 'Gemini 4 Argon (High)',
      titleHint: 'Argon 会话',
      steps: [
        { stepIndex: 0, type: 'USER_INPUT', createdAt: '2026-11-16T01:00:00Z', createdAtMs: 1000 },
        { stepIndex: 1, type: 'PLANNER_RESPONSE', createdAt: '2026-11-16T01:00:02Z', createdAtMs: 3000, inputTokens: 120000, cacheReadTokens: 0, outputTokens: 300 },
        { stepIndex: 2, type: 'GENERIC', createdAt: '2026-11-16T01:00:06Z', createdAtMs: 7000 },
      ],
    },
    { warnAt: 70, criticalAt: 85, contextLimitOverrides: {} },
  );
  assert.equal(m.context.maxTokens, 512000);
  assert.equal(m.context.maxSource, 'reference');
});

test('computeMetricsFromProjection 准确识别重试等待、重连首字前与恢复流式状态', () => {
  const baseMeta = [{ index: 0, stepIndices: [1], model: 'MODEL_PLACEHOLDER_M528', usage: { inputTokens: 1000, outputTokens: 100 } }];
  const prefs = { warnAt: 70, criticalAt: 85 };

  // 1. 退避等待中：尾部为 ERROR_MESSAGE (DONE)，总状态仍为 RUNNING
  const mRetrying = computeMetricsFromProjection(
    'conv-retry-1',
    {
      summary: { status: 'CASCADE_RUN_STATUS_RUNNING', lastModifiedTime: '2026-11-19T01:27:07Z', stepCount: 4 },
      steps: [
        { index: 0, type: 'CORTEX_STEP_TYPE_USER_INPUT', status: 'DONE', createdAt: '2026-11-19T01:20:00Z' },
        { index: 1, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'DONE', createdAt: '2026-11-19T01:20:01Z' },
        { index: 2, type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE', status: 'DONE', createdAt: '2026-11-19T01:25:06Z', errorSummary: { attempt: 6, message: 'EOF' } },
        { index: 3, type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE', status: 'DONE', createdAt: '2026-11-19T01:27:07Z', errorSummary: { attempt: 7, maxAttempts: 9, message: 'Model unavailable' } },
      ],
      generatorMetadata: baseMeta,
    },
    prefs,
  );
  assert.equal(mRetrying.conversation.isRunning, true);
  assert.equal(mRetrying.activeRun?.phase, 'retrying');
  assert.equal(mRetrying.activeRun?.retryAttempt, 7);
  assert.equal(mRetrying.activeRun?.retryMaxAttempts, 9);
  assert.equal(mRetrying.activeRun?.startedAtMs, Date.parse('2026-11-19T01:27:07Z'));

  // 2. 重试新请求已发出但未吐出首字：仍保持 retrying；一旦拿到 viewableAt 则切为 streaming
  const mPendingRetry = computeMetricsFromProjection(
    'conv-retry-2',
    {
      summary: { status: 'CASCADE_RUN_STATUS_RUNNING', lastModifiedTime: '2026-11-19T01:29:55Z', stepCount: 4 },
      steps: [
        { index: 0, type: 'CORTEX_STEP_TYPE_USER_INPUT', status: 'DONE', createdAt: '2026-11-19T01:20:00Z' },
        { index: 1, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'DONE', createdAt: '2026-11-19T01:20:01Z' },
        { index: 2, type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE', status: 'DONE', createdAt: '2026-11-19T01:27:07Z', errorSummary: { attempt: 7, message: 'EOF' } },
        { index: 3, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'GENERATING', createdAt: '2026-11-19T01:29:55Z', viewableAt: null },
      ],
      generatorMetadata: baseMeta,
    },
    prefs,
  );
  assert.equal(mPendingRetry.activeRun?.phase, 'retrying');
  assert.equal(mPendingRetry.activeRun?.retryAttempt, 7);

  const mRecoveredStream = computeMetricsFromProjection(
    'conv-retry-3',
    {
      summary: { status: 'CASCADE_RUN_STATUS_RUNNING', lastModifiedTime: '2026-11-19T01:29:58Z', stepCount: 4 },
      steps: [
        { index: 0, type: 'CORTEX_STEP_TYPE_USER_INPUT', status: 'DONE', createdAt: '2026-11-19T01:20:00Z' },
        { index: 1, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'DONE', createdAt: '2026-11-19T01:20:01Z' },
        { index: 2, type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE', status: 'DONE', createdAt: '2026-11-19T01:27:07Z', errorSummary: { attempt: 7, message: 'EOF' } },
        { index: 3, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'GENERATING', createdAt: '2026-11-19T01:29:55Z', viewableAt: '2026-11-19T01:29:58Z' },
      ],
      generatorMetadata: baseMeta,
    },
    prefs,
  );
  assert.equal(mRecoveredStream.activeRun?.phase, 'streaming');

  // 3. 历史轮次曾出错但当前进入正常工具执行，不应误报 retrying 或 streaming
  const mToolRunning = computeMetricsFromProjection(
    'conv-tool-run',
    {
      summary: { status: 'CASCADE_RUN_STATUS_RUNNING', lastModifiedTime: '2026-11-19T01:30:10Z', stepCount: 4 },
      steps: [
        { index: 0, type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE', status: 'DONE', createdAt: '2026-11-19T01:27:07Z', errorSummary: { attempt: 7, message: 'EOF' } },
        { index: 1, type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'DONE', createdAt: '2026-11-19T01:29:55Z' },
        { index: 2, type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'RUNNING', createdAt: '2026-11-19T01:30:00Z', viewableAt: '2026-11-19T01:30:01Z' },
      ],
      generatorMetadata: baseMeta,
    },
    prefs,
  );
  assert.equal(mToolRunning.activeRun?.phase, 'waiting');
});

test('在线模型目录动态映射、连字符版本识别与宿主有效上限兜底（ADR-0001）', () => {
  const catalog = [
    { rawModel: 'MODEL_PLACEHOLDER_M999', display: 'Gemini 4 Neon (Ultra)', modelId: 'gemini-4-neon-ultra', disabled: false },
  ];

  // 1. 动态目录匹配未写入静态表的最新占位符
  const dynamicNeon = resolveModelInfo('MODEL_PLACEHOLDER_M999', null, null, catalog);
  assert.equal(dynamicNeon.key, 'gemini-4-neon');
  assert.equal(dynamicNeon.display, 'Gemini 4 Neon (Ultra)');

  // 2. 连字符 Claude 5.5 modelId 不应误落入 4.6
  const claude55 = resolveModelInfo(null, null, 'claude-sonnet-5-5-high');
  assert.equal(claude55.key, 'claude-sonnet-5.5');

  // 3. 离线兜底统一采用 512K 宿主有效上限（Neon / Orchestrator / 3.8 Flash / Claude 5.5）
  for (const hint of ['MODEL_PLACEHOLDER_M532', 'MODEL_PLACEHOLDER_M537', 'MODEL_PLACEHOLDER_M318', 'MODEL_PLACEHOLDER_M405']) {
    const m = computeMetricsFromTranscript(
      `conv-${hint}`,
      {
        rawModelHint: hint,
        modelHint: 'Gemini 4 Argon (High)',
        steps: [
          { stepIndex: 0, type: 'PLANNER_RESPONSE', createdAtMs: 1000, inputTokens: 10000, cacheReadTokens: 0, outputTokens: 100 },
        ],
      },
      { warnAt: 70, criticalAt: 85 },
    );
    assert.equal(m.context.maxTokens, 512000);
    assert.equal(m.context.maxSource, 'reference');
  }
});

test('上下文占用优先采信实测输入并在生成中空档期平滑回退宿主预估（ADR-0002）', () => {
  const prefs = { warnAt: 70, criticalAt: 85 };

  // 1. 首轮已完成：LS 预估 29521，服务端实测 21237 -> 主卡显示 21237，Δ = -8284
  const settled = computeMetricsFromProjection(
    'conv-measured',
    {
      summary: { status: 'CASCADE_RUN_STATUS_IDLE', stepCount: 2 },
      steps: [
        { index: 0, type: 'USER_INPUT', status: 'DONE' },
        { index: 1, type: 'PLANNER_RESPONSE', status: 'DONE' },
      ],
      generatorMetadata: [
        {
          index: 0,
          stepIndices: [1],
          model: 'MODEL_PLACEHOLDER_M525',
          usage: { inputTokens: 21237, cacheReadTokens: 0, outputTokens: 1585 },
          contextWindow: { estimatedTokensUsed: 29521, maxContextTokens: 512000 },
        },
      ],
    },
    prefs,
  );
  assert.equal(settled.context.usedTokens, 21237);
  assert.equal(settled.context.usedSource, 'measured');
  assert.equal(settled.context.preflightTokens, 29521);
  assert.equal(settled.context.estimationDelta, -8284);

  // 2. 新一轮刚发出请求尚未返回 usage（全 0 / 空）-> 捕获新轮 preflight 34000
  const running = computeMetricsFromProjection(
    'conv-running-preflight',
    {
      summary: { status: 'CASCADE_RUN_STATUS_RUNNING', stepCount: 4 },
      steps: [
        { index: 0, type: 'USER_INPUT', status: 'DONE' },
        { index: 1, type: 'PLANNER_RESPONSE', status: 'DONE' },
        { index: 2, type: 'USER_INPUT', status: 'DONE' },
        { index: 3, type: 'PLANNER_RESPONSE', status: 'GENERATING' },
      ],
      generatorMetadata: [
        {
          index: 0,
          stepIndices: [1],
          model: 'MODEL_PLACEHOLDER_M525',
          usage: { inputTokens: 21237, cacheReadTokens: 0, outputTokens: 1585 },
          contextWindow: { estimatedTokensUsed: 29521, maxContextTokens: 512000 },
        },
        {
          index: 1,
          stepIndices: [3],
          model: 'MODEL_PLACEHOLDER_M532',
          modelDisplayName: 'Gemini 4 Neon (High)',
          usage: null,
          contextWindow: { estimatedTokensUsed: 34000, maxContextTokens: 512000 },
        },
      ],
    },
    prefs,
  );
  assert.equal(running.conversation.model, 'Gemini 4 Neon (High)');
  assert.equal(running.context.usedTokens, 34000);
  assert.equal(running.context.usedSource, 'preflight');
  assert.equal(running.context.estimationDelta, null);
});

test('computeMetricsFromProjection 精确识别 8 类 tokenBreakdown 原生分组并累加定制底座预算', () => {
  const proj = {
    summary: { status: 'IDLE', stepCount: 2 },
    steps: [
      { index: 0, type: 'USER_INPUT', status: 'DONE' },
      { index: 1, type: 'PLANNER_RESPONSE', status: 'DONE' },
    ],
    generatorMetadata: [
      {
        index: 0,
        stepIndices: [1],
        model: 'MODEL_PLACEHOLDER_M525',
        rulesTokenBudget: 20000,
        customizationTokenBudget: 20000,
        usage: { inputTokens: 30000, cacheReadTokens: 0, outputTokens: 200 },
        contextWindow: {
          estimatedTokensUsed: 30000,
          maxContextTokens: 512000,
          tokenBreakdown: {
            totalTokens: 30000,
            groups: [
              { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 4930, children: [{ name: 'identity', numTokens: 500 }] },
              { name: 'Mcp Tools', type: 'TOKEN_TYPE_MCP_TOOLS', numTokens: 595, children: [{ name: 'mcp_servers', numTokens: 595 }] },
              { name: 'Subagents', type: 'TOKEN_TYPE_SUBAGENTS', numTokens: 2885, children: [{ name: 'subagents', numTokens: 2885 }] },
              { name: 'Skills', type: 'TOKEN_TYPE_SKILLS', numTokens: 4077, children: [{ name: 'skills', numTokens: 4077 }] },
              { name: 'Plugins', type: 'TOKEN_TYPE_PLUGINS', numTokens: 1624, children: [{ name: 'featured_plugins', numTokens: 1624 }] },
              { name: 'Rules', type: 'TOKEN_TYPE_RULES', numTokens: 5887, children: [{ name: 'user_rules', numTokens: 5887 }] },
              { name: 'Tools', type: 'TOKEN_TYPE_TOOLS', numTokens: 9766, children: [{ name: 'read_file', numTokens: 2000 }] },
              { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', numTokens: 235, children: [{ name: '0: USER_INPUT', numTokens: 235 }] },
            ],
          },
        },
      },
    ],
  };

  const m = computeMetricsFromProjection('conv-8groups', proj, { warnAt: 70, criticalAt: 85 });
  const keys = m.context.breakdown.groups.map((g) => g.key);
  assert.deepEqual(keys, ['system', 'mcp', 'subagents', 'skills', 'plugins', 'rules', 'tools', 'chat']);
  assert.equal(m.diagnostics.budgets.customUsedTokens, 595 + 2885 + 4077 + 1624 + 5887);
});

test('finalizeSnapshot 与 buildMarkdownSummary 遵循上下文固定 K/M、统计随展示单位制的二分口径', () => {
  const proj = {
    summary: { summary: 'Unit Summary Test', status: 'IDLE', stepCount: 2 },
    steps: [
      { index: 0, type: 'USER_INPUT', status: 'DONE' },
      { index: 1, type: 'PLANNER_RESPONSE', status: 'DONE' },
    ],
    generatorMetadata: [
      {
        index: 0,
        stepIndices: [1],
        model: 'MODEL_PLACEHOLDER_M525',
        modelDisplayName: 'Gemini 4 Hydrogen (High)',
        streamingDuration: '2.0s',
        timeToFirstToken: '1.0s',
        usage: { inputTokens: 20000, cacheReadTokens: 420000, outputTokens: 1000 },
        contextWindow: {
          estimatedTokensUsed: 440000,
          maxContextTokens: 512000,
          tokenBreakdown: {
            totalTokens: 440000,
            groups: [
              { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 20000, children: [] },
              { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', numTokens: 420000, children: [] },
            ],
          },
        },
      },
    ],
  };

  const primary = computeMetricsFromProjection('conv-unit', proj, { warnAt: 70, criticalAt: 85 });

  const zhAuto = finalizeSnapshot(primary, [], { lang: 'zh-CN', unitSystem: 'auto' });
  assert.match(zhAuto.markdownSummary, /\*\*上下文水位\*\*: 440\.0K \/ 512\.0K/);
  assert.match(zhAuto.markdownSummary, /\*\*上下文构成\*\*: System Prompt: 20\.0K \(4\.5%\) \| Chat Messages: 420\.0K \(95\.5%\)/);
  assert.match(zhAuto.markdownSummary, /已节省 42\.0万 tok/);
  assert.match(zhAuto.markdownSummary, /\*\*会话总消耗\*\*: 44\.1万 \(主会话 44\.1万/);

  const zhIntl = finalizeSnapshot(primary, [], { lang: 'zh-CN', unitSystem: 'intl' });
  assert.match(zhIntl.markdownSummary, /\*\*上下文水位\*\*: 440\.0K \/ 512\.0K/);
  assert.match(zhIntl.markdownSummary, /已节省 420\.0K tok/);
  assert.match(zhIntl.markdownSummary, /\*\*会话总消耗\*\*: 441\.0K/);

  const enZh = finalizeSnapshot(primary, [], { lang: 'en', unitSystem: 'zh' });
  assert.match(enZh.markdownSummary, /\*\*Context\*\*: 440\.0K \/ 512\.0K/);
  assert.match(enZh.markdownSummary, /Saved 42\.0万 tok/);
  assert.match(enZh.markdownSummary, /\*\*Session Total\*\*: 44\.1万/);

  const legacyEn = buildMarkdownSummary(zhAuto, 'en');
  assert.match(legacyEn, /\*\*Context\*\*: 440\.0K \/ 512\.0K/);
  assert.match(legacyEn, /Saved 420\.0K tok/);
});
