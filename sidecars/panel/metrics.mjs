/**
 * 指标归一化与诊断引擎，基于 RPC 投影或本地 transcript 计算上下文水位、Token/s、TTFT、缓存命中率与子代理汇总。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fmtCompact: formatCompactUnits } = require('./units.cjs');

const MODEL_ALIASES = new Map([
  // Gemini 4 Neon
  ['model_placeholder_m532', { key: 'gemini-4-neon', display: 'Gemini 4 Neon (High)' }],
  ['model_placeholder_m535', { key: 'gemini-4-neon', display: 'Gemini 4 Neon (XHigh)' }],
  ['model_placeholder_m533', { key: 'gemini-4-neon', display: 'Gemini 4 Neon (Medium)' }],
  ['model_placeholder_m534', { key: 'gemini-4-neon', display: 'Gemini 4 Neon (Low)' }],
  // Gemini 4 Argon
  ['model_placeholder_m417', { key: 'gemini-4-argon', display: 'Gemini 4 Argon (High)' }],
  ['model_placeholder_m418', { key: 'gemini-4-argon', display: 'Gemini 4 Argon (Medium)' }],
  ['model_placeholder_m419', { key: 'gemini-4-argon', display: 'Gemini 4 Argon (Low)' }],
  // Gemini 4 Hydrogen
  ['model_placeholder_m525', { key: 'gemini-4-hydrogen', display: 'Gemini 4 Hydrogen (High)' }],
  ['model_placeholder_m528', { key: 'gemini-4-hydrogen', display: 'Gemini 4 Hydrogen (XHigh)' }],
  ['model_placeholder_m526', { key: 'gemini-4-hydrogen', display: 'Gemini 4 Hydrogen (Medium)' }],
  ['model_placeholder_m527', { key: 'gemini-4-hydrogen', display: 'Gemini 4 Hydrogen (Low)' }],
  // Orchestrator & Carbon
  ['model_placeholder_m537', { key: 'orchestrator-neon', display: 'Orchestrator (Neon)' }],
  ['model_placeholder_m668', { key: 'orchestrator-argon', display: 'Orchestrator (Argon)' }],
  ['model_placeholder_m670', { key: 'gemini-4-carbon', display: 'Gemini 4 Carbon' }],
  // Gemini 3.8 Flash
  ['model_placeholder_m318', { key: 'gemini-3.8-flash', display: 'Gemini 3.8 Flash (High)' }],
  ['model_placeholder_m319', { key: 'gemini-3.8-flash', display: 'Gemini 3.8 Flash (Medium)' }],
  ['model_placeholder_m320', { key: 'gemini-3.8-flash', display: 'Gemini 3.8 Flash (Low)' }],
  // Claude 5.5 & 4.6
  ['model_placeholder_m400', { key: 'claude-opus-5.5', display: 'Claude Opus 5.5 (Low)' }],
  ['model_placeholder_m401', { key: 'claude-opus-5.5', display: 'Claude Opus 5.5 (Medium)' }],
  ['model_placeholder_m402', { key: 'claude-opus-5.5', display: 'Claude Opus 5.5 (High)' }],
  ['model_placeholder_m403', { key: 'claude-sonnet-5.5', display: 'Claude Sonnet 5.5 (Low)' }],
  ['model_placeholder_m404', { key: 'claude-sonnet-5.5', display: 'Claude Sonnet 5.5 (Medium)' }],
  ['model_placeholder_m405', { key: 'claude-sonnet-5.5', display: 'Claude Sonnet 5.5 (High)' }],
  ['model_placeholder_m35', { key: 'claude-sonnet-4.6', display: 'Claude Sonnet 4.6 (Thinking)' }],
  ['model_placeholder_m26', { key: 'claude-opus-4.6', display: 'Claude Opus 4.6 (Thinking)' }],
  // GPT-OSS
  ['model_openai_gpt_oss_120b_medium', { key: 'gpt-oss-120b', display: 'GPT-OSS 120B (Medium)' }],
]);

// 依据 ADR-0001：统一采用 Antigravity 宿主有效上下文上限作为离线/首轮兜底基准
const MODEL_DEFAULT_LIMITS = new Map([
  ['gemini-4-neon', 512_000],
  ['gemini-4-hydrogen', 512_000],
  ['gemini-4-argon', 512_000],
  ['gemini-4-carbon', 512_000],
  ['orchestrator-neon', 512_000],
  ['orchestrator-argon', 512_000],
  ['gemini-3.8-flash', 512_000],
  ['gemini-2.5-pro', 1_048_576],
  ['gemini-2.5-flash', 1_048_576],
  ['claude-sonnet-5.5', 512_000],
  ['claude-opus-5.5', 512_000],
  ['claude-sonnet-4.6', 200_000],
  ['claude-opus-4.6', 200_000],
  ['gpt-oss-120b', 131_072],
]);

const MODEL_FAMILY_PATTERNS = [
  [/gemini[-_\s]*4[-_\s]*neon/, 'gemini-4-neon'],
  [/gemini[-_\s]*4[-_\s]*hydrogen/, 'gemini-4-hydrogen'],
  [/gemini[-_\s]*4[-_\s]*argon/, 'gemini-4-argon'],
  [/gemini[-_\s]*4[-_\s]*carbon/, 'gemini-4-carbon'],
  [/orchestrator.*neon/, 'orchestrator-neon'],
  [/orchestrator.*(?:argon|g1[-_\s]*pro)/, 'orchestrator-argon'],
  [/gemini[-_\s]*3\.8[-_\s]*flash/, 'gemini-3.8-flash'],
  [/gemini[-_\s]*2\.5[-_\s]*pro/, 'gemini-2.5-pro'],
  [/gemini[-_\s]*2\.5[-_\s]*flash/, 'gemini-2.5-flash'],
  [/claude[-_\s]*sonnet[-_\s]*5[.\s-]*5/, 'claude-sonnet-5.5'],
  [/claude[-_\s]*opus[-_\s]*5[.\s-]*5/, 'claude-opus-5.5'],
  [/claude[-_\s]*sonnet/, 'claude-sonnet-4.6'],
  [/claude[-_\s]*opus/, 'claude-opus-4.6'],
  [/gpt[-_\s]*oss[-_\s]*120b/, 'gpt-oss-120b'],
];

const MIN_VALID_DURATION_SEC = 0.05;
const MIN_PEAK_DURATION_SEC = 0.25;
const MIN_PEAK_OUTPUT_TOKENS = 20;
const MAX_SERIES_POINTS = 16;
const MAX_TOP_MESSAGES = 10;
const CUSTOM_SYSTEM_SECTIONS = new Set([
  'user_rules',
  'skills',
  'subagents',
  'featured_plugins',
  'mcp_servers',
  'slash_commands',
]);

function normalizeModelFamilyKey(probe) {
  if (!probe) return null;
  for (const [pattern, familyKey] of MODEL_FAMILY_PATTERNS) {
    if (pattern.test(probe)) return familyKey;
  }
  return null;
}

function findCatalogEntry(modelCatalog, cleanRaw, cleanDisplay, cleanResp) {
  if (!Array.isArray(modelCatalog) || modelCatalog.length === 0) return null;
  const targets = [cleanRaw, cleanResp, cleanDisplay].filter(Boolean).map((s) => s.toLowerCase());
  if (targets.length === 0) return null;
  for (const entry of modelCatalog) {
    if (!entry || typeof entry !== 'object') continue;
    const candidates = [entry.rawModel, entry.modelId, entry.display]
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => v.trim().toLowerCase());
    if (targets.some((t) => candidates.includes(t))) {
      return entry;
    }
  }
  return null;
}

/**
 * 将原始模型标识符与显示名称规范为统一键与展示文案。
 * 解析优先级：在线实时目录（GetUserStatus）> 静态别名兜底 > 家族正则与后缀剥离归一化。
 *
 * @param {string|null} rawModel 原始模型枚举或标识
 * @param {string|null} [displayName=null] 宿主上报的可读模型名称
 * @param {string|null} [responseModel=null] 响应模型 ID
 * @param {Array<object>|null} [modelCatalog=null] GetUserStatus 实时模型目录
 * @return {{ key: string|null, display: string }}
 */
export function resolveModelInfo(rawModel, displayName = null, responseModel = null, modelCatalog = null) {
  const cleanDisplay = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null;
  const cleanResp = typeof responseModel === 'string' && responseModel.trim() ? responseModel.trim() : null;
  const cleanRaw = typeof rawModel === 'string' && rawModel.trim() ? rawModel.trim() : null;

  const catalogEntry = findCatalogEntry(modelCatalog, cleanRaw, cleanDisplay, cleanResp);
  const alias = cleanRaw ? MODEL_ALIASES.get(cleanRaw.toLowerCase()) : null;
  const display = cleanDisplay || catalogEntry?.display || alias?.display || cleanResp || cleanRaw || 'Unknown';

  const probe = (
    catalogEntry?.modelId ||
    catalogEntry?.display ||
    cleanResp ||
    cleanDisplay ||
    alias?.key ||
    cleanRaw ||
    ''
  ).toLowerCase();

  let key = normalizeModelFamilyKey(probe) || alias?.key || null;
  if (!key && probe) {
    if (cleanResp) key = cleanResp.toLowerCase();
    else {
      // 对未预置模型名剥离档位后缀（如 (High)/(Thinking)）后归一化，确保用户自定义上限可跨会话复用
      const normalized = probe
        .replace(/\s*\([^)]*\)\s*$/g, '')
        .trim()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (normalized) key = normalized;
    }
  }

  return { key, display };
}

/**
 * 解析 Protojson Duration（如 "15.346316800s"、"450ms" 或数值秒）为秒数。
 *
 * @param {unknown} value 时长字段
 * @return {number|null}
 */
export function parseDurationSec(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('ms')) {
    const ms = Number(trimmed.slice(0, -2));
    return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null;
  }
  if (trimmed.endsWith('s')) {
    const sec = Number(trimmed.slice(0, -1));
    return Number.isFinite(sec) && sec >= 0 ? sec : null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function parseIsoMs(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function resolveContextLimit({ conversationId, modelInfo, hostMaxTokens, preferences }) {
  const overrides = preferences?.contextLimitOverrides || {};
  const overrideTokens =
    overrides[conversationId] ??
    (modelInfo.key ? overrides[modelInfo.key] : undefined) ??
    overrides[modelInfo.display];

  if (Number.isSafeInteger(overrideTokens) && overrideTokens > 0) {
    return { maxTokens: overrideTokens, maxSource: 'override' };
  }
  if (Number.isSafeInteger(hostMaxTokens) && hostMaxTokens > 0) {
    return { maxTokens: hostMaxTokens, maxSource: 'host' };
  }
  const ref = modelInfo.key ? MODEL_DEFAULT_LIMITS.get(modelInfo.key) : null;
  if (ref) {
    return { maxTokens: ref, maxSource: 'reference' };
  }
  return { maxTokens: null, maxSource: 'unknown' };
}

function resolveAlertLevel(usedPercent, preferences) {
  if (usedPercent === null) return 'normal';
  const warnAt = preferences?.warnAt ?? 70;
  const criticalAt = preferences?.criticalAt ?? 85;
  if (usedPercent >= criticalAt) return 'critical';
  if (usedPercent >= warnAt) return 'warn';
  return 'normal';
}

function formatChatStepLabel(rawName, steps) {
  const m = String(rawName || '').match(/^(\d+)\s*:\s*(.*)$/);
  if (!m) return { label: String(rawName || ''), stepIndex: null, toolName: null, hasError: false };
  const stepIndex = Number(m[1]);
  const st = steps?.[stepIndex];
  if (!st) return { label: String(rawName || ''), stepIndex, toolName: null, hasError: false };

  if (st.toolSummary) {
    const t = st.toolSummary;
    const target = t.target ? ` (${t.target})` : '';
    return {
      label: `#${stepIndex} · ${t.name}${target}`,
      stepIndex,
      toolName: t.name,
      hasError: Boolean(t.hasError),
    };
  }
  if (st.type?.includes('USER_INPUT')) {
    const preview = st.userPreview ? ` (${st.userPreview})` : '';
    return {
      label: `#${stepIndex} · 用户输入${preview}`,
      stepIndex,
      toolName: null,
      hasError: false,
    };
  }
  if (st.type?.includes('PLANNER_RESPONSE')) {
    const toolNote = st.toolCallCount > 0 ? ` (调用 ${st.toolCallCount} 工具)` : '';
    return {
      label: `#${stepIndex} · 模型回复${toolNote}`,
      stepIndex,
      toolName: null,
      hasError: false,
    };
  }
  return { label: String(rawName || ''), stepIndex, toolName: null, hasError: false };
}

function buildBreakdownSummary(rawBreakdown, steps = []) {
  if (!rawBreakdown || !Array.isArray(rawBreakdown.groups) || rawBreakdown.groups.length === 0) {
    return null;
  }

  const groupTotal = rawBreakdown.groups.reduce((acc, g) => acc + (g.numTokens || 0), 0);
  const totalTokens = rawBreakdown.totalTokens > 0 ? rawBreakdown.totalTokens : groupTotal;
  if (totalTokens <= 0) return null;

  let topMessages = [];
  const stepContextTokens = new Map();

  const groups = rawBreakdown.groups.map((g) => {
    const key = classifyBreakdownGroup(g.type, g.name);
    const sortedItems = [...(g.children || [])]
      .filter((c) => c.numTokens > 0)
      .sort((a, b) => b.numTokens - a.numTokens)
      .map((c) => {
        const meta = key === 'chat' ? formatChatStepLabel(c.name, steps) : { label: c.name, stepIndex: null, toolName: null, hasError: false };
        if (meta.stepIndex !== null) {
          stepContextTokens.set(meta.stepIndex, c.numTokens);
        }
        return {
          name: c.name,
          label: meta.label,
          stepIndex: meta.stepIndex,
          toolName: meta.toolName,
          hasError: meta.hasError,
          tokens: c.numTokens,
          percent: (c.numTokens / totalTokens) * 100,
        };
      });

    if (key === 'chat') {
      topMessages = sortedItems.slice(0, MAX_TOP_MESSAGES);
    }

    return {
      key,
      name: g.name || key,
      tokens: g.numTokens,
      percent: (g.numTokens / totalTokens) * 100,
      items: key === 'chat' ? sortedItems.slice(0, 40) : sortedItems.slice(0, 60),
    };
  });

  return { totalTokens, groups, topMessages, stepContextTokens };
}

const CUSTOM_BREAKDOWN_GROUPS = new Set(['mcp', 'subagents', 'skills', 'plugins', 'rules']);

function classifyBreakdownGroup(type, name) {
  const probe = `${type || ''} ${name || ''}`.toLowerCase();
  if (probe.includes('mcp')) return 'mcp';
  if (probe.includes('subagent')) return 'subagents';
  if (probe.includes('skill')) return 'skills';
  if (probe.includes('plugin')) return 'plugins';
  if (probe.includes('rule')) return 'rules';
  if (probe.includes('system')) return 'system';
  if (probe.includes('tool')) return 'tools';
  if (probe.includes('chat') || probe.includes('message')) return 'chat';
  return 'other';
}

function emptyAccumulator() {
  return {
    uncachedInput: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    thinkingOutput: 0,
    responseOutput: 0,
    totalTokens: 0,
  };
}

function addToAccumulator(target, delta) {
  target.uncachedInput += delta.uncachedInput || 0;
  target.cacheRead += delta.cacheRead || 0;
  target.cacheWrite += delta.cacheWrite || 0;
  target.output += delta.output || 0;
  target.thinkingOutput += delta.thinkingOutput || 0;
  target.responseOutput += delta.responseOutput || 0;
  target.totalTokens =
    target.uncachedInput + target.cacheRead + target.cacheWrite + target.output;
}

/**
 * 依据单轮缓存命中率跳跃与模型切换检测是否发生前缀缓存重建。
 *
 * @param {object|null} prevTurn 上一轮明细
 * @param {object} currentTurn 当前轮明细
 * @return {boolean}
 */
function detectCacheRebuild(prevTurn, currentTurn) {
  if (!prevTurn) return false;
  const currentTotalInput = currentTurn.inputTokens + currentTurn.cacheReadTokens;
  if (currentTotalInput < 4096 || currentTurn.cacheHitRate === null) return false;

  if (
    prevTurn.modelKey &&
    currentTurn.modelKey &&
    prevTurn.modelKey !== currentTurn.modelKey &&
    currentTurn.cacheHitRate < 0.35
  ) {
    return true;
  }

  if (prevTurn.cacheHitRate === null || prevTurn.cacheHitRate < 0.5) return false;
  if (currentTurn.cacheHitRate < 0.15) return true;
  return currentTurn.cacheHitRate < 0.35 && prevTurn.cacheHitRate - currentTurn.cacheHitRate >= 0.45;
}

function summarizeStepTools(stepIndices, steps) {
  const byTool = new Map();
  for (const idx of stepIndices) {
    const t = steps[idx]?.toolSummary;
    if (!t) continue;
    const prev = byTool.get(t.name) || { name: t.name, count: 0, hasError: false };
    prev.count += 1;
    if (t.hasError) prev.hasError = true;
    byTool.set(t.name, prev);
  }
  return [...byTool.values()];
}

function computePercentile(sortedNums, ratio) {
  if (!sortedNums.length) return null;
  const idx = Math.min(sortedNums.length - 1, Math.max(0, Math.ceil(sortedNums.length * ratio) - 1));
  return sortedNums[idx];
}

function computeContextGrowth(turns, usedTokens, maxTokens, criticalAt = 85) {
  const deltas = [];
  for (let i = 1; i < turns.length; i++) {
    const prev = turns[i - 1].contextSnapshotTokens;
    const curr = turns[i].contextSnapshotTokens;
    if (typeof prev === 'number' && typeof curr === 'number' && curr > prev) {
      deltas.push(curr - prev);
    }
  }
  const recent = deltas.slice(-6);
  const avgPerTurn = recent.length > 0 ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
  let estTurnsToCritical = null;
  if (avgPerTurn && avgPerTurn > 0 && typeof usedTokens === 'number' && typeof maxTokens === 'number' && maxTokens > 0) {
    const critLimit = maxTokens * (criticalAt / 100);
    estTurnsToCritical = usedTokens >= critLimit ? 0 : Math.max(1, Math.floor((critLimit - usedTokens) / avgPerTurn));
  }
  return { avgPerTurn, estTurnsToCritical };
}

function aggregateDiagnostics(steps, breakdown, retryAcc, budgetSource) {
  const stepContextTokens = breakdown?.stepContextTokens || new Map();
  const toolMap = new Map();
  let totalToolSec = 0;

  for (const st of steps) {
    const t = st?.toolSummary;
    if (!t) continue;
    const entry = toolMap.get(t.name) || {
      name: t.name,
      count: 0,
      errorCount: 0,
      totalDurationSec: 0,
      contextTokens: 0,
    };
    entry.count += 1;
    if (t.hasError) entry.errorCount += 1;
    const sMs = parseIsoMs(st.startedAt);
    const eMs = parseIsoMs(st.completedAt);
    if (sMs !== null && eMs !== null && eMs >= sMs) {
      const dur = (eMs - sMs) / 1000;
      if (dur <= 3600) {
        entry.totalDurationSec += dur;
        totalToolSec += dur;
      }
    }
    const ctxTok = stepContextTokens.get(st.index) || 0;
    entry.contextTokens += ctxTok;
    toolMap.set(t.name, entry);
  }

  const tools = [...toolMap.values()].sort(
    (a, b) => b.contextTokens - a.contextTokens || b.count - a.count,
  );

  let customUsedTokens = 0;
  for (const g of breakdown?.groups || []) {
    if (CUSTOM_BREAKDOWN_GROUPS.has(g.key)) {
      customUsedTokens += g.tokens || 0;
    }
  }
  if (customUsedTokens === 0) {
    const sysGroup = breakdown?.groups?.find((g) => g.key === 'system');
    if (sysGroup?.items) {
      for (const item of sysGroup.items) {
        if (CUSTOM_SYSTEM_SECTIONS.has(item.name)) {
          customUsedTokens += item.tokens;
        }
      }
    }
  }

  return {
    totalToolSec,
    diagnostics: {
      retry: retryAcc,
      tools,
      budgets: {
        rulesTokenBudget: budgetSource?.rulesTokenBudget ?? null,
        customizationTokenBudget: budgetSource?.customizationTokenBudget ?? null,
        customUsedTokens,
      },
    },
  };
}

function isPendingStepStatus(status) {
  const s = String(status || '');
  if (/RUNNING|GENERATING|RETRY/i.test(s)) return true;
  return /WAITING/i.test(s) && !/WAITING_FOR_USER/i.test(s);
}

function isRetryErrorStep(step) {
  if (!step) return false;
  const type = String(step.type || '');
  const status = String(step.status || '');
  return (
    type.includes('ERROR_MESSAGE') ||
    type.includes('RETRY') ||
    /RETRY/i.test(status) ||
    Boolean(step.errorSummary)
  );
}

function findTrailingRetryInfo(steps, pendingIdx) {
  let endIdx = steps.length - 1;
  const pendingStep = pendingIdx >= 0 ? steps[pendingIdx] : null;
  // 若尾部正处于尚未首字吐出的 PLANNER_RESPONSE（可能是重连尝试中），跳过它往前探测紧邻的错误重试步
  if (
    pendingStep &&
    pendingIdx === endIdx &&
    String(pendingStep.type || '').includes('PLANNER_RESPONSE') &&
    !parseIsoMs(pendingStep.viewableAt)
  ) {
    endIdx--;
  }

  let count = 0;
  let lastErrorStep = null;
  for (let i = endIdx; i >= 0; i--) {
    const st = steps[i];
    if (!isRetryErrorStep(st)) break;
    if (!lastErrorStep) lastErrorStep = st;
    count++;
  }

  if (!lastErrorStep) return null;
  const parsedAttempt = lastErrorStep.errorSummary?.attempt;
  const maxAttempts = lastErrorStep.errorSummary?.maxAttempts ?? null;
  return {
    attempt: Number.isInteger(parsedAttempt) && parsedAttempt > 0 ? Math.max(parsedAttempt, count) : count,
    maxAttempts: Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : null,
    errorMessage: lastErrorStep.errorSummary?.message || null,
    lastErrorAtMs: parseIsoMs(lastErrorStep.createdAt),
  };
}

function resolveActiveRun(summary, steps) {
  let pendingIdx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (isPendingStepStatus(steps[i]?.status)) {
      pendingIdx = i;
      break;
    }
  }
  const pendingStep = pendingIdx >= 0 ? steps[pendingIdx] : null;
  const viewableAtMs = parseIsoMs(pendingStep?.viewableAt);
  const pendingType = String(pendingStep?.type || '');
  const isStreaming = Boolean(viewableAtMs && (!pendingType || pendingType.includes('PLANNER_RESPONSE')));

  if (isStreaming) {
    return {
      startedAtMs: parseIsoMs(pendingStep?.createdAt) ?? parseIsoMs(summary.lastModifiedTime),
      viewableAtMs,
      phase: 'streaming',
      retryAttempt: null,
      retryMaxAttempts: null,
      retryError: null,
    };
  }

  const retryInfo = findTrailingRetryInfo(steps, pendingIdx);
  if (retryInfo || /RETRY/i.test(String(summary.status || ''))) {
    return {
      startedAtMs: parseIsoMs(pendingStep?.createdAt) ?? retryInfo?.lastErrorAtMs ?? parseIsoMs(summary.lastModifiedTime),
      viewableAtMs: null,
      phase: 'retrying',
      retryAttempt: retryInfo?.attempt ?? null,
      retryMaxAttempts: retryInfo?.maxAttempts ?? null,
      retryError: retryInfo?.errorMessage ?? null,
    };
  }

  return {
    startedAtMs: parseIsoMs(pendingStep?.createdAt) ?? parseIsoMs(summary.lastModifiedTime),
    viewableAtMs: null,
    phase: 'waiting',
    retryAttempt: null,
    retryMaxAttempts: null,
    retryError: null,
  };
}

/**
 * 根据 LS Trajectory 投影计算单会话的核心统计对象（不含跨子代理汇总）。
 *
 * @param {string} conversationId 会话 ID
 * @param {object} proj Trajectory 投影
 * @param {object} preferences 用户偏好
 * @param {{ modelCatalog?: Array<object>|null }} [options] 附加解析选项
 * @return {object}
 */
export function computeMetricsFromProjection(conversationId, proj, preferences, { modelCatalog = null } = {}) {
  const summary = proj.summary || {};
  const steps = Array.isArray(proj.steps) ? proj.steps : [];
  const gms = Array.isArray(proj.generatorMetadata) ? proj.generatorMetadata : [];

  const turns = [];
  const totals = emptyAccumulator();
  const ttftSamples = [];
  let latestContextWindow = null;
  let latestModelInfo = { key: null, display: 'Unknown' };
  let latestMeasuredPromptTokens = null;
  let latestGmPendingPreflight = false;
  let budgetSource = null;
  let totalStreamingSec = 0;
  let totalStreamingTokens = 0;
  let totalTtftSec = 0;
  let totalRawStreamingSec = 0;
  let stablePeakTps = null;
  let fallbackPeakTps = null;
  let rebuildCount = 0;
  const retryAcc = { count: 0, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let i = 0; i < gms.length; i++) {
    const gm = gms[i];
    if (gm.rulesTokenBudget || gm.customizationTokenBudget) {
      budgetSource = gm;
    }
    if (gm.retrySummary?.count > 0) {
      retryAcc.count += gm.retrySummary.count;
      retryAcc.inputTokens += gm.retrySummary.inputTokens || 0;
      retryAcc.cacheReadTokens += gm.retrySummary.cacheReadTokens || 0;
      retryAcc.outputTokens += gm.retrySummary.outputTokens || 0;
      retryAcc.totalTokens = retryAcc.inputTokens + retryAcc.cacheReadTokens + retryAcc.outputTokens;
    }

    const u = gm.usage;
    const rawModelCandidate = gm.model || u?.model || gm.plannerModelName;
    if (rawModelCandidate || gm.modelDisplayName || gm.responseModel) {
      latestModelInfo = resolveModelInfo(
        rawModelCandidate,
        gm.modelDisplayName,
        gm.responseModel || gm.plannerModelName,
        modelCatalog,
      );
    }
    if (gm.contextWindow) {
      latestContextWindow = gm.contextWindow;
    }

    const inputTokens = u?.inputTokens ?? 0;
    const cacheReadTokens = u?.cacheReadTokens ?? 0;
    const cacheWriteTokens = u?.cacheWriteTokens ?? 0;
    const outputTokens = u?.outputTokens ?? 0;
    const thinkingTokens = u?.thinkingOutputTokens ?? 0;
    const responseTokens = u?.responseOutputTokens ?? Math.max(0, outputTokens - thinkingTokens);
    const measuredPromptTokens = inputTokens + cacheReadTokens + cacheWriteTokens;

    if (measuredPromptTokens > 0) {
      latestMeasuredPromptTokens = measuredPromptTokens;
      latestGmPendingPreflight = false;
    } else if (Number.isFinite(gm.contextWindow?.estimatedTokensUsed) && gm.contextWindow.estimatedTokensUsed > 0) {
      latestGmPendingPreflight = true;
    }

    if (!u || (measuredPromptTokens === 0 && outputTokens === 0)) {
      continue;
    }

    const modelInfo = latestModelInfo;

    const associatedSteps = gm.stepIndices
      .map((idx) => steps[idx])
      .filter((s) => s && s.type.includes('PLANNER_RESPONSE'));
    const lastStep = associatedSteps.at(-1) || null;
    const stepIndex = lastStep?.index ?? gm.stepIndices.at(-1) ?? i;

    // 优先使用宿主提供的纳秒级 timeToFirstToken 与 streamingDuration
    let ttftSec = parseDurationSec(gm.timeToFirstToken);
    let streamingSec = parseDurationSec(gm.streamingDuration);
    let estimatedSpeed = false;

    if (streamingSec === null && lastStep) {
      const startMs = parseIsoMs(lastStep.createdAt) ?? parseIsoMs(gm.chatStartCreatedAt);
      const viewMs = parseIsoMs(lastStep.viewableAt);
      const endMs = parseIsoMs(lastStep.finishedGeneratingAt) ?? parseIsoMs(lastStep.completedAt);
      if (ttftSec === null && startMs !== null && viewMs !== null && viewMs >= startMs) {
        ttftSec = (viewMs - startMs) / 1000;
      }
      if (viewMs !== null && endMs !== null && endMs >= viewMs) {
        streamingSec = (endMs - viewMs) / 1000;
      } else if (startMs !== null && endMs !== null && endMs > startMs) {
        streamingSec = (endMs - startMs) / 1000;
        estimatedSpeed = true;
      }
    }

    if (ttftSec !== null) {
      totalTtftSec += ttftSec;
      ttftSamples.push(ttftSec);
    }
    if (streamingSec !== null) {
      totalRawStreamingSec += streamingSec;
    }

    const streamingTps =
      outputTokens > 0 && streamingSec !== null && streamingSec >= MIN_VALID_DURATION_SEC
        ? outputTokens / streamingSec
        : null;
    const isShortSample =
      streamingSec !== null &&
      (streamingSec < MIN_PEAK_DURATION_SEC || outputTokens < MIN_PEAK_OUTPUT_TOKENS);

    const totalSec =
      streamingSec !== null ? (ttftSec || 0) + streamingSec : null;
    const e2eTps =
      outputTokens > 0 && totalSec !== null && totalSec >= MIN_VALID_DURATION_SEC
        ? outputTokens / totalSec
        : null;

    if (streamingTps !== null) {
      totalStreamingSec += streamingSec;
      totalStreamingTokens += outputTokens;
      if (fallbackPeakTps === null || streamingTps > fallbackPeakTps) {
        fallbackPeakTps = streamingTps;
      }
      if (!isShortSample && (stablePeakTps === null || streamingTps > stablePeakTps)) {
        stablePeakTps = streamingTps;
      }
    }

    const cacheBase = inputTokens + cacheReadTokens;
    const cacheHitRate = cacheBase > 0 ? cacheReadTokens / cacheBase : null;
    const retryTokens = gm.retrySummary
      ? (gm.retrySummary.inputTokens || 0) + (gm.retrySummary.cacheReadTokens || 0) + (gm.retrySummary.outputTokens || 0)
      : 0;

    const turn = {
      index: turns.length + 1,
      stepIndex,
      model: modelInfo.display,
      modelKey: modelInfo.key,
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      thinkingTokens,
      responseTokens,
      cacheHitRate,
      ttftSec,
      streamingSec,
      totalSec,
      streamingTps,
      e2eTps,
      estimatedSpeed,
      isShortSample,
      cacheRebuilt: false,
      retryCount: gm.retrySummary?.count || 0,
      retryTokens,
      tools: summarizeStepTools(gm.stepIndices, steps),
      contextSnapshotTokens: measuredPromptTokens > 0 ? measuredPromptTokens : (gm.contextWindow?.estimatedTokensUsed ?? null),
      createdAt: lastStep?.createdAt || gm.chatStartCreatedAt || null,
    };

    turn.cacheRebuilt = detectCacheRebuild(turns.at(-1) || null, turn);
    if (turn.cacheRebuilt) rebuildCount++;

    turns.push(turn);
    addToAccumulator(totals, {
      uncachedInput: inputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
      output: outputTokens,
      thinkingOutput: thinkingTokens,
      responseOutput: responseTokens,
    });
  }

  const peakStreamingTps = stablePeakTps ?? fallbackPeakTps;
  const latestTurn = turns.at(-1) || null;
  const preflightTokens = Number.isFinite(latestContextWindow?.estimatedTokensUsed)
    ? latestContextWindow.estimatedTokensUsed
    : null;

  // 依据 ADR-0002：已完成轮优先采用服务端实测输入，生成中空档期或缺失 usage 时平滑回退到宿主预估
  let usedTokens = null;
  let usedSource = 'unknown';
  if (!latestGmPendingPreflight && latestMeasuredPromptTokens !== null && latestMeasuredPromptTokens > 0) {
    usedTokens = latestMeasuredPromptTokens;
    usedSource = 'measured';
  } else if (preflightTokens !== null) {
    usedTokens = preflightTokens;
    usedSource = 'preflight';
  } else if (latestMeasuredPromptTokens !== null && latestMeasuredPromptTokens > 0) {
    usedTokens = latestMeasuredPromptTokens;
    usedSource = 'measured';
  }
  const estimationDelta =
    usedSource === 'measured' && usedTokens !== null && preflightTokens !== null
      ? usedTokens - preflightTokens
      : null;

  const { maxTokens, maxSource } = resolveContextLimit({
    conversationId,
    modelInfo: latestModelInfo,
    hostMaxTokens: latestContextWindow?.maxContextTokens ?? null,
    preferences,
  });

  const usedPercent =
    usedTokens !== null && maxTokens ? Math.min(999, (usedTokens / maxTokens) * 100) : null;
  const remainingTokens =
    usedTokens !== null && maxTokens ? Math.max(0, maxTokens - usedTokens) : null;

  const isRunning = /RUNNING|RETRY/i.test(String(summary.status || ''));
  const activeRun = isRunning ? resolveActiveRun(summary, steps) : null;

  const breakdown = buildBreakdownSummary(latestContextWindow?.tokenBreakdown, steps);
  const growth = computeContextGrowth(turns, usedTokens, maxTokens, preferences?.criticalAt ?? 85);
  const { totalToolSec, diagnostics } = aggregateDiagnostics(steps, breakdown, retryAcc, budgetSource);
  const sortedTtfts = [...ttftSamples].sort((a, b) => a - b);

  const cumCacheBase = totals.uncachedInput + totals.cacheRead;
  const recentTurns = turns.slice(-MAX_SERIES_POINTS);
  const series = recentTurns.map((t) => ({
    stepIndex: t.stepIndex,
    streamingTps: t.streamingTps,
    e2eTps: t.e2eTps,
    ttftSec: t.ttftSec,
    outputTokens: t.outputTokens,
    thinkingTokens: t.thinkingTokens,
    responseTokens: t.responseTokens,
    durationSec: t.streamingSec,
    estimated: t.estimatedSpeed,
    isShortSample: t.isShortSample,
  }));
  const cacheSeries = recentTurns.map((t) => ({
    stepIndex: t.stepIndex,
    cacheHitRate: t.cacheHitRate,
    cacheRebuilt: t.cacheRebuilt,
    cacheReadTokens: t.cacheReadTokens,
    inputTokens: t.inputTokens,
  }));

  const publicBreakdown = breakdown
    ? { totalTokens: breakdown.totalTokens, groups: breakdown.groups, topMessages: breakdown.topMessages }
    : null;

  return {
    source: 'rpc',
    estimatedSpeed: turns.some((t) => t.estimatedSpeed),
    conversation: {
      id: conversationId,
      title: String(summary.summary || conversationId.slice(0, 8)),
      status: String(summary.status || 'IDLE'),
      isRunning,
      model: latestModelInfo.display,
      modelKey: latestModelInfo.key,
      createdAt: summary.createdTime || null,
      updatedAt: summary.lastModifiedTime || null,
      stepCount: Number(summary.stepCount) || steps.length,
    },
    activeRun,
    context: {
      usedTokens,
      usedSource,
      preflightTokens,
      estimationDelta,
      maxTokens,
      maxSource,
      remainingTokens,
      usedPercent,
      alertLevel: resolveAlertLevel(usedPercent, preferences),
      growth,
      breakdown: publicBreakdown,
    },
    throughput: {
      latestStreamingTps: latestTurn?.streamingTps ?? null,
      latestE2eTps: latestTurn?.e2eTps ?? null,
      latestTtftSec: latestTurn?.ttftSec ?? null,
      latestStreamingSec: latestTurn?.streamingSec ?? null,
      latestTotalSec: latestTurn?.totalSec ?? null,
      latestOutputTokens: latestTurn?.outputTokens ?? null,
      latestThinkingTokens: latestTurn?.thinkingTokens ?? null,
      latestResponseTokens: latestTurn?.responseTokens ?? null,
      avgStreamingTps:
        totalStreamingSec >= MIN_VALID_DURATION_SEC ? totalStreamingTokens / totalStreamingSec : null,
      peakStreamingTps,
      validSampleCount: series.filter((s) => s.streamingTps !== null).length,
      series,
    },
    timing: {
      totalTtftSec,
      totalStreamingSec: totalRawStreamingSec,
      totalToolSec,
      avgTtftSec: ttftSamples.length ? totalTtftSec / ttftSamples.length : null,
      p95TtftSec: computePercentile(sortedTtfts, 0.95),
    },
    cache: {
      latestHitRate: latestTurn?.cacheHitRate ?? null,
      cumulativeHitRate: cumCacheBase > 0 ? totals.cacheRead / cumCacheBase : null,
      totalSavedTokens: totals.cacheRead,
      totalUncachedInput: totals.uncachedInput,
      totalCacheRead: totals.cacheRead,
      totalCacheWrite: totals.cacheWrite,
      rebuildCount,
      series: cacheSeries,
    },
    diagnostics,
    mainTotals: totals,
    turns: [...turns].reverse().map(({ contextSnapshotTokens: _snap, ...rest }) => rest),
  };
}

/**
 * 当 RPC 不可用时，基于本地 transcript.jsonl 兜底计算核心指标。
 *
 * @param {string} conversationId 会话 ID
 * @param {object} local 本地解析后的 transcript 对象
 * @param {object} preferences 用户偏好
 * @return {object}
 */
export function computeMetricsFromTranscript(conversationId, local, preferences, { modelCatalog = null } = {}) {
  const steps = Array.isArray(local?.steps) ? local.steps : [];
  const rawHintInfo = local?.rawModelHint ? resolveModelInfo(local.rawModelHint, null, null, modelCatalog) : null;
  const settingHintInfo = local?.modelHint ? resolveModelInfo(null, local.modelHint, null, modelCatalog) : null;
  const modelInfo =
    rawHintInfo && settingHintInfo && rawHintInfo.key && settingHintInfo.key && rawHintInfo.key !== settingHintInfo.key
      ? rawHintInfo
      : resolveModelInfo(local?.rawModelHint || null, local?.modelHint || null, null, modelCatalog);

  const turns = [];
  const totals = emptyAccumulator();
  let totalDurationSec = 0;
  let totalOutputWithDuration = 0;
  let peakTps = null;
  let rebuildCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (!st.type.includes('PLANNER_RESPONSE')) continue;

    const inputTokens = st.inputTokens ?? 0;
    const cacheReadTokens = st.cacheReadTokens ?? 0;
    const outputTokens = st.outputTokens ?? 0;
    if (inputTokens === 0 && cacheReadTokens === 0 && outputTokens === 0) continue;

    // 兜底模式下通过与下一相邻步骤的 created_at 秒差近似估算耗时
    const nextStep = steps[i + 1];
    let durationSec = null;
    if (
      typeof st.createdAtMs === 'number' &&
      typeof nextStep?.createdAtMs === 'number' &&
      nextStep.createdAtMs > st.createdAtMs
    ) {
      durationSec = (nextStep.createdAtMs - st.createdAtMs) / 1000;
    }

    const tps =
      outputTokens > 0 && durationSec !== null && durationSec >= 1
        ? outputTokens / durationSec
        : null;

    if (tps !== null) {
      totalDurationSec += durationSec;
      totalOutputWithDuration += outputTokens;
      if (peakTps === null || tps > peakTps) peakTps = tps;
    }

    const cacheBase = inputTokens + cacheReadTokens;
    const cacheHitRate = cacheBase > 0 ? cacheReadTokens / cacheBase : null;

    const turn = {
      index: turns.length + 1,
      stepIndex: st.stepIndex,
      model: modelInfo.display,
      modelKey: modelInfo.key,
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens: 0,
      outputTokens,
      thinkingTokens: 0,
      responseTokens: outputTokens,
      cacheHitRate,
      ttftSec: null,
      streamingSec: durationSec,
      totalSec: durationSec,
      streamingTps: tps,
      e2eTps: tps,
      estimatedSpeed: true,
      isShortSample: false,
      cacheRebuilt: false,
      retryCount: 0,
      retryTokens: 0,
      tools: [],
      contextSnapshotTokens: inputTokens + cacheReadTokens,
      createdAt: st.createdAt,
    };

    turn.cacheRebuilt = detectCacheRebuild(turns.at(-1) || null, turn);
    if (turn.cacheRebuilt) rebuildCount++;

    turns.push(turn);
    addToAccumulator(totals, {
      uncachedInput: inputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: 0,
      output: outputTokens,
      thinkingOutput: 0,
      responseOutput: outputTokens,
    });
  }

  const latestTurn = turns.at(-1) || null;
  const usedTokens = latestTurn ? latestTurn.inputTokens + latestTurn.cacheReadTokens : null;
  const { maxTokens, maxSource } = resolveContextLimit({
    conversationId,
    modelInfo,
    hostMaxTokens: null,
    preferences,
  });
  const usedPercent =
    usedTokens !== null && maxTokens ? Math.min(999, (usedTokens / maxTokens) * 100) : null;
  const cumCacheBase = totals.uncachedInput + totals.cacheRead;
  const recentTurns = turns.slice(-MAX_SERIES_POINTS);
  const series = recentTurns.map((t) => ({
    stepIndex: t.stepIndex,
    streamingTps: t.streamingTps,
    e2eTps: t.e2eTps,
    ttftSec: null,
    outputTokens: t.outputTokens,
    thinkingTokens: 0,
    responseTokens: t.outputTokens,
    durationSec: t.streamingSec,
    estimated: true,
    isShortSample: false,
  }));
  const cacheSeries = recentTurns.map((t) => ({
    stepIndex: t.stepIndex,
    cacheHitRate: t.cacheHitRate,
    cacheRebuilt: t.cacheRebuilt,
    cacheReadTokens: t.cacheReadTokens,
    inputTokens: t.inputTokens,
  }));
  const growth = computeContextGrowth(turns, usedTokens, maxTokens, preferences?.criticalAt ?? 85);

  return {
    source: 'transcript',
    estimatedSpeed: true,
    conversation: {
      id: conversationId,
      title: local?.titleHint || conversationId.slice(0, 8),
      status: 'OFFLINE',
      isRunning: false,
      model: modelInfo.display,
      modelKey: modelInfo.key,
      createdAt: steps[0]?.createdAt || null,
      updatedAt: steps.at(-1)?.createdAt || null,
      stepCount: steps.length,
    },
    activeRun: null,
    context: {
      usedTokens,
      usedSource: usedTokens !== null ? 'measured' : 'unknown',
      preflightTokens: null,
      estimationDelta: null,
      maxTokens,
      maxSource,
      remainingTokens: usedTokens !== null && maxTokens ? Math.max(0, maxTokens - usedTokens) : null,
      usedPercent,
      alertLevel: resolveAlertLevel(usedPercent, preferences),
      growth,
      breakdown: null,
    },
    throughput: {
      latestStreamingTps: latestTurn?.streamingTps ?? null,
      latestE2eTps: latestTurn?.e2eTps ?? null,
      latestTtftSec: null,
      latestStreamingSec: latestTurn?.streamingSec ?? null,
      latestTotalSec: latestTurn?.totalSec ?? null,
      latestOutputTokens: latestTurn?.outputTokens ?? null,
      latestThinkingTokens: null,
      latestResponseTokens: null,
      avgStreamingTps: totalDurationSec >= 1 ? totalOutputWithDuration / totalDurationSec : null,
      peakStreamingTps: peakTps,
      validSampleCount: series.filter((s) => s.streamingTps !== null).length,
      series,
    },
    timing: {
      totalTtftSec: 0,
      totalStreamingSec: totalDurationSec,
      totalToolSec: 0,
      avgTtftSec: null,
      p95TtftSec: null,
    },
    cache: {
      latestHitRate: latestTurn?.cacheHitRate ?? null,
      cumulativeHitRate: cumCacheBase > 0 ? totals.cacheRead / cumCacheBase : null,
      totalSavedTokens: totals.cacheRead,
      totalUncachedInput: totals.uncachedInput,
      totalCacheRead: totals.cacheRead,
      totalCacheWrite: 0,
      rebuildCount,
      series: cacheSeries,
    },
    diagnostics: {
      retry: { count: 0, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0 },
      tools: [],
      budgets: { rulesTokenBudget: null, customizationTokenBudget: null, customUsedTokens: 0 },
    },
    mainTotals: totals,
    turns: [...turns].reverse().map(({ contextSnapshotTokens: _snap, ...rest }) => rest),
  };
}

/**
 * 合并主会话指标与子代理列表，生成完整快照与 Markdown 诊断摘要。
 *
 * @param {object} primaryMetrics 主会话/当前聚焦会话指标
 * @param {object[]} subagentSummaries 关联子代理精简指标数组
 * @param {{ parentId?: string|null, rootId?: string|null, lang?: string, unitSystem?: string }} [meta] 上下文层级、语言与展示单位制
 * @return {object}
 */
export function finalizeSnapshot(
  primaryMetrics,
  subagentSummaries = [],
  { parentId = null, rootId = null, lang = 'zh-CN', unitSystem = 'auto' } = {},
) {
  const subTotals = emptyAccumulator();
  for (const sub of subagentSummaries) {
    addToAccumulator(subTotals, sub.totals || emptyAccumulator());
  }

  const grandTotals = emptyAccumulator();
  addToAccumulator(grandTotals, primaryMetrics.mainTotals);
  addToAccumulator(grandTotals, subTotals);

  const snapshot = {
    ...primaryMetrics,
    hierarchy: {
      parentId,
      rootId,
      isSubagent: Boolean(parentId),
    },
    totals: {
      main: primaryMetrics.mainTotals,
      subagents: subTotals,
      grand: grandTotals,
      subagentCount: subagentSummaries.length,
    },
    subagents: subagentSummaries,
  };

  delete snapshot.mainTotals;
  snapshot.markdownSummary = buildMarkdownSummary(snapshot, { lang, unitSystem });
  return snapshot;
}

function fmtPct(ratio, isAlreadyPercent = false) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '—';
  const val = isAlreadyPercent ? ratio : ratio * 100;
  return `${val.toFixed(1)}%`;
}

/**
 * 生成可一键复制的轻量 Markdown 会话诊断摘要。
 *
 * @param {object} snapshot 完整快照对象
 * @param {string|{ lang?: string, unitSystem?: string }} [langOrOpts='zh-CN'] 语言代码或格式化选项
 * @return {string}
 */
export function buildMarkdownSummary(snapshot, langOrOpts = 'zh-CN') {
  const opts =
    typeof langOrOpts === 'string'
      ? { lang: langOrOpts, unitSystem: 'auto' }
      : { lang: langOrOpts?.lang || 'zh-CN', unitSystem: langOrOpts?.unitSystem || 'auto' };
  const isEn = opts.lang === 'en';
  const fmtCtx = (n) => formatCompactUnits(n, { unitSystem: 'intl' });
  const fmtStat = (n) => formatCompactUnits(n, opts);
  const c = snapshot.conversation || {};
  const ctx = snapshot.context || {};
  const tp = snapshot.throughput || {};
  const tm = snapshot.timing || {};
  const ch = snapshot.cache || {};
  const tot = snapshot.totals || {};
  const retry = snapshot.diagnostics?.retry || {};

  const lines = [
    `### Token Lens — ${c.title || c.id || ''}`,
    `- **${isEn ? 'Model' : '模型'}**: ${c.model || 'Unknown'} (${snapshot.source === 'rpc' ? 'RPC' : 'Transcript'})`,
    `- **${isEn ? 'Context' : '上下文水位'}**: ${fmtCtx(ctx.usedTokens)} / ${fmtCtx(ctx.maxTokens)} (${fmtPct(ctx.usedPercent, true)})`,
    `- **${isEn ? 'Streaming Speed' : '流式速率'}**: ${tp.latestStreamingTps ? `${tp.latestStreamingTps.toFixed(1)} tok/s` : '—'} (Avg ${tp.avgStreamingTps ? `${tp.avgStreamingTps.toFixed(1)}` : '—'} / Peak ${tp.peakStreamingTps ? `${tp.peakStreamingTps.toFixed(1)}` : '—'} tok/s · Avg TTFT ${tm.avgTtftSec !== null && tm.avgTtftSec !== undefined ? `${tm.avgTtftSec.toFixed(2)}s` : '—'})`,
    `- **${isEn ? 'Cache Hit' : '缓存命中率'}**: ${fmtPct(ch.cumulativeHitRate)} (${isEn ? 'Saved' : '已节省'} ${fmtStat(ch.totalSavedTokens)} tok · ${ch.rebuildCount || 0} ${isEn ? 'rebuilds' : '次重建'})`,
    `- **${isEn ? 'Session Total' : '会话总消耗'}**: ${fmtStat(tot.grand?.totalTokens)} (${isEn ? 'Main' : '主会话'} ${fmtStat(tot.main?.totalTokens)} · ${isEn ? 'Subagents' : '子代理'}(${tot.subagentCount || 0}) ${fmtStat(tot.subagents?.totalTokens)}${retry.count > 0 ? ` · ${isEn ? 'Retries' : '重试'} ${retry.count} (+${fmtStat(retry.totalTokens)})` : ''})`,
  ];

  if (ctx.breakdown?.groups?.length) {
    const parts = ctx.breakdown.groups.map((g) => `${g.name}: ${fmtCtx(g.tokens)} (${fmtPct(g.percent, true)})`);
    lines.push(`- **${isEn ? 'Context Breakdown' : '上下文构成'}**: ${parts.join(' | ')}`);
  }

  return lines.join('\n');
}
