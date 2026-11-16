/**
 * metrics.mjs 核心计算引擎单元测试。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

  // 上下文水位 441000 / 512000 = 86.13% -> critical
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
