/**
 * quota.mjs 单元测试：覆盖有界稀疏采样持久化、动态归组、满额边界与实测消耗速率预警。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QuotaHistoryStore, computeQuotaSnapshot } from '../quota.mjs';
import { PanelService } from '../main.mjs';
import { PreferencesStore } from '../store.mjs';

test('QuotaHistoryStore 支持 7 天过期清理、同值稀疏去重、条数封顶与原子写盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tl-quota-'));
  try {
    const store = new QuotaHistoryStore(dir);
    const dayMs = 24 * 3600 * 1000;
    const t0 = Date.UTC(2026, 10, 18, 0, 0, 0);

    // 第 0 天写入一个点
    await store.recordAndLoad(
      [{ buckets: [{ bucketId: 'gemini-5h', remainingFraction: 0.9, resetTime: '2026-11-18T05:00:00Z' }] }],
      t0,
    );

    // 同一时间段重复相同 remainingFraction 不应重复膨胀记录
    await store.recordAndLoad(
      [{ buckets: [{ bucketId: 'gemini-5h', remainingFraction: 0.9, resetTime: '2026-11-18T05:00:00Z' }] }],
      t0 + 20_000,
    );

    const afterDup = await store.recordAndLoad(
      [{ buckets: [{ bucketId: 'gemini-5h', remainingFraction: 0.85, resetTime: '2026-11-18T05:00:00Z' }] }],
      t0 + 120_000,
    );
    assert.equal(afterDup['gemini-5h'].length, 2);

    // 超过 7 天后写入新点，旧点应被自动清理
    const t8DaysLater = t0 + 8 * dayMs;
    const afterExpire = await store.recordAndLoad(
      [{ buckets: [{ bucketId: 'gemini-5h', remainingFraction: 0.95, resetTime: '2026-11-26T05:00:00Z' }] }],
      t8DaysLater,
    );
    assert.equal(afterExpire['gemini-5h'].length, 1);
    assert.equal(afterExpire['gemini-5h'][0].remainingFraction, 0.95);

    // 连续高频掉点超出单桶上限时必须封顶，避免账本膨胀
    for (let i = 1; i <= 300; i++) {
      await store.recordAndLoad(
        [{
          buckets: [{
            bucketId: 'gemini-5h',
            remainingFraction: Math.max(0, 0.95 - i * 0.002),
            resetTime: '2026-11-26T05:00:00Z',
          }],
        }],
        t8DaysLater + i * 30_000,
      );
    }

    // 重建实例从磁盘加载，验证原子持久化与封顶
    const reloaded = new QuotaHistoryStore(dir);
    const loaded = await reloaded.recordAndLoad([], t8DaysLater + 301 * 30_000);
    assert.ok(loaded['gemini-5h'].length <= 240);
    assert.ok(loaded['gemini-5h'].length >= 100);

    const diskRaw = await readFile(join(dir, 'quota-history.json'), 'utf8');
    assert.ok(Buffer.byteLength(diskRaw, 'utf8') < 64 * 1024);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('computeQuotaSnapshot 准确识别模型归组、满额滑动计时、Pacing 节奏及同周期撞墙预警', () => {
  const nowMs = Date.parse('2026-11-25T04:00:00Z');
  // Gemini 5h 窗口 07:00 重置（即 02:00 开始，已过 2h = 40% 时间），但剩余仅 40%（已用 60% -> pacingDelta +20% fast）
  const quotaPayload = {
    description: 'Shared limits.',
    tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
    credits: { planName: 'Pro', promptAvailable: 500, promptMonthly: 50000, flowAvailable: 100, flowMonthly: 150000 },
    groups: [
      {
        displayName: 'Gemini Models',
        description: 'Models within this group: Gemini 4 Hydrogen, Gemini 3.8 Flash',
        buckets: [
          { bucketId: 'gemini-weekly', displayName: 'Weekly Limit Remaining', window: 'weekly', remainingFraction: 0.88, resetTime: '2026-12-01T04:00:00Z' },
          { bucketId: 'gemini-5h', displayName: 'Five Hour Limit Remaining', window: '5h', remainingFraction: 0.4, resetTime: '2026-11-25T07:00:00Z' },
        ],
      },
      {
        displayName: 'Claude and GPT models',
        description: 'Models within this group: Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B',
        buckets: [
          { bucketId: '3p-weekly', displayName: 'Weekly Limit Remaining', window: 'weekly', remainingFraction: 1, resetTime: '2026-12-02T04:00:00Z' },
          { bucketId: '3p-5h', displayName: 'Five Hour Limit Remaining', window: '5h', remainingFraction: 1, resetTime: '2026-11-25T09:00:00Z' },
        ],
      },
    ],
    models: [
      {
        rawModel: 'MODEL_PLACEHOLDER_M525',
        display: 'Gemini 4 Hydrogen (High)',
        modelId: 'gemini-4-hydrogen-high',
        disabled: false,
        tagTitle: 'New',
        tagDescription: null,
        quotaInfo: { remainingFraction: 0.4, resetTime: '2026-11-25T07:00:00Z' },
      },
      {
        rawModel: 'MODEL_PLACEHOLDER_M35',
        display: 'Claude Sonnet 4.6 (Thinking)',
        modelId: 'claude-sonnet-4-6',
        disabled: false,
        tagTitle: 'Notice',
        tagDescription: 'Third-party ending Nov 30',
        quotaInfo: { remainingFraction: 1, resetTime: '2026-11-25T09:00:00Z' },
      },
    ],
  };

  // 包含一次跨周期重置（0.2 -> 0.9），然后过去 1 小时内从 0.6 掉到 0.4（20%/h，剩余 40% 将在 2h 后即 06:00 耗尽 < 07:00 重置！）
  const historyByBucket = {
    'gemini-5h': [
      { ts: nowMs - 4 * 3600 * 1000, remainingFraction: 0.2, resetTime: '2026-11-25T02:00:00Z' },
      { ts: nowMs - 2 * 3600 * 1000, remainingFraction: 0.9, resetTime: '2026-11-25T07:00:00Z' },
      { ts: nowMs - 3600 * 1000, remainingFraction: 0.6, resetTime: '2026-11-25T07:00:00Z' },
      { ts: nowMs, remainingFraction: 0.4, resetTime: '2026-11-25T07:00:00Z' },
    ],
    'gemini-weekly': [
      { ts: nowMs - 30_000, remainingFraction: 0.881, resetTime: '2026-12-01T04:00:00Z' },
      { ts: nowMs, remainingFraction: 0.88, resetTime: '2026-12-01T04:00:00Z' },
    ],
  };

  const snap = computeQuotaSnapshot({
    quotaPayload,
    historyByBucket,
    currentModel: { display: 'Claude Sonnet 4.6 (Thinking)', key: 'claude-sonnet-4.6' },
    nowMs,
  });

  assert.equal(snap.available, true);
  assert.equal(snap.activeGroupIndex, 1);
  assert.equal(snap.activeMatchKind, 'model');

  const gemini5h = snap.groups[0].buckets.find((b) => b.bucketId === 'gemini-5h');
  assert.equal(gemini5h.isIdleFull, false);
  assert.ok(Math.abs(gemini5h.timeElapsedPct - 40) < 0.1);
  assert.ok(Math.abs(gemini5h.pacingDeltaPct - 20) < 0.1);
  assert.equal(gemini5h.pacingStatus, 'fast');
  // 最近 30m-1h 斜率：0.6 -> 0.4 over 1h = 20%/h，剩余 40% => 2h 后耗尽（早于 3h 后重置）
  assert.ok(Math.abs(gemini5h.burnRatePctPerHour - 20) < 0.5);
  assert.equal(gemini5h.willDepleteBeforeReset, true);
  assert.equal(gemini5h.burnStatus, 'danger');
  assert.equal(gemini5h.alertLevel, 'warn');

  // gemini-weekly 跨度仅 30s 且降幅 0.1% 未达最小观测门槛 -> collecting，不应放大为假警报
  const geminiWeekly = snap.groups[0].buckets.find((b) => b.bucketId === 'gemini-weekly');
  assert.equal(geminiWeekly.burnStatus, 'collecting');
  assert.equal(geminiWeekly.burnRatePctPerHour, null);
  assert.equal(geminiWeekly.willDepleteBeforeReset, false);

  // Claude 100% 满额时应识别为 idleFull，不展示倒计时
  const claude5h = snap.groups[1].buckets.find((b) => b.bucketId === '3p-5h');
  assert.equal(claude5h.isIdleFull, true);
  assert.equal(claude5h.resetsInSec, null);
  assert.equal(claude5h.burnStatus, 'idle');

  // 组内模型挂载验证
  assert.equal(snap.groups[0].models[0].display, 'Gemini 4 Hydrogen (High)');
  assert.equal(snap.groups[1].models[0].tagDescription, 'Third-party ending Nov 30');

  // 空会话无模型输入时，应兜底高亮剩余最低的最紧迫组（Gemini Models = 40%）
  const emptySnap = computeQuotaSnapshot({ quotaPayload, historyByBucket, currentModel: null, nowMs });
  assert.equal(emptySnap.activeGroupIndex, 0);
  assert.equal(emptySnap.activeMatchKind, 'fallback');

  // 若另一组的 weekly 桶更低（0.05），即使 5h 满额也应被兜底选为最紧迫组；且微降回升（0.995 -> 1.0）应截断跨周期
  const weeklyCriticalPayload = structuredClone(quotaPayload);
  weeklyCriticalPayload.groups[1].buckets[0].remainingFraction = 0.05;
  const fallbackWeekly = computeQuotaSnapshot({
    quotaPayload: weeklyCriticalPayload,
    historyByBucket: {
      '3p-weekly': [
        { ts: nowMs - 7200_000, remainingFraction: 0.995, resetTime: '2026-12-01T00:00:00Z' },
        { ts: nowMs - 3600_000, remainingFraction: 1, resetTime: '2026-12-08T00:00:00Z' },
        { ts: nowMs, remainingFraction: 0.05, resetTime: '2026-12-08T00:00:00Z' },
      ],
    },
    currentModel: null,
    nowMs,
  });
  assert.equal(fallbackWeekly.activeGroupIndex, 1);
  assert.equal(fallbackWeekly.groups[1].buckets[0].alertLevel, 'critical');

  // 短时突发掉点（2 分钟掉 6.8%）不应在 5h 或 weekly 窗口放大为虚假撞墙恐慌
  const burstSnap = computeQuotaSnapshot({
    quotaPayload,
    historyByBucket: {
      'gemini-5h': [
        { ts: nowMs - 120_000, remainingFraction: 0.654, resetTime: '2026-11-25T07:00:00Z' },
        { ts: nowMs, remainingFraction: 0.586, resetTime: '2026-11-25T07:00:00Z' },
      ],
      'gemini-weekly': [
        { ts: nowMs - 120_000, remainingFraction: 0.841, resetTime: '2026-12-01T04:00:00Z' },
        { ts: nowMs, remainingFraction: 0.824, resetTime: '2026-12-01T04:00:00Z' },
      ],
    },
    currentModel: null,
    nowMs,
  });
  const burst5h = burstSnap.groups[0].buckets.find((b) => b.bucketId === 'gemini-5h');
  const burstWeekly = burstSnap.groups[0].buckets.find((b) => b.bucketId === 'gemini-weekly');
  assert.equal(burst5h.burnStatus, 'collecting');
  assert.equal(burstWeekly.burnStatus, 'collecting');
  assert.equal(burst5h.willDepleteBeforeReset, false);
  assert.equal(burstWeekly.willDepleteBeforeReset, false);
});

test('PanelService.getQuota 支持在线独立采集并在 LS 不可用时严格屏蔽过期历史余额（ADR-0004）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tl-panel-quota-'));
  try {
    let online = true;
    const mockLsClient = {
      async getQuotaSummary() {
        if (!online) throw new Error('Language Server unavailable');
        return {
          description: 'Shared limits.',
          tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
          credits: { planName: 'Pro', promptAvailable: 500, promptMonthly: 50000, flowAvailable: 100, flowMonthly: 150000 },
          groups: [
            {
              displayName: 'Gemini Models',
              description: 'Models within this group: Gemini 4 Hydrogen',
              buckets: [
                { bucketId: 'gemini-5h', displayName: 'Five Hour Limit Remaining', window: '5h', remainingFraction: 0.75, resetTime: '2026-11-25T08:00:00Z' },
              ],
            },
          ],
          models: [
            { rawModel: 'MODEL_PLACEHOLDER_M525', display: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-hydrogen-high', disabled: false },
          ],
        };
      },
    };

    const service = new PanelService({
      lsClient: mockLsClient,
      prefs: new PreferencesStore(dir),
      paths: { dataDir: dir, appDataCandidates: [], configFile: join(dir, 'missing.json') },
      quotaHistory: new QuotaHistoryStore(dir),
    });

    const onlineRes = await service.getQuota({ model: 'Gemini 4 Hydrogen (High)', modelKey: 'gemini-4-hydrogen', force: false });
    assert.equal(onlineRes.available, true);
    assert.equal(onlineRes.groups.length, 1);
    assert.equal(onlineRes.groups[0].isActive, true);

    // 切换离线断连状态：即使磁盘已有刚写入的 quota-history.json，仍必须返回 available: false
    online = false;
    const offlineRes = await service.getQuota({ model: 'Gemini 4 Hydrogen (High)', modelKey: 'gemini-4-hydrogen', force: false });
    assert.equal(offlineRes.available, false);
    assert.equal(offlineRes.groups, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
