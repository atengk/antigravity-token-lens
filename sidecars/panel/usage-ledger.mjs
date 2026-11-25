/**
 * 全量周期用量账本引擎，维护单文件增量持久化索引（usage-index.json），支持流式大文件防 OOM 与日/周/月/年统计。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { resolveModelInfo } from './metrics.mjs';
import { CONVERSATION_ID_RE, MODEL_SETTING_RE } from './transcript.mjs';

const LEDGER_VERSION = 2;
const SYNC_TTL_MS = 15 * 1000;
const STREAM_THRESHOLD_BYTES = 4 * 1024 * 1024;
const MAX_LEDGER_FILE_BYTES = 16 * 1024 * 1024;
const SCAN_CONCURRENCY = 8;
const DAILY_SERIES_COUNT = 14;
const WEEKLY_SERIES_COUNT = 12;
const MONTHLY_SERIES_COUNT = 12;
const TOP_CONVERSATIONS_LIMIT = 15;
const SUBAGENT_ID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalDayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 计算指定本地日期所属的 ISO 自然周键（格式 `YYYY-Www`）。
 *
 * @param {Date} date 本地日期对象
 * @return {string}
 */
export function toLocalIsoWeekKey(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${pad2(weekNo)}`;
}

function parseLocalDayDate(dayKey) {
  const parts = String(dayKey || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return null;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function dayKeyToPeriodKey(dayKey, period) {
  if (period === 'day') return dayKey;
  if (period === 'month') return dayKey.slice(0, 7);
  if (period === 'year') return dayKey.slice(0, 4);
  if (period === 'week') {
    const dt = parseLocalDayDate(dayKey);
    return dt ? toLocalIsoWeekKey(dt) : null;
  }
  return dayKey;
}

function parseNonNegInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  }
  return 0;
}

function emptyLedgerDoc() {
  return { version: LEDGER_VERSION, updatedAt: null, conversations: {} };
}

function normalizeLedgerDoc(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== LEDGER_VERSION) {
    return emptyLedgerDoc();
  }
  const src = raw.conversations && typeof raw.conversations === 'object' && !Array.isArray(raw.conversations)
    ? raw.conversations
    : {};
  const conversations = {};
  for (const [id, entry] of Object.entries(src)) {
    if (!CONVERSATION_ID_RE.test(id) || !entry || typeof entry !== 'object') continue;
    const byDay = {};
    if (entry.byDay && typeof entry.byDay === 'object') {
      for (const [dayKey, modelMap] of Object.entries(entry.byDay)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !modelMap || typeof modelMap !== 'object') continue;
        const cleanModels = {};
        for (const [mk, stats] of Object.entries(modelMap)) {
          if (!stats || typeof stats !== 'object') continue;
          cleanModels[mk] = {
            model: typeof stats.model === 'string' ? stats.model : mk,
            uncachedInput: parseNonNegInt(stats.uncachedInput),
            cacheRead: parseNonNegInt(stats.cacheRead),
            output: parseNonNegInt(stats.output),
            turns: parseNonNegInt(stats.turns),
          };
        }
        if (Object.keys(cleanModels).length > 0) byDay[dayKey] = cleanModels;
      }
    }
    conversations[id] = {
      mtimeMs: Number(entry.mtimeMs) || 0,
      size: Number(entry.size) || 0,
      title: typeof entry.title === 'string' && entry.title ? entry.title : id.slice(0, 8),
      subagentIds: Array.isArray(entry.subagentIds)
        ? entry.subagentIds.filter((s) => CONVERSATION_ID_RE.test(s || ''))
        : [],
      byDay,
    };
  }
  return {
    version: LEDGER_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    conversations,
  };
}

const FAMILY_DISPLAY_NAMES = new Map([
  ['gemini-4-hydrogen', 'Gemini 4 Hydrogen'],
  ['gemini-4-neon', 'Gemini 4 Neon'],
  ['gemini-4-argon', 'Gemini 4 Argon'],
  ['gemini-4-carbon', 'Gemini 4 Carbon'],
  ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
  ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
  ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
  ['claude-sonnet-5.5', 'Claude Sonnet 5.5'],
  ['claude-opus-5.5', 'Claude Opus 5.5'],
  ['claude-sonnet-4.6', 'Claude Sonnet 4.6'],
  ['claude-opus-4.6', 'Claude Opus 4.6'],
  ['orchestrator-neon', 'Orchestrator (Neon)'],
  ['orchestrator-argon', 'Orchestrator (Argon)'],
  ['gpt-oss-120b', 'GPT-OSS 120B'],
]);

function formatModelFamilyLabel(modelKey, fallbackDisplay) {
  if (modelKey && FAMILY_DISPLAY_NAMES.has(modelKey)) {
    return FAMILY_DISPLAY_NAMES.get(modelKey);
  }
  const base = String(fallbackDisplay || modelKey || 'Unknown')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/[-_](?:low|medium|high|xhigh|thinking)$/i, '')
    .trim();
  return base || 'Unknown';
}

function createLineParser(conversationId, fallbackDayKey) {
  let title = null;
  const subagentIds = new Set();
  const byDay = {};
  let fallbackModel = null;
  let settingModel = null;

  const feedLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    // 跳过不含关键字段的长文本工具日志行，降低解析 CPU 开销
    if (
      !line.includes('PLANNER_RESPONSE') &&
      !line.includes('USER_INPUT') &&
      !line.includes('Model Selection') &&
      !line.includes('conversationId') &&
      !line.includes('invoke_subagent')
    ) {
      return;
    }

    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return;
    }
    if (!row || typeof row !== 'object') return;

    const type = String(row.type || '');
    const content = typeof row.content === 'string' ? row.content : '';

    if (content && content.includes('Model Selection')) {
      const modelMatch = content.match(MODEL_SETTING_RE);
      const candidate = modelMatch?.[1]?.trim() || '';
      if (candidate && candidate.length <= 48 && !/\b(?:comment|need|ask)\b/i.test(candidate)) {
        settingModel = candidate;
      }
    }

    if (type === 'USER_INPUT' && !title && content) {
      const reqMatch = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
      const clean = (reqMatch ? reqMatch[1] : content).replace(/\s+/g, ' ').trim();
      if (clean) title = clean.slice(0, 64);
    }

    if (content && content.includes('conversationId')) {
      const idMatch =
        content.match(/conversationId["']?\s*[:=]\s*["']?([0-9a-f-]{36})/i) ||
        content.match(SUBAGENT_ID_RE);
      if (idMatch && idMatch[1] !== conversationId && CONVERSATION_ID_RE.test(idMatch[1])) {
        subagentIds.add(idMatch[1]);
      }
    }

    if (typeof row.model === 'string' && row.model.trim()) {
      fallbackModel = row.model.trim();
    }

    if (type !== 'PLANNER_RESPONSE') return;

    const uncachedInput = parseNonNegInt(row.input_tokens);
    const cacheRead = parseNonNegInt(row.cache_read_tokens);
    const output = parseNonNegInt(row.output_tokens);
    if (uncachedInput === 0 && cacheRead === 0 && output === 0) return;

    const ms = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
    const dayKey = Number.isFinite(ms) ? toLocalDayKey(new Date(ms)) : fallbackDayKey;
    const rawModel = (typeof row.model === 'string' && row.model.trim()) || fallbackModel || null;
    const resolved = resolveModelInfo(rawModel, settingModel, rawModel, null);
    const modelKey = resolved.key || (rawModel ? rawModel.toLowerCase() : 'unknown');
    const modelLabel = formatModelFamilyLabel(modelKey, resolved.display);

    if (!byDay[dayKey]) byDay[dayKey] = {};
    if (!byDay[dayKey][modelKey]) {
      byDay[dayKey][modelKey] = {
        model: modelLabel,
        uncachedInput: 0,
        cacheRead: 0,
        output: 0,
        turns: 0,
      };
    }
    const slot = byDay[dayKey][modelKey];
    slot.uncachedInput += uncachedInput;
    slot.cacheRead += cacheRead;
    slot.output += output;
    slot.turns += 1;
  };

  return {
    feedLine,
    finish: () => ({
      title: title || conversationId.slice(0, 8),
      subagentIds: [...subagentIds],
      byDay,
    }),
  };
}

async function parseTranscriptFile(filePath, fileSize, mtimeMs, conversationId) {
  const fallbackDayKey = toLocalDayKey(new Date(mtimeMs || Date.now()));
  const parser = createLineParser(conversationId, fallbackDayKey);

  if (fileSize > STREAM_THRESHOLD_BYTES) {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      parser.feedLine(line);
    }
  } else {
    const text = await readFile(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      parser.feedLine(line);
    }
  }

  return parser.finish();
}

async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * 持久化全量用量账本管理器，负责按文件 mtimeMs/size 增量索引与防丢保留。
 */
export class UsageLedgerStore {
  #filePath;
  #appDataCandidates;
  #nowFn;
  #cached = null;
  #lastSyncAt = -Infinity;
  #syncPending = null;
  #writeQueue = Promise.resolve();

  /**
   * @param {object} options 配置项
   * @param {string} options.dataDir Sidecar 持久化目录
   * @param {string[]} [options.appDataCandidates=[]] 候选应用数据目录
   * @param {Function} [options.nowFn=Date.now] 时钟函数
   */
  constructor({ dataDir, appDataCandidates = [], nowFn = Date.now }) {
    this.#filePath = join(dataDir, 'usage-index.json');
    this.#appDataCandidates = appDataCandidates;
    this.#nowFn = nowFn;
  }

  async #loadFromDisk() {
    if (this.#cached) return this.#cached;
    try {
      const text = await readFile(this.#filePath, 'utf8');
      if (text.length > MAX_LEDGER_FILE_BYTES) {
        this.#cached = emptyLedgerDoc();
        return this.#cached;
      }
      this.#cached = normalizeLedgerDoc(JSON.parse(text.replace(/^\uFEFF/, '')));
    } catch (err) {
      if (err?.code !== 'ENOENT' && !(err instanceof SyntaxError)) {
        throw err;
      }
      this.#cached = emptyLedgerDoc();
    }
    return this.#cached;
  }

  async #persistDoc(doc) {
    const task = this.#writeQueue.catch(() => {}).then(async () => {
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
    });
    this.#writeQueue = task;
    return task;
  }

  /**
   * 增量扫描变化轨迹并原子刷新本地账本索引（历史目录被删时仍保留已入账数据）。
   *
   * @param {{ force?: boolean }} [options] 同步选项
   * @return {Promise<object>}
   */
  async sync({ force = false } = {}) {
    const now = this.#nowFn();
    const doc = await this.#loadFromDisk();
    if (!force && this.#lastSyncAt > 0 && now - this.#lastSyncAt < SYNC_TTL_MS) {
      return structuredClone(doc);
    }
    if (this.#syncPending) return this.#syncPending;

    this.#syncPending = this.#runIncrementalSync(doc)
      .then((nextDoc) => {
        this.#lastSyncAt = this.#nowFn();
        return structuredClone(nextDoc);
      })
      .finally(() => {
        this.#syncPending = null;
      });

    return this.#syncPending;
  }

  async #runIncrementalSync(doc) {
    const candidates = [];
    const seenIds = new Set();

    for (const appDir of this.#appDataCandidates) {
      const brainRoot = join(appDir, 'brain');
      let entries;
      try {
        entries = await readdir(brainRoot, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const ent of entries) {
        if (!ent.isDirectory() || !CONVERSATION_ID_RE.test(ent.name) || seenIds.has(ent.name)) continue;
        seenIds.add(ent.name);
        const transcriptPath = join(brainRoot, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
        candidates.push({ id: ent.name, transcriptPath });
      }
    }

    const toScan = [];
    await mapWithConcurrency(candidates, SCAN_CONCURRENCY, async ({ id, transcriptPath }) => {
      try {
        const st = await stat(transcriptPath);
        const existing = doc.conversations[id];
        if (!existing || existing.mtimeMs !== st.mtimeMs || existing.size !== st.size) {
          toScan.push({ id, transcriptPath, mtimeMs: st.mtimeMs, size: st.size });
        }
      } catch {
        // 尚无 transcript.jsonl 的会话目录直接跳过
      }
    });

    if (toScan.length === 0) {
      return doc;
    }

    await mapWithConcurrency(toScan, SCAN_CONCURRENCY, async (item) => {
      try {
        const parsed = await parseTranscriptFile(item.transcriptPath, item.size, item.mtimeMs, item.id);
        doc.conversations[item.id] = {
          mtimeMs: item.mtimeMs,
          size: item.size,
          title: parsed.title,
          subagentIds: parsed.subagentIds,
          byDay: parsed.byDay,
        };
      } catch {
        // 单文件损坏或并发写入竞争时跳过，等待下轮恢复
      }
    });

    doc.updatedAt = new Date(this.#nowFn()).toISOString();
    await this.#persistDoc(doc);
    return doc;
  }
}

function buildRecentPeriodKeys(period, nowMs, presentKeys) {
  const now = new Date(nowMs);
  const keys = [];
  const seen = new Set();

  const pushKey = (k) => {
    if (k && !seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  };

  if (period === 'day') {
    for (let i = DAILY_SERIES_COUNT - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      pushKey(toLocalDayKey(d));
    }
  } else if (period === 'week') {
    for (let i = WEEKLY_SERIES_COUNT - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
      pushKey(toLocalIsoWeekKey(d));
    }
  } else if (period === 'month') {
    for (let i = MONTHLY_SERIES_COUNT - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      pushKey(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
    }
  } else {
    const years = [...presentKeys].sort();
    const curYear = String(now.getFullYear());
    if (!years.includes(curYear)) years.push(curYear);
    for (const y of years) pushKey(y);
  }

  return keys;
}

function resolveRootConversationId(convId, childToParent) {
  let cur = convId;
  const visited = new Set([cur]);
  while (childToParent.has(cur)) {
    const next = childToParent.get(cur);
    if (!next || visited.has(next)) break;
    visited.add(next);
    cur = next;
  }
  return cur;
}

/**
 * 按日 / 周 / 月 / 年周期聚合持久化用量账本，返回周期趋势、模型分布与按主会话归并的 Top 榜单。
 *
 * @param {object} ledgerDoc UsageLedgerStore 输出的账本对象
 * @param {object} [options] 聚合选项
 * @param {'day'|'week'|'month'|'year'} [options.period='day'] 时间周期粒度
 * @param {string|null} [options.targetKey=null] 选中周期键
 * @param {number} [options.nowMs=Date.now()] 当前毫秒时间戳
 * @param {Record<string, { parentId?: string|null, title?: string|null }>} [options.onlineMeta={}] 在线会话父子与标题补充信息
 * @return {object}
 */
export function aggregateUsageByPeriod(
  ledgerDoc,
  { period = 'day', targetKey = null, nowMs = Date.now(), onlineMeta = {} } = {},
) {
  const validPeriod = ['day', 'week', 'month', 'year'].includes(period) ? period : 'day';
  const conversations = ledgerDoc?.conversations || {};
  const periodTotals = new Map();
  const childToParent = new Map();

  for (const [id, entry] of Object.entries(conversations)) {
    for (const subId of entry.subagentIds || []) {
      if (!childToParent.has(subId)) childToParent.set(subId, id);
    }
  }
  for (const [id, meta] of Object.entries(onlineMeta)) {
    if (meta?.parentId && meta.parentId !== id) {
      childToParent.set(id, meta.parentId);
    }
  }

  for (const entry of Object.values(conversations)) {
    for (const [dayKey, modelMap] of Object.entries(entry.byDay || {})) {
      const pKey = dayKeyToPeriodKey(dayKey, validPeriod);
      if (!pKey) continue;
      let bucket = periodTotals.get(pKey);
      if (!bucket) {
        bucket = { key: pKey, uncachedInput: 0, cacheRead: 0, output: 0, totalTokens: 0, turns: 0 };
        periodTotals.set(pKey, bucket);
      }
      for (const st of Object.values(modelMap)) {
        bucket.uncachedInput += st.uncachedInput || 0;
        bucket.cacheRead += st.cacheRead || 0;
        bucket.output += st.output || 0;
        bucket.turns += st.turns || 0;
      }
      bucket.totalTokens = bucket.uncachedInput + bucket.cacheRead + bucket.output;
    }
  }

  const seriesKeys = buildRecentPeriodKeys(validPeriod, nowMs, new Set(periodTotals.keys()));
  const selectedKey =
    targetKey && typeof targetKey === 'string' && targetKey.trim()
      ? targetKey.trim()
      : seriesKeys.at(-1);

  const series = seriesKeys.map((k) => {
    const b = periodTotals.get(k) || {
      key: k,
      uncachedInput: 0,
      cacheRead: 0,
      output: 0,
      totalTokens: 0,
      turns: 0,
    };
    const cacheBase = b.uncachedInput + b.cacheRead;
    return {
      ...b,
      cacheHitRate: cacheBase > 0 ? b.cacheRead / cacheBase : null,
    };
  });

  const allBuckets = [...new Set([...periodTotals.keys(), ...seriesKeys])]
    .sort()
    .reverse()
    .map((k) => {
      const b = periodTotals.get(k) || {
        key: k,
        uncachedInput: 0,
        cacheRead: 0,
        output: 0,
        totalTokens: 0,
        turns: 0,
      };
      const cacheBase = b.uncachedInput + b.cacheRead;
      return { ...b, cacheHitRate: cacheBase > 0 ? b.cacheRead / cacheBase : null };
    });

  // 计算选定周期内的模型分布与主会话 Top 榜单
  const selectedTotals = { key: selectedKey, uncachedInput: 0, cacheRead: 0, output: 0, totalTokens: 0, turns: 0 };
  const modelAgg = new Map();
  const convAgg = new Map();

  for (const [convId, entry] of Object.entries(conversations)) {
    let convIn = 0;
    let convCr = 0;
    let convOut = 0;
    let convTurns = 0;

    for (const [dayKey, modelMap] of Object.entries(entry.byDay || {})) {
      if (dayKeyToPeriodKey(dayKey, validPeriod) !== selectedKey) continue;
      for (const [modelKey, st] of Object.entries(modelMap)) {
        const inp = st.uncachedInput || 0;
        const cr = st.cacheRead || 0;
        const out = st.output || 0;
        const turns = st.turns || 0;

        selectedTotals.uncachedInput += inp;
        selectedTotals.cacheRead += cr;
        selectedTotals.output += out;
        selectedTotals.turns += turns;

        convIn += inp;
        convCr += cr;
        convOut += out;
        convTurns += turns;

        let mSlot = modelAgg.get(modelKey);
        if (!mSlot) {
          mSlot = { modelKey, model: st.model || modelKey, uncachedInput: 0, cacheRead: 0, output: 0, totalTokens: 0, turns: 0 };
          modelAgg.set(modelKey, mSlot);
        }
        mSlot.uncachedInput += inp;
        mSlot.cacheRead += cr;
        mSlot.output += out;
        mSlot.turns += turns;
        mSlot.totalTokens = mSlot.uncachedInput + mSlot.cacheRead + mSlot.output;
      }
    }

    if (convIn + convCr + convOut > 0) {
      const rootId = resolveRootConversationId(convId, childToParent);
      const isChild = rootId !== convId;
      let cSlot = convAgg.get(rootId);
      if (!cSlot) {
        const rootEntry = conversations[rootId];
        const rootMeta = onlineMeta[rootId];
        cSlot = {
          id: rootId,
          title: rootMeta?.title || rootEntry?.title || entry.title || rootId.slice(0, 8),
          isSubagent: childToParent.has(rootId),
          subagentSet: new Set(),
          uncachedInput: 0,
          cacheRead: 0,
          output: 0,
          totalTokens: 0,
          turns: 0,
        };
        convAgg.set(rootId, cSlot);
      }
      if (isChild) cSlot.subagentSet.add(convId);
      cSlot.uncachedInput += convIn;
      cSlot.cacheRead += convCr;
      cSlot.output += convOut;
      cSlot.turns += convTurns;
      cSlot.totalTokens = cSlot.uncachedInput + cSlot.cacheRead + cSlot.output;
    }
  }

  selectedTotals.totalTokens = selectedTotals.uncachedInput + selectedTotals.cacheRead + selectedTotals.output;
  const selCacheBase = selectedTotals.uncachedInput + selectedTotals.cacheRead;
  selectedTotals.cacheHitRate = selCacheBase > 0 ? selectedTotals.cacheRead / selCacheBase : null;

  const byModel = [...modelAgg.values()]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map((m) => {
      const base = m.uncachedInput + m.cacheRead;
      return {
        ...m,
        cacheHitRate: base > 0 ? m.cacheRead / base : null,
        sharePct: selectedTotals.totalTokens > 0 ? (m.totalTokens / selectedTotals.totalTokens) * 100 : 0,
      };
    });

  const topConversations = [...convAgg.values()]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, TOP_CONVERSATIONS_LIMIT)
    .map(({ subagentSet, ...rest }) => {
      const base = rest.uncachedInput + rest.cacheRead;
      return {
        ...rest,
        subagentCount: subagentSet.size,
        cacheHitRate: base > 0 ? rest.cacheRead / base : null,
      };
    });

  return {
    period: validPeriod,
    selectedKey,
    conversationCount: Object.keys(conversations).length,
    updatedAt: ledgerDoc?.updatedAt || null,
    selected: selectedTotals,
    series,
    availableKeys: allBuckets.map((b) => b.key),
    byModel,
    topConversations,
  };
}
