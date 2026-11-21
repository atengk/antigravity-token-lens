/**
 * ls-client.mjs 单元测试：覆盖重文本剥离、增量切片拉取、压缩重建与 LRU 内存淘汰。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LanguageServerClient,
  buildModelCatalogFromUserStatus,
  matchProcessAndPort,
  parseLoopbackAddress,
  projectGeneratorMeta,
  projectStep,
} from '../ls-client.mjs';

test('projectStep 与 projectGeneratorMeta 彻底剥离重文本字段', () => {
  const step = projectStep(
    {
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      thinking: '超长推理内容'.repeat(500),
      plannerResponse: { text: '超长输出'.repeat(500) },
      metadata: {
        createdAt: '2026-11-16T01:00:00Z',
        viewableAt: '2026-11-16T01:00:05Z',
        finishedGeneratingAt: '2026-11-16T01:00:08Z',
      },
    },
    3,
  );
  assert.equal(step.thinking, undefined);
  assert.equal(step.plannerResponse, undefined);
  assert.equal(step.index, 3);
  assert.equal(step.viewableAt, '2026-11-16T01:00:05Z');

  const gm = projectGeneratorMeta(
    {
      stepIndices: [3],
      chatModel: {
        systemPrompt: 'huge system prompt',
        messagePrompts: ['huge msg'],
        tools: [{ name: 'big_tool' }],
        modelDisplayName: 'Gemini 4 Hydrogen (XHigh)',
        streamingDuration: '3.0s',
        usage: { inputTokens: '100', outputTokens: '50' },
      },
    },
    0,
  );
  const serialized = JSON.stringify(gm);
  assert.equal(serialized.includes('huge system prompt'), false);
  assert.equal(serialized.includes('huge msg'), false);
  assert.equal(gm.usage.inputTokens, 100);
});

test('projectStep 与 projectGeneratorMeta 提取轻量工具摘要与重试信息且不泄漏大文本', () => {
  const bigCmd = 'Get-ChildItem -Path C:\\very\\long\\path ' + 'x'.repeat(200);
  const cmdStep = projectStep(
    {
      type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
      status: 'DONE',
      runCommand: {
        commandLine: bigCmd,
        combinedOutput: 'giant terminal output '.repeat(200),
        exitCode: 0,
      },
      metadata: {
        createdAt: '2026-11-16T01:00:00Z',
        startedAt: '2026-11-16T01:00:00.100Z',
        completedAt: '2026-11-16T01:00:01.300Z',
        toolCall: { name: 'run_command', argumentsJson: JSON.stringify({ CommandLine: bigCmd }) },
      },
    },
    10,
  );
  assert.equal(cmdStep.runCommand, undefined);
  assert.equal(cmdStep.toolSummary?.name, 'run_command');
  assert.ok(cmdStep.toolSummary.target.length <= 40);
  assert.equal(cmdStep.toolSummary.exitCode, 0);

  const fileStep = projectStep(
    {
      type: 'CORTEX_STEP_TYPE_VIEW_FILE',
      status: 'DONE',
      viewFile: {
        absolutePathUri: 'file:///C:/Users/demo/docs/hooks.md',
        content: 'huge file content '.repeat(300),
      },
      metadata: { toolCall: { name: 'read_file' } },
    },
    5,
  );
  assert.equal(fileStep.viewFile, undefined);
  assert.equal(fileStep.toolSummary?.name, 'read_file');
  assert.equal(fileStep.toolSummary?.target, 'hooks.md');

  const gm = projectGeneratorMeta(
    {
      stepIndices: [10],
      plannerConfig: {
        modelName: 'gemini-4-hydrogen-high',
        rulesTokenBudget: 20000,
        customizationTokenBudget: 20000,
      },
      chatModel: {
        retryInfos: [
          { usage: { inputTokens: '1200', outputTokens: '40', cacheReadTokens: '0' }, traceId: 't-1' },
          { usage: { inputTokens: '500', outputTokens: '100', cacheReadTokens: '0' }, traceId: 't-2' },
        ],
        usage: { inputTokens: '500', outputTokens: '100' },
      },
    },
    0,
  );
  assert.equal(gm.plannerModelName, 'gemini-4-hydrogen-high');
  assert.equal(gm.rulesTokenBudget, 20000);
  assert.equal(gm.retrySummary?.count, 1);
  assert.equal(gm.retrySummary?.inputTokens, 1200);
  assert.equal(gm.retrySummary?.outputTokens, 40);

  // 正常单次请求（retryInfos.length === 1）不应误判为重试
  const gmNormal = projectGeneratorMeta(
    {
      stepIndices: [11],
      chatModel: {
        retryInfos: [{ usage: { inputTokens: '500', outputTokens: '100' }, traceId: 't-ok' }],
        usage: { inputTokens: '500', outputTokens: '100' },
      },
    },
    1,
  );
  assert.equal(gmNormal.retrySummary, undefined);
});

test('LanguageServerClient 支持增量偏移合并、压缩回退与 LRU 内存淘汰', async () => {
  const calls = [];
  let remoteSummaries = {
    c1: { stepCount: 2, lastModifiedTime: 't1', status: 'RUNNING' },
  };
  let remoteSteps = [
    { type: 'USER_INPUT', status: 'DONE' },
    { type: 'PLANNER_RESPONSE', status: 'GENERATING' },
  ];
  let remoteGm = [
    { stepIndices: [1], chatModel: { usage: { inputTokens: 10, outputTokens: 20 } } },
  ];

  const client = new LanguageServerClient({
    lsAddress: '127.0.0.1:1234',
    csrfToken: 'test-token',
    budgetBytes: 900,
    requestFn: async (_ep, method, body) => {
      calls.push({ method, body });
      if (method === 'GetAllCascadeTrajectories') return { trajectorySummaries: remoteSummaries };
      if (method === 'GetCascadeTrajectorySteps') return { steps: remoteSteps.slice(body.stepOffset) };
      if (method === 'GetCascadeTrajectoryGeneratorMetadata') return { generatorMetadata: remoteGm.slice(body.generatorMetadataOffset) };
      return {};
    },
  });

  // 1. 初次拉取
  const p1 = await client.getProjection('c1', { force: true });
  assert.equal(p1.steps.length, 2);
  assert.equal(p1.generatorMetadata.length, 1);

  // 2. 增量追加（step 1 变为 DONE 且新增 step 2）
  remoteSummaries.c1 = { stepCount: 3, lastModifiedTime: 't2', status: 'IDLE' };
  remoteSteps = [
    { type: 'USER_INPUT', status: 'DONE' },
    { type: 'PLANNER_RESPONSE', status: 'DONE' },
    { type: 'USER_INPUT', status: 'DONE' },
  ];
  const p2 = await client.getProjection('c1', { force: false });
  const stepCall2 = calls.filter((c) => c.method === 'GetCascadeTrajectorySteps').at(-1);
  assert.equal(stepCall2.body.stepOffset, 1);
  assert.equal(p2.steps.length, 3);
  assert.equal(p2.steps[1].status, 'DONE');

  // 3. 发生压缩/回退（stepCount 减小到 1）-> 必须从 offset 0 全量重拉
  remoteSummaries.c1 = { stepCount: 1, lastModifiedTime: 't3', status: 'IDLE' };
  remoteSteps = [{ type: 'USER_INPUT', status: 'DONE' }];
  const p3 = await client.getProjection('c1', { force: false });
  const stepCall3 = calls.filter((c) => c.method === 'GetCascadeTrajectorySteps').at(-1);
  assert.equal(stepCall3.body.stepOffset, 0);
  assert.equal(p3.steps.length, 1);

  // 4. 注入第二个大投影触发 LRU 淘汰
  remoteSummaries.c2 = { stepCount: 1, lastModifiedTime: 't4', status: 'IDLE' };
  await client.getProjection('c2', { force: true });
  assert.ok(client.cachedBytes <= 900);
});

test('parseLoopbackAddress 保留协议标记且 matchProcessAndPort 支持 daemon hub 元数据与瞬态故障自愈', async () => {
  const epHttps = parseLoopbackAddress('https://127.0.0.1:4349');
  assert.equal(epHttps.protocol, 'https:');
  assert.equal(epHttps.port, 4349);
  assert.equal(epHttps.explicitProtocol, true);

  const epImplicit = parseLoopbackAddress('localhost:4350');
  assert.equal(epImplicit.protocol, 'http:');
  assert.equal(epImplicit.hostname, '127.0.0.1');
  assert.equal(epImplicit.explicitProtocol, false);

  const discovered = matchProcessAndPort(
    [{ ProcessId: 29068, CommandLine: 'language_server.exe --standalone --https_server_port 0 --csrf_token tok-1' }],
    'antigravity',
    [],
    [{ pid: 29068, httpPort: 4350, httpsPort: 4349, csrfToken: 'tok-1' }],
  );
  assert.deepEqual(discovered, {
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: 4350,
    csrf: 'tok-1',
    explicitProtocol: true,
  });

  // 瞬态超时后若重发现返回 null，不应销毁既有端点，下一次请求应直接恢复
  let failOnce = true;
  const client = new LanguageServerClient({
    lsAddress: 'http://127.0.0.1:4350',
    csrfToken: 'tok-1',
    discoverFn: async () => null,
    requestFn: async () => {
      if (failOnce) {
        failOnce = false;
        throw new Error('RPC timeout');
      }
      return { ok: true };
    },
  });
  await assert.rejects(() => client.call('GetAllCascadeTrajectories'), /RPC timeout/);
  const recovered = await client.call('GetAllCascadeTrajectories');
  assert.equal(recovered.ok, true);
});

test('projectStep 提取 ERROR_MESSAGE 的重试次数与轻量摘要，并忽略常规工具错误步骤', () => {
  const errStepStr = projectStep(
    {
      type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE',
      status: 'CORTEX_STEP_STATUS_DONE',
      error: 'API error (attempt 7): request failed: ' + 'x'.repeat(300),
      metadata: { createdAt: '2026-11-19T01:27:07Z' },
    },
    205,
  );
  assert.equal(errStepStr.errorSummary?.attempt, 7);
  assert.equal(errStepStr.errorSummary?.maxAttempts, null);
  assert.ok(errStepStr.errorSummary.message.length <= 122);

  const errStepObj = projectStep(
    {
      type: 'CORTEX_STEP_TYPE_ERROR_MESSAGE',
      status: 'CORTEX_STEP_STATUS_DONE',
      errorMessage: { error: { userErrorMessage: 'Model unavailable, retrying in 53s (attempt 7/9)' } },
      metadata: { createdAt: '2026-11-19T01:27:07Z' },
    },
    206,
  );
  assert.equal(errStepObj.errorSummary?.attempt, 7);
  assert.equal(errStepObj.errorSummary?.maxAttempts, 9);

  const toolErrStep = projectStep(
    {
      type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
      status: 'DONE',
      error: 'exit status 1',
      runCommand: { commandLine: 'npm test', exitCode: 1 },
      metadata: { toolCall: { name: 'run_command' } },
    },
    207,
  );
  assert.equal(toolErrStep.toolSummary?.hasError, true);
  assert.equal(toolErrStep.errorSummary, undefined);
});

test('buildModelCatalogFromUserStatus 剥离敏感信息并支持 getModelCatalog TTL 缓存', async () => {
  const userStatusRes = {
    userStatus: {
      email: 'user@example.com',
      cascadeModelConfigData: {
        clientModelConfigs: [
          {
            label: 'Gemini 4 Neon (High)',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_M532' },
            modelId: 'gemini-4-neon-high',
            supportedMimeTypes: { 'text/plain': true },
          },
          {
            label: 'Gemini 4 Carbon',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_M670' },
            modelId: 'gemini-4-carbon-disabled',
            disabled: true,
          },
        ],
      },
    },
  };

  const parsed = buildModelCatalogFromUserStatus(userStatusRes);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    rawModel: 'MODEL_PLACEHOLDER_M532',
    display: 'Gemini 4 Neon (High)',
    modelId: 'gemini-4-neon-high',
    disabled: false,
  });
  assert.equal(parsed[1].disabled, true);
  assert.equal(JSON.stringify(parsed).includes('user@example.com'), false);

  let rpcCount = 0;
  let nowMs = 10_000;
  const client = new LanguageServerClient({
    lsAddress: 'http://127.0.0.1:4350',
    csrfToken: 'tok-1',
    nowFn: () => nowMs,
    requestFn: async (_ep, method) => {
      if (method === 'GetUserStatus') {
        rpcCount++;
        return userStatusRes;
      }
      return {};
    },
  });

  const c1 = await client.getModelCatalog();
  const c2 = await client.getModelCatalog();
  assert.equal(c1.length, 2);
  assert.equal(c2.length, 2);
  assert.equal(rpcCount, 1);

  nowMs += 6 * 60 * 1000;
  await client.getModelCatalog();
  assert.equal(rpcCount, 2);
});
