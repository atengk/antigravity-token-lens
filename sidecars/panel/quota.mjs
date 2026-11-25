/**
 * 账号配额采样存储与速率预警分析引擎，负责有界稀疏持久化、模型动态归组、Pacing 节奏对比与耗尽预测。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const RETENTION_MS = 7 * 24 * 3600 * 1000;
const MAX_BUCKET_SAMPLES = 240;
const MAX_BUCKETS = 32;
const MAX_HISTORY_FILE_BYTES = 512 * 1024;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const SAME_FRACTION_APPEND_MS = 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 60 * 1000;
const FRACTION_EPSILON = 1e-5;
const RESET_REBOUND_THRESHOLD = 0.002;
const MIN_BURN_SPAN_SEC = 600;
const MIN_WEEKLY_BURN_SPAN_SEC = 3600;
const MIN_BURN_DROP_PCT = 0.2;
const RECENT_BURN_WINDOW_MS = 60 * 60 * 1000;
const RECENT_WEEKLY_BURN_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESET_TIME_MATCH_TOLERANCE_MS = 120 * 1000;
const PACING_DELTA_THRESHOLD_PCT = 10;
const CRITICAL_REMAINING_PCT = 10;
const WARN_REMAINING_PCT = 30;
const MAX_QUOTA_SERIES_POINTS = 24;
const ALERT_PRIORITY = { normal: 0, warn: 1, critical: 2 };
const WINDOW_DURATION_SEC = new Map([
  ['5h', 5 * 3600],
  ['weekly', 7 * 24 * 3600],
]);

function cloneHistoryMap(buckets) {
  const out = {};
  for (const [id, list] of Object.entries(buckets || {})) {
    out[id] = list.map((pt) => ({ ...pt }));
  }
  return out;
}

function normalizeHistoryDoc(raw, nowMs) {
  const cutoff = nowMs - RETENTION_MS;
  const src = raw?.buckets && typeof raw.buckets === 'object' && !Array.isArray(raw.buckets)
    ? raw.buckets
    : {};
  const buckets = {};
  let bucketCount = 0;

  for (const [bucketId, arr] of Object.entries(src)) {
    if (bucketCount >= MAX_BUCKETS) break;
    if (!bucketId || !Array.isArray(arr)) continue;
    const valid = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const ts = Number(item.ts);
      const frac = Number(item.remainingFraction);
      if (!Number.isFinite(ts) || ts < cutoff || ts > nowMs + FUTURE_CLOCK_SKEW_MS) continue;
      if (!Number.isFinite(frac) || frac < 0 || frac > 1) continue;
      valid.push({
        ts,
        remainingFraction: frac,
        resetTime: typeof item.resetTime === 'string' && item.resetTime ? item.resetTime : null,
      });
    }
    valid.sort((a, b) => a.ts - b.ts);
    if (valid.length > 0) {
      buckets[bucketId] = valid.slice(-MAX_BUCKET_SAMPLES);
      bucketCount++;
    }
  }
  return { buckets };
}

/**
 * 管理配额历史稀疏采样的单文件原子持久化，严格限制保留期与条数上限，避免账本膨胀。
 */
export class QuotaHistoryStore {
  #filePath;
  #cached = null;
  #writeQueue = Promise.resolve();

  /**
   * @param {string} dataDir Sidecar 持久化目录
   */
  constructor(dataDir) {
    this.#filePath = join(dataDir, 'quota-history.json');
  }

  async #loadFromDisk(nowMs) {
    if (this.#cached) {
      return normalizeHistoryDoc(this.#cached, nowMs);
    }
    try {
      const text = await readFile(this.#filePath, 'utf8');
      if (text.length > MAX_HISTORY_FILE_BYTES) {
        this.#cached = { buckets: {} };
        return { buckets: {} };
      }
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      const normalized = normalizeHistoryDoc(parsed, nowMs);
      this.#cached = normalized;
      return normalized;
    } catch (err) {
      if (err?.code !== 'ENOENT' && !(err instanceof SyntaxError)) {
        throw err;
      }
      this.#cached = { buckets: {} };
      return { buckets: {} };
    }
  }

  /**
   * 写入最新配额组快照中的变化采样点，清理超期记录并返回完整有界历史映射。
   *
   * @param {Array<object>} groups 配额组列表
   * @param {number} [nowMs=Date.now()] 当前毫秒时间戳
   * @return {Promise<Record<string, Array<{ ts: number, remainingFraction: number, resetTime: string|null }>>>}
   */
  async recordAndLoad(groups = [], nowMs = Date.now()) {
    const task = this.#writeQueue.catch(() => {}).then(async () => {
      const doc = await this.#loadFromDisk(nowMs);
      const cutoff = nowMs - RETENTION_MS;
      let dirty = false;

      // 清理已有桶中的超期记录
      for (const [id, list] of Object.entries(doc.buckets)) {
        const filtered = list.filter((pt) => pt.ts >= cutoff);
        if (filtered.length !== list.length) {
          dirty = true;
          if (filtered.length > 0) doc.buckets[id] = filtered;
          else delete doc.buckets[id];
        }
      }

      if (Array.isArray(groups)) {
        for (const group of groups) {
          const buckets = Array.isArray(group?.buckets) ? group.buckets : [];
          for (const b of buckets) {
            const id = typeof b?.bucketId === 'string' ? b.bucketId.trim() : '';
            const frac = Number(b?.remainingFraction);
            if (!id || !Number.isFinite(frac) || frac < 0 || frac > 1) continue;

            const resetTime = typeof b.resetTime === 'string' && b.resetTime.trim() ? b.resetTime.trim() : null;
            if (!doc.buckets[id]) {
              if (Object.keys(doc.buckets).length >= MAX_BUCKETS) continue;
              doc.buckets[id] = [];
            }

            const list = doc.buckets[id];
            const last = list.at(-1) || null;
            if (!last) {
              list.push({ ts: nowMs, remainingFraction: frac, resetTime });
              dirty = true;
              continue;
            }

            const sameFrac = Math.abs(last.remainingFraction - frac) < FRACTION_EPSILON;
            const sameReset = last.resetTime === resetTime;
            // 持续 100% 满额时仅刷新时间戳与滑动重置点，避免无意义追加
            if (frac >= 1 - FRACTION_EPSILON && last.remainingFraction >= 1 - FRACTION_EPSILON) {
              if (nowMs - last.ts >= HEARTBEAT_INTERVAL_MS || !sameReset) {
                last.ts = nowMs;
                last.resetTime = resetTime;
                dirty = true;
              }
              continue;
            }

            if (sameFrac && sameReset && nowMs - last.ts < HEARTBEAT_INTERVAL_MS) {
              continue;
            }

            if (nowMs <= last.ts) {
              last.remainingFraction = frac;
              last.resetTime = resetTime;
            } else {
              list.push({ ts: nowMs, remainingFraction: frac, resetTime });
            }
            if (list.length > MAX_BUCKET_SAMPLES) {
              doc.buckets[id] = list.slice(-MAX_BUCKET_SAMPLES);
            }
            dirty = true;
          }
        }
      }

      if (dirty) {
        await mkdir(dirname(this.#filePath), { recursive: true });
        const tempPath = `${this.#filePath}.${randomUUID()}.tmp`;
        try {
          await writeFile(tempPath, JSON.stringify(doc), { encoding: 'utf8', mode: 0o600 });
          await rename(tempPath, this.#filePath);
          this.#cached = doc;
        } catch (err) {
          await unlink(tempPath).catch(() => {});
          throw err;
        }
      } else {
        this.#cached = doc;
      }

      return cloneHistoryMap(doc.buckets);
    });

    this.#writeQueue = task;
    return task;
  }
}

function parseIsoMs(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeModelText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCurrentCycleSamples(rawSamples, currentFrac, currentResetTime, nowMs) {
  const list = Array.isArray(rawSamples)
    ? rawSamples
        .filter((s) => Number.isFinite(s?.ts) && Number.isFinite(s?.remainingFraction))
        .map((s) => ({
          ts: s.ts,
          remainingFraction: s.remainingFraction,
          resetTime: s.resetTime || null,
        }))
        .sort((a, b) => a.ts - b.ts)
    : [];

  if (Number.isFinite(currentFrac)) {
    const last = list.at(-1);
    const sameFrac = last && Math.abs(last.remainingFraction - currentFrac) < FRACTION_EPSILON;
    if (!last || (!sameFrac && nowMs > last.ts) || (sameFrac && nowMs - last.ts >= SAME_FRACTION_APPEND_MS)) {
      list.push({ ts: nowMs, remainingFraction: currentFrac, resetTime: currentResetTime || null });
    } else if (last && nowMs >= last.ts) {
      last.remainingFraction = currentFrac;
      last.resetTime = currentResetTime || last.resetTime;
    }
  }

  let cycleStartIdx = 0;
  for (let i = list.length - 1; i > 0; i--) {
    const curr = list[i];
    const prev = list[i - 1];
    // 剩余额度回升超过 0.2% 或重置时间戳向前跨周期跳变，说明进入了新的重置周期
    if (curr.remainingFraction > prev.remainingFraction + RESET_REBOUND_THRESHOLD) {
      cycleStartIdx = i;
      break;
    }
    const prevResetMs = parseIsoMs(prev.resetTime);
    const currResetMs = parseIsoMs(curr.resetTime);
    if (
      prevResetMs !== null &&
      currResetMs !== null &&
      currResetMs - prevResetMs > RESET_TIME_MATCH_TOLERANCE_MS &&
      curr.remainingFraction < 1 - FRACTION_EPSILON
    ) {
      cycleStartIdx = i;
      break;
    }
  }

  return {
    allSamples: list,
    cycleSamples: list.slice(cycleStartIdx),
  };
}

function computeBurnMetrics({ cycleSamples, remainingPct, resetTimeMs, isIdleFull, windowKey, nowMs }) {
  if (isIdleFull) {
    return {
      burnStatus: 'idle',
      burnRatePctPerHour: null,
      etaDepletionSec: null,
      etaDepletionTime: null,
      willDepleteBeforeReset: false,
      observedDropPct: 0,
    };
  }

  if (remainingPct <= 0) {
    return {
      burnStatus: 'depleted',
      burnRatePctPerHour: null,
      etaDepletionSec: 0,
      etaDepletionTime: new Date(nowMs).toISOString(),
      willDepleteBeforeReset: true,
      observedDropPct: 100,
    };
  }

  if (!Array.isArray(cycleSamples) || cycleSamples.length < 2) {
    return {
      burnStatus: 'collecting',
      burnRatePctPerHour: null,
      etaDepletionSec: null,
      etaDepletionTime: null,
      willDepleteBeforeReset: false,
      observedDropPct: 0,
    };
  }

  const first = cycleSamples[0];
  const last = cycleSamples.at(-1);
  const fullSpanSec = (last.ts - first.ts) / 1000;
  const fullDropPct = Math.max(0, (first.remainingFraction - last.remainingFraction) * 100);
  const minSpanSec = windowKey === 'weekly' ? MIN_WEEKLY_BURN_SPAN_SEC : MIN_BURN_SPAN_SEC;
  const recentWindowMs = windowKey === 'weekly' ? RECENT_WEEKLY_BURN_WINDOW_MS : RECENT_BURN_WINDOW_MS;

  if (fullSpanSec < minSpanSec || fullDropPct < MIN_BURN_DROP_PCT) {
    return {
      burnStatus: 'collecting',
      burnRatePctPerHour: null,
      etaDepletionSec: null,
      etaDepletionTime: null,
      willDepleteBeforeReset: false,
      observedDropPct: fullDropPct,
    };
  }

  // 优先采用最近平滑窗口内的采样斜率（5h 取近 60 分钟，weekly 取近 24 小时），不足门槛则回退全周期斜率
  const windowCutoff = last.ts - recentWindowMs;
  const recentAnchor = cycleSamples.find((pt) => pt.ts >= windowCutoff) || first;
  const recentSpanSec = (last.ts - recentAnchor.ts) / 1000;
  const recentDropPct = Math.max(0, (recentAnchor.remainingFraction - last.remainingFraction) * 100);

  const useRecent = recentSpanSec >= minSpanSec && recentDropPct >= MIN_BURN_DROP_PCT;
  const effectiveSpanSec = useRecent ? recentSpanSec : fullSpanSec;
  const effectiveDropPct = useRecent ? recentDropPct : fullDropPct;
  const burnRatePctPerHour = effectiveDropPct / (effectiveSpanSec / 3600);

  if (!Number.isFinite(burnRatePctPerHour) || burnRatePctPerHour <= 0) {
    return {
      burnStatus: 'collecting',
      burnRatePctPerHour: null,
      etaDepletionSec: null,
      etaDepletionTime: null,
      willDepleteBeforeReset: false,
      observedDropPct: fullDropPct,
    };
  }

  const etaDepletionSec = (remainingPct / burnRatePctPerHour) * 3600;
  const etaDepletionMs = nowMs + etaDepletionSec * 1000;
  const willDepleteBeforeReset = Boolean(resetTimeMs !== null && etaDepletionMs < resetTimeMs);

  return {
    burnStatus: willDepleteBeforeReset ? 'danger' : 'safe',
    burnRatePctPerHour,
    etaDepletionSec,
    etaDepletionTime: new Date(etaDepletionMs).toISOString(),
    willDepleteBeforeReset,
    observedDropPct: fullDropPct,
  };
}

function analyzeBucket(rawBucket, rawSamples, nowMs) {
  const frac = Number.isFinite(Number(rawBucket?.remainingFraction))
    ? Math.min(1, Math.max(0, Number(rawBucket.remainingFraction)))
    : null;
  const remainingPct = frac !== null ? frac * 100 : null;
  const usedPct = remainingPct !== null ? Math.max(0, 100 - remainingPct) : null;
  const isIdleFull = frac !== null && frac >= 1 - FRACTION_EPSILON;
  const resetTime = rawBucket?.resetTime || null;
  const resetTimeMs = parseIsoMs(resetTime);

  const resetsInSec =
    !isIdleFull && resetTimeMs !== null ? Math.max(0, (resetTimeMs - nowMs) / 1000) : null;

  const windowKey = String(rawBucket?.window || '').toLowerCase();
  const windowDurationSec = WINDOW_DURATION_SEC.get(windowKey) ?? null;

  let timeElapsedPct = null;
  let pacingDeltaPct = null;
  let pacingStatus = 'unknown';

  if (isIdleFull) {
    timeElapsedPct = 0;
    pacingDeltaPct = 0;
    pacingStatus = 'idle';
  } else if (windowDurationSec && resetsInSec !== null && usedPct !== null) {
    const elapsedSec = Math.min(windowDurationSec, Math.max(0, windowDurationSec - resetsInSec));
    timeElapsedPct = (elapsedSec / windowDurationSec) * 100;
    pacingDeltaPct = usedPct - timeElapsedPct;
    pacingStatus =
      pacingDeltaPct >= PACING_DELTA_THRESHOLD_PCT
        ? 'fast'
        : pacingDeltaPct <= -PACING_DELTA_THRESHOLD_PCT
          ? 'relaxed'
          : 'steady';
  }

  const { allSamples, cycleSamples } = extractCurrentCycleSamples(rawSamples, frac, resetTime, nowMs);
  const burn =
    remainingPct !== null
      ? computeBurnMetrics({ cycleSamples, remainingPct, resetTimeMs, isIdleFull, windowKey, nowMs })
      : {
          burnStatus: 'unknown',
          burnRatePctPerHour: null,
          etaDepletionSec: null,
          etaDepletionTime: null,
          willDepleteBeforeReset: false,
          observedDropPct: 0,
        };

  let alertLevel = 'normal';
  if (remainingPct !== null) {
    if (remainingPct <= CRITICAL_REMAINING_PCT) alertLevel = 'critical';
    else if (remainingPct <= WARN_REMAINING_PCT || burn.willDepleteBeforeReset) alertLevel = 'warn';
  }

  return {
    bucketId: rawBucket?.bucketId || '',
    displayName: rawBucket?.displayName || rawBucket?.bucketId || '',
    description: rawBucket?.description || null,
    window: windowKey,
    remainingFraction: frac,
    remainingPct,
    usedPct,
    isIdleFull,
    resetTime: isIdleFull ? null : resetTime,
    resetsInSec,
    timeElapsedPct,
    pacingDeltaPct,
    pacingStatus,
    ...burn,
    alertLevel,
    series: allSamples.slice(-MAX_QUOTA_SERIES_POINTS).map((pt) => ({
      ts: pt.ts,
      remainingPct: pt.remainingFraction * 100,
    })),
  };
}

function assignModelsToGroups(groups, rawModels) {
  const unmatchedModels = [];
  for (const m of rawModels || []) {
    const baseName = normalizeModelText(m.display || m.modelId || '');
    let matchedIdx = -1;

    if (baseName) {
      matchedIdx = groups.findIndex((g) => g.description && normalizeModelText(g.description).includes(baseName));
    }

    if (matchedIdx < 0 && m.quotaInfo?.resetTime) {
      const mResetMs = parseIsoMs(m.quotaInfo.resetTime);
      if (mResetMs !== null) {
        matchedIdx = groups.findIndex((g) =>
          g.rawBuckets.some((b) => {
            const bResetMs = parseIsoMs(b.resetTime);
            return bResetMs !== null && Math.abs(bResetMs - mResetMs) <= RESET_TIME_MATCH_TOLERANCE_MS;
          }),
        );
      }
    }

    const cleanModel = {
      rawModel: m.rawModel || null,
      display: m.display || m.modelId || m.rawModel || 'Unknown',
      modelId: m.modelId || null,
      disabled: Boolean(m.disabled),
      tagTitle: m.tagTitle || null,
      tagDescription: m.tagDescription || null,
    };

    if (matchedIdx >= 0) {
      groups[matchedIdx].models.push(cleanModel);
    } else {
      unmatchedModels.push(cleanModel);
    }
  }
  return unmatchedModels;
}

function resolveActiveGroupIndex(groups, currentModel) {
  if (groups.length === 0) return { activeGroupIndex: -1, activeMatchKind: 'none' };

  const probes = [
    normalizeModelText(currentModel?.display),
    normalizeModelText(currentModel?.key),
    normalizeModelText(currentModel?.rawModel),
  ].filter(Boolean);

  if (probes.length > 0) {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const inModels = g.models.some((m) => {
        const mCandidates = [
          normalizeModelText(m.display),
          normalizeModelText(m.modelId),
          normalizeModelText(m.rawModel),
        ].filter(Boolean);
        return probes.some((p) => mCandidates.some((c) => c === p || c.includes(p) || p.includes(c)));
      });
      if (inModels) return { activeGroupIndex: i, activeMatchKind: 'model' };

      const descNorm = normalizeModelText(g.description);
      if (descNorm && probes.some((p) => descNorm.includes(p))) {
        return { activeGroupIndex: i, activeMatchKind: 'model' };
      }
    }
  }

  // 空会话或未知模型兜底选择所有桶中最低剩余比例所在的最紧迫配额组
  let bestIdx = 0;
  let lowestFrac = Infinity;
  for (let i = 0; i < groups.length; i++) {
    const fracs = groups[i].buckets
      .map((b) => b.remainingFraction)
      .filter((f) => typeof f === 'number' && Number.isFinite(f));
    const score = fracs.length > 0 ? Math.min(...fracs) : 1;
    if (score < lowestFrac) {
      lowestFrac = score;
      bestIdx = i;
    }
  }
  return { activeGroupIndex: bestIdx, activeMatchKind: 'fallback' };
}

/**
 * 汇总账号配额组、Pacing 节奏、消耗速率与撞墙预警，生成面向前端的配额快照。
 *
 * @param {object} params 计算入参
 * @param {object} params.quotaPayload LS 白名单配额数据
 * @param {Record<string, Array<object>>} [params.historyByBucket={}] 历史采样映射
 * @param {{ display?: string|null, key?: string|null, rawModel?: string|null }|null} [params.currentModel=null] 当前会话模型线索
 * @param {number} [params.nowMs=Date.now()] 当前毫秒时间戳
 * @return {object}
 */
export function computeQuotaSnapshot({ quotaPayload, historyByBucket = {}, currentModel = null, nowMs = Date.now() }) {
  if (!quotaPayload || !Array.isArray(quotaPayload.groups) || quotaPayload.groups.length === 0) {
    return { available: false, reason: 'no_quota_groups' };
  }

  const groups = quotaPayload.groups.map((g) => {
    const rawBuckets = Array.isArray(g.buckets) ? g.buckets : [];
    const buckets = rawBuckets.map((b) => analyzeBucket(b, historyByBucket[b.bucketId] || [], nowMs));
    let alertLevel = 'normal';
    for (const b of buckets) {
      if (ALERT_PRIORITY[b.alertLevel] > ALERT_PRIORITY[alertLevel]) {
        alertLevel = b.alertLevel;
      }
    }
    return {
      displayName: g.displayName || 'Quota Group',
      description: g.description || '',
      alertLevel,
      buckets,
      models: [],
      rawBuckets,
    };
  });

  const unmatchedModels = assignModelsToGroups(groups, quotaPayload.models);
  const { activeGroupIndex, activeMatchKind } = resolveActiveGroupIndex(groups, currentModel);

  const cleanGroups = groups.map(({ rawBuckets: _raw, ...rest }, idx) => ({
    ...rest,
    isActive: idx === activeGroupIndex,
  }));

  return {
    available: true,
    updatedAt: new Date(nowMs).toISOString(),
    description: quotaPayload.description || null,
    tier: quotaPayload.tier || null,
    credits: quotaPayload.credits || null,
    activeGroupIndex,
    activeMatchKind,
    groups: cleanGroups,
    unmatchedModels,
  };
}
