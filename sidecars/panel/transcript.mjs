/**
 * 本地 transcript.jsonl 与 Swarm 名册兜底解析模块，用于离线会话查看与 RPC 不可用时降级采集。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const CONVERSATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 以句末点号加空白/行尾截断，避免 Gemini 3.8 / Claude 5.5 等版本号中的小数点误截断
const MODEL_SETTING_RE = /The user changed setting `Model Selection` from [^`\n]+? to ([^<\n]+?)\.(?=\s|$)/;
const SUBAGENT_ID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

/**
 * 解析并校验非负整数 Token 计数。
 *
 * @param {unknown} value 原始数值
 * @return {number|null}
 */
function parseNonNegInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  return null;
}

/**
 * 解析 ISO 时间戳为毫秒数值。
 *
 * @param {unknown} value 时间字符串
 * @return {number|null}
 */
function parseTimestampMs(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 解析 transcript.jsonl 原始文本，容忍末尾正在写入导致的半行截断。
 *
 * @param {string} rawText transcript.jsonl 全文
 * @return {{ steps: object[], modelHint: string|null, rawModelHint: string|null, titleHint: string|null, subagentCalls: object[], skippedLines: number }}
 */
export function parseTranscriptText(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { steps: [], modelHint: null, rawModelHint: null, titleHint: null, subagentCalls: [], skippedLines: 0 };
  }

  const lines = rawText.split(/\r?\n/);
  const steps = [];
  const subagentCalls = [];
  let settingModelHint = null;
  let rawModelHint = null;
  let titleHint = null;
  let skippedLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let row;
    try {
      row = JSON.parse(line);
    } catch {
      // 并发追加写入时最后一行可能尚未落盘完整，跳过而不中断解析
      skippedLines++;
      continue;
    }
    if (!row || typeof row !== 'object') continue;

    const stepIndex = parseNonNegInt(row.step_index) ?? steps.length;
    const type = String(row.type || '');
    const status = String(row.status || '');
    const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
    const content = typeof row.content === 'string' ? row.content : '';

    if (type === 'USER_INPUT' && content) {
      const modelMatch = content.match(MODEL_SETTING_RE);
      if (modelMatch) {
        settingModelHint = modelMatch[1].trim();
      }
      if (!titleHint) {
        const reqMatch = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
        const rawTitle = (reqMatch ? reqMatch[1] : content).replace(/\s+/g, ' ').trim();
        if (rawTitle) {
          titleHint = rawTitle.slice(0, 64);
        }
      }
    }

    if (typeof row.model === 'string' && row.model.trim()) {
      rawModelHint = row.model.trim();
    }

    const toolCalls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
    for (const call of toolCalls) {
      if (call?.name === 'invoke_subagent') {
        subagentCalls.push({
          stepIndex,
          role: String(call.args?.Role || '').replace(/^"|"$/g, ''),
          typeName: String(call.args?.TypeName || '').replace(/^"|"$/g, ''),
          createdAt,
        });
      }
    }

    // 捕获工具返回内容中出现的子代理 conversationId，供离线关联使用
    if (content && content.includes('conversationId')) {
      const idMatch = content.match(/conversationId["']?\s*[:=]\s*["']?([0-9a-f-]{36})/i) || content.match(SUBAGENT_ID_RE);
      if (idMatch && subagentCalls.length > 0) {
        const lastUnlinked = [...subagentCalls].reverse().find((s) => !s.conversationId);
        if (lastUnlinked) {
          lastUnlinked.conversationId = idMatch[1];
        }
      }
    }

    steps.push({
      stepIndex,
      type,
      status,
      createdAt,
      createdAtMs: parseTimestampMs(createdAt),
      inputTokens: parseNonNegInt(row.input_tokens),
      cacheReadTokens: parseNonNegInt(row.cache_read_tokens),
      outputTokens: parseNonNegInt(row.output_tokens),
    });
  }

  return {
    steps,
    modelHint: settingModelHint || rawModelHint,
    rawModelHint,
    titleHint,
    subagentCalls,
    skippedLines,
  };
}

/**
 * 在候选 appData 目录中定位指定会话目录。
 *
 * @param {string[]} appDataCandidates appData 候选目录列表
 * @param {string} conversationId 会话 ID
 * @return {Promise<{ appDataDir: string, brainDir: string, transcriptPath: string, transcriptMtimeMs: number, transcriptSize: number }|null>}
 */
export async function locateConversationFiles(appDataCandidates, conversationId) {
  if (!CONVERSATION_ID_RE.test(conversationId || '')) return null;
  for (const appDataDir of appDataCandidates) {
    const brainDir = join(appDataDir, 'brain', conversationId);
    const transcriptPath = join(brainDir, '.system_generated', 'logs', 'transcript.jsonl');
    try {
      const st = await stat(transcriptPath);
      if (st.isFile()) {
        return {
          appDataDir,
          brainDir,
          transcriptPath,
          transcriptMtimeMs: st.mtimeMs,
          transcriptSize: st.size,
        };
      }
    } catch {
      // 当前候选目录无该会话，继续查找下一候选
    }
  }
  return null;
}

/**
 * 读取指定会话的本地 transcript.jsonl 与可选 Swarm 成员名册。
 *
 * @param {string[]} appDataCandidates appData 候选目录列表
 * @param {string} conversationId 会话 ID
 * @return {Promise<object|null>}
 */
export async function readLocalConversation(appDataCandidates, conversationId) {
  const located = await locateConversationFiles(appDataCandidates, conversationId);
  if (!located) return null;

  const rawText = await readFile(located.transcriptPath, 'utf8');
  const parsed = parseTranscriptText(rawText);

  let swarmMembers = [];
  const membersPath = join(located.brainDir, '.system_generated', 'swarm', 'members.json');
  try {
    const rawMembers = JSON.parse(await readFile(membersPath, 'utf8'));
    if (rawMembers?.members && typeof rawMembers.members === 'object') {
      swarmMembers = Object.entries(rawMembers.members).map(([name, m]) => ({
        name,
        conversationId: m?.conversation_id || '',
        role: m?.role || name,
        model: m?.model || null,
        killed: Boolean(m?.killed),
      }));
    }
  } catch {
    // 非 Swarm 会话无 members.json，属正常情况
  }

  return {
    conversationId,
    appDataDir: located.appDataDir,
    mtimeMs: located.transcriptMtimeMs,
    size: located.transcriptSize,
    ...parsed,
    swarmMembers,
  };
}

/**
 * 扫描本地 brain 目录枚举可查看的离线历史会话（按最近活跃时间倒序）。
 *
 * @param {string[]} appDataCandidates appData 候选目录列表
 * @param {number} [limit=40] 最大返回条数
 * @return {Promise<Array<{ id: string, title: string, updatedAt: string, stepCount: number, source: 'transcript' }>>}
 */
export async function listLocalConversations(appDataCandidates, limit = 40) {
  const found = new Map();
  for (const appDataDir of appDataCandidates) {
    const brainRoot = join(appDataDir, 'brain');
    let entries = [];
    try {
      entries = await readdir(brainRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || !CONVERSATION_ID_RE.test(ent.name) || found.has(ent.name)) continue;
      const transcriptPath = join(brainRoot, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
      try {
        const st = await stat(transcriptPath);
        if (st.isFile()) {
          found.set(ent.name, {
            id: ent.name,
            title: ent.name.slice(0, 8),
            updatedAt: st.mtime.toISOString(),
            mtimeMs: st.mtimeMs,
            stepCount: 0,
            source: 'transcript',
          });
        }
      } catch {
        // 忽略无日志的空会话目录
      }
    }
  }

  return [...found.values()]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(({ mtimeMs: _mtime, ...item }) => item);
}
