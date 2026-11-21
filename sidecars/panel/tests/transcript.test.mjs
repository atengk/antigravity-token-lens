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
import { PreferencesStore, normalizePreferences } from '../store.mjs';

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
    assert.equal(init.warnAt, 70);

    const updated = await store.update({
      lang: 'en',
      warnAt: 65,
      criticalAt: 90,
      contextLimitOverrides: { 'gemini-4-hydrogen': 1_048_576 },
    });
    assert.equal(updated.lang, 'en');
    assert.equal(updated.warnAt, 65);
    assert.equal(updated.criticalAt, 90);
    assert.equal(updated.contextLimitOverrides['gemini-4-hydrogen'], 1_048_576);

    // 清除单个模型覆盖
    const cleared = await store.update({
      contextLimitOverrides: { 'gemini-4-hydrogen': null },
    });
    assert.equal(cleared.contextLimitOverrides['gemini-4-hydrogen'], undefined);

    // 校验非法阈值防御
    const safe = normalizePreferences({ warnAt: 90, criticalAt: 80 });
    assert.ok(safe.criticalAt > safe.warnAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
