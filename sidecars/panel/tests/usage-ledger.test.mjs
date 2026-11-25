/**
 * usage-ledger.mjs 单元测试：覆盖增量 mtime 持久化、已删目录防丢保留、按日分摊、子代理归并及日/周/月/年聚合。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageLedgerStore, aggregateUsageByPeriod, toLocalIsoWeekKey } from '../usage-ledger.mjs';
import { PanelService } from '../main.mjs';
import { PreferencesStore } from '../store.mjs';

function makeUuid(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

test('UsageLedgerStore 支持增量扫描、本地持久化、跨天按轮分摊与删除目录后保留历史', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tl-ledger-'));
  const appDir = join(root, 'antigravity');
  const dataDir = join(root, 'data');
  const mainId = makeUuid(1);
  const subId = makeUuid(2);

  try {
    const mainDir = join(appDir, 'brain', mainId, '.system_generated', 'logs');
    const subDir = join(appDir, 'brain', subId, '.system_generated', 'logs');
    await mkdir(mainDir, { recursive: true });
    await mkdir(subDir, { recursive: true });

    // 主会话跨越两天，且调用了 subId
    const mainLines = [
      JSON.stringify({
        step_index: 0,
        type: 'USER_INPUT',
        created_at: '2026-11-24T10:00:00',
        content: '<USER_REQUEST>构建全量统计账本</USER_REQUEST>',
      }),
      JSON.stringify({
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-24T10:01:00',
        model: 'gemini-4-hydrogen-high',
        input_tokens: 1000,
        cache_read_tokens: 9000,
        output_tokens: 200,
        tool_calls: [{ name: 'invoke_subagent', args: { Role: 'Researcher' } }],
      }),
      JSON.stringify({
        step_index: 2,
        type: 'TOOL_RESULT',
        created_at: '2026-11-24T10:02:00',
        content: `conversationId: "${subId}"`,
      }),
      JSON.stringify({
        step_index: 3,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-25T09:00:00',
        model: 'claude-sonnet-4-6',
        input_tokens: 2000,
        cache_read_tokens: 8000,
        output_tokens: 300,
      }),
    ];
    await writeFile(join(mainDir, 'transcript.jsonl'), mainLines.join('\n') + '\n', 'utf8');

    // 子代理在 2026-11-25 执行一轮
    const subLines = [
      JSON.stringify({
        step_index: 0,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-25T09:05:00',
        model: 'gemini-3.8-flash-high',
        input_tokens: 500,
        cache_read_tokens: 1500,
        output_tokens: 100,
      }),
    ];
    await writeFile(join(subDir, 'transcript.jsonl'), subLines.join('\n') + '\n', 'utf8');

    const store = new UsageLedgerStore({ dataDir, appDataCandidates: [appDir] });
    const doc1 = await store.sync({ force: true });
    assert.equal(Object.keys(doc1.conversations).length, 2);

    // 删除原始 subDir，模拟历史目录被清理后重载 Store：已持久化历史必须保留！
    await rm(join(appDir, 'brain', subId), { recursive: true, force: true });
    const reloaded = new UsageLedgerStore({ dataDir, appDataCandidates: [appDir] });
    const doc2 = await reloaded.sync({ force: true });
    assert.equal(Object.keys(doc2.conversations).length, 2);

    const nowMs = new Date(2026, 10, 25, 12, 0, 0).getTime();

    // 按日统计：2026-11-24 仅含主会话第一轮（10200），2026-11-25 含主会话第二轮(10300) + 子代理(2100) = 12400
    const daily = aggregateUsageByPeriod(doc2, { period: 'day', targetKey: '2026-11-25', nowMs });
    assert.equal(daily.selected.totalTokens, 12400);
    assert.equal(daily.selected.uncachedInput, 2500);
    assert.equal(daily.selected.cacheRead, 9500);
    assert.equal(daily.selected.output, 400);
    // Top 榜单应把 subId 归并到 mainId 下，仅一条主会话记录且标注 subagentCount = 1
    assert.equal(daily.topConversations.length, 1);
    assert.equal(daily.topConversations[0].id, mainId);
    assert.equal(daily.topConversations[0].subagentCount, 1);
    assert.equal(daily.topConversations[0].totalTokens, 12400);

    // 按周/月/年统计应聚合两天总和 22600
    const weekKey = toLocalIsoWeekKey(new Date(2026, 10, 25));
    const weekly = aggregateUsageByPeriod(doc2, { period: 'week', targetKey: weekKey, nowMs });
    assert.equal(weekly.selected.totalTokens, 22600);

    const monthly = aggregateUsageByPeriod(doc2, { period: 'month', targetKey: '2026-11', nowMs });
    assert.equal(monthly.selected.totalTokens, 22600);
    assert.equal(monthly.byModel.length, 3);
    assert.ok(monthly.byModel.some((m) => m.model === 'Gemini 4 Hydrogen'));

    const yearly = aggregateUsageByPeriod(doc2, { period: 'year', targetKey: '2026', nowMs });
    assert.equal(yearly.selected.totalTokens, 22600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PanelService.getUsageStats 与 getConversations 支持多周期统计与后台并发会话识别', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tl-panel-stats-'));
  const appDir = join(root, 'antigravity');
  const dataDir = join(root, 'data');
  const convA = makeUuid(10);
  const convB = makeUuid(11);

  try {
    const dirA = join(appDir, 'brain', convA, '.system_generated', 'logs');
    await mkdir(dirA, { recursive: true });
    await writeFile(
      join(dirA, 'transcript.jsonl'),
      JSON.stringify({
        step_index: 0,
        type: 'PLANNER_RESPONSE',
        created_at: new Date().toISOString(),
        model: 'gemini-4-hydrogen-high',
        input_tokens: 3000,
        cache_read_tokens: 7000,
        output_tokens: 500,
      }) + '\n',
      'utf8',
    );

    const service = new PanelService({
      lsClient: {
        async getSummaries() {
          return {
            [convA]: { summary: '主会话 A', status: 'CASCADE_RUN_STATUS_IDLE', lastModifiedTime: '2026-11-25T12:00:00Z' },
            [convB]: { summary: '后台并发会话 B', status: 'CASCADE_RUN_STATUS_RUNNING', lastModifiedTime: '2026-11-25T12:05:00Z' },
          };
        },
      },
      prefs: new PreferencesStore(dataDir),
      paths: { dataDir, appDataCandidates: [appDir], configFile: join(root, 'missing.json') },
      usageLedger: new UsageLedgerStore({ dataDir, appDataCandidates: [appDir] }),
    });

    const convs = await service.getConversations(convA);
    assert.equal(convs.items.length, 2);
    assert.equal(convs.activeRunningOthers.length, 1);
    assert.equal(convs.activeRunningOthers[0].id, convB);

    const stats = await service.getUsageStats({ period: 'day', force: true });
    assert.equal(stats.selected.totalTokens, 10500);
    assert.equal(stats.topConversations[0].title, '主会话 A');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
