/**
 * 可用性巡检 Webhook 外发与脱敏模块，支持飞书、钉钉、企业微信与通用 JSON 通道及直连重试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import { createHmac, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export const CHANNEL_TYPES = Object.freeze(['feishu', 'dingtalk', 'wecom', 'webhook']);
export const MAX_ALERT_CHANNELS = 12;

const REQUEST_TIMEOUT_MS = 8000;
const MAX_SANITIZED_LEN = 240;
const DEFAULT_RETRY_DELAYS_MS = [800, 2000];
const MAX_RESPONSE_BYTES = 64 * 1024;
const URL_MASK_MARKER = '/...***';
const SECRET_MASK_PREFIX = '***';

/**
 * 剥离文本中的本地路径、Bearer/API 密钥与敏感查询参数，防止外发告警泄露隐私。
 *
 * @param {unknown} raw 原始错误或标题文本
 * @param {number} [maxLen=240] 最大输出字符长度
 * @return {string}
 */
export function sanitizeAlertText(raw, maxLen = MAX_SANITIZED_LEN) {
  if (typeof raw !== 'string') return '';
  let text = raw
    .replace(/file:\/\/\/[^\s"'<>]+/gi, '[path]')
    .replace(/[A-Za-z]:\\(?:[^\s"'<>\\]+\\)*[^\s"'<>\\]*/g, '[path]')
    .replace(/(?:^|[\s(])\/(?:Users|home|root|var|etc|tmp|opt|mnt|Volumes)\/[^\s"'<>)]+/g, ' [path]')
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|pk|xoxb|xoxp|ghp|glpat|AIza)-[A-Za-z0-9_\-]{8,}/g, '[redacted]')
    .replace(/([?&](?:token|access_token|secret|sign|key|password|csrf)=)[^&\s"'<>]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

/**
 * 对 Webhook URL 进行安全掩码，仅保留协议、域名与末 4 位特征字符。
 *
 * @param {unknown} rawUrl 原始 Webhook URL
 * @return {string}
 */
export function maskWebhookUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const full = u.pathname + u.search;
    const tail = full.length > 4 ? full.slice(-4) : full;
    return `${u.origin}/...***${tail}`;
  } catch {
    return '';
  }
}

/**
 * 对加签密钥进行安全掩码。
 *
 * @param {unknown} rawSecret 原始加签密钥
 * @return {string}
 */
export function maskSecret(rawSecret) {
  if (typeof rawSecret !== 'string' || !rawSecret.trim()) return '';
  const trimmed = rawSecret.trim();
  const tail = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
  return `***${tail}`;
}

/**
 * 校验并规范化单条外部 HTTP(S) Webhook URL。
 *
 * @param {unknown} rawUrl 待校验 URL
 * @return {string} 合法 URL 或空字符串
 */
export function validateWebhookUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * 校验并规范化告警通道配置列表，支持与既有持久化通道按 ID 合并未修改的掩码凭据。
 *
 * @param {unknown} rawChannels 前端或配置提交的通道列表
 * @param {Array<object>} [existingChannels=[]] 现有已保存的通道列表
 * @return {Array<{ id: string, type: string, name: string, enabled: boolean, url: string, secret: string }>}
 */
export function normalizeAlertChannels(rawChannels, existingChannels = []) {
  if (!Array.isArray(rawChannels)) return [];
  const existingMap = new Map(
    (Array.isArray(existingChannels) ? existingChannels : [])
      .filter((c) => c && typeof c.id === 'string' && c.id)
      .map((c) => [c.id, c]),
  );

  const validTypes = new Set(CHANNEL_TYPES);
  const out = [];
  const seenIds = new Set();

  for (const item of rawChannels) {
    if (out.length >= MAX_ALERT_CHANNELS) break;
    if (!item || typeof item !== 'object') continue;
    const rawId = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 64) : randomUUID();
    if (seenIds.has(rawId)) continue;
    const existing = existingMap.get(rawId) || null;

    const type = validTypes.has(item.type) ? item.type : existing?.type || 'webhook';
    const name = sanitizeAlertText(typeof item.name === 'string' ? item.name : existing?.name || type.toUpperCase(), 48) || type.toUpperCase();
    const enabled = item.enabled !== false;

    const incomingUrl = typeof item.url === 'string' ? item.url.trim() : '';
    let url = '';
    if (incomingUrl && !incomingUrl.includes(URL_MASK_MARKER)) {
      url = validateWebhookUrl(incomingUrl);
    } else if (existing?.url) {
      url = validateWebhookUrl(existing.url);
    }
    if (!url) continue;

    let secret = '';
    if (item.clearSecret === true) {
      secret = '';
    } else if (typeof item.secret === 'string' && item.secret.trim() && !item.secret.trim().startsWith(SECRET_MASK_PREFIX)) {
      secret = item.secret.trim().slice(0, 256);
    } else if (existing?.secret) {
      secret = existing.secret;
    }

    seenIds.add(rawId);
    out.push({ id: rawId, type, name, enabled, url, secret });
  }
  return out;
}

/**
 * 将内部告警通道列表脱敏为可安全返回给前端 UI 的视图结构。
 *
 * @param {Array<object>} channels 内部通道配置列表
 * @return {Array<{ id: string, type: string, name: string, enabled: boolean, urlMask: string, hasSecret: boolean, secretMask: string }>}
 */
export function redactAlertChannels(channels = []) {
  return (Array.isArray(channels) ? channels : []).map((ch) => ({
    id: ch.id,
    type: ch.type,
    name: ch.name,
    enabled: Boolean(ch.enabled),
    urlMask: maskWebhookUrl(ch.url),
    hasSecret: Boolean(ch.secret),
    secretMask: maskSecret(ch.secret),
  }));
}

function formatIncidentLines(alertEvent, lang) {
  const isEn = lang === 'en';
  const incidents = Array.isArray(alertEvent?.incidents) ? alertEvent.incidents : [];
  const lines = [];
  if (alertEvent?.summary) {
    lines.push(sanitizeAlertText(alertEvent.summary, 200));
  }
  for (const inc of incidents.slice(0, 6)) {
    const parts = [];
    if (inc.conversationTitle) {
      parts.push(sanitizeAlertText(inc.conversationTitle, 42));
    } else if (inc.bucketName || inc.groupName) {
      parts.push(sanitizeAlertText(inc.groupName || inc.bucketName, 42));
    }
    if (inc.conversationId) {
      parts.push(`#${String(inc.conversationId).slice(0, 8)}`);
    }
    if (Number.isInteger(inc.retryCount) && inc.retryCount > 0) {
      parts.push(isEn ? `retries: ${inc.retryCount}` : `重试 ${inc.retryCount} 次`);
    }
    if (inc.resetTime) {
      parts.push(isEn ? `resets ${inc.resetTime}` : `重置 ${inc.resetTime}`);
    }
    if (inc.message) {
      parts.push(sanitizeAlertText(inc.message, 120));
    }
    if (parts.length > 0) {
      lines.push(`• ${parts.join(' | ')}`);
    }
  }
  if (incidents.length > 6) {
    lines.push(isEn ? `...and ${incidents.length - 6} more` : `…另有 ${incidents.length - 6} 项`);
  }
  return lines;
}

function prepareAlertContent(alertEvent, lang) {
  return {
    title: sanitizeAlertText(alertEvent?.title || 'Antigravity Alert', 80),
    lines: formatIncidentLines(alertEvent, lang),
  };
}

function buildFeishuPayload(channel, alertEvent, { nowMs, lang }) {
  const { title, lines } = prepareAlertContent(alertEvent, lang);
  const body = {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: `[Token Lens] ${title}`,
          content: lines.map((line) => [{ tag: 'text', text: line }]),
        },
      },
    },
  };
  if (channel.secret) {
    const timestamp = String(Math.floor(nowMs / 1000));
    const sign = createHmac('sha256', `${timestamp}\n${channel.secret}`).update('').digest('base64');
    body.timestamp = timestamp;
    body.sign = sign;
  }
  return { url: channel.url, body };
}

function buildDingtalkPayload(channel, alertEvent, { nowMs, lang }) {
  const { title, lines } = prepareAlertContent(alertEvent, lang);
  let targetUrl = channel.url;
  if (channel.secret) {
    const parsed = new URL(channel.url);
    const sign = createHmac('sha256', channel.secret).update(`${nowMs}\n${channel.secret}`).digest('base64');
    parsed.searchParams.set('timestamp', String(nowMs));
    parsed.searchParams.set('sign', sign);
    targetUrl = parsed.toString();
  }
  const mdLines = [`### [Token Lens] ${title}`, ...lines.map((l) => `- ${l.replace(/^•\s*/, '')}`)];
  return {
    url: targetUrl,
    body: {
      msgtype: 'markdown',
      markdown: {
        title: `[Token Lens] ${title}`,
        text: mdLines.join('\n'),
      },
    },
  };
}

function buildWecomPayload(channel, alertEvent, { lang }) {
  const { title, lines } = prepareAlertContent(alertEvent, lang);
  const mdLines = [`**【Token Lens】${title}**`, ...lines.map((l) => `> ${l.replace(/^•\s*/, '')}`)];
  return {
    url: channel.url,
    body: {
      msgtype: 'markdown',
      markdown: {
        content: mdLines.join('\n'),
      },
    },
  };
}

function buildGenericPayload(channel, alertEvent, { nowMs }) {
  const incidents = (Array.isArray(alertEvent?.incidents) ? alertEvent.incidents : []).map((inc) => ({
    id: inc.id || null,
    category: inc.category || alertEvent?.category || 'unknown',
    conversationId: inc.conversationId ? String(inc.conversationId).slice(0, 36) : null,
    conversationTitle: inc.conversationTitle ? sanitizeAlertText(inc.conversationTitle, 64) : null,
    retryCount: Number.isInteger(inc.retryCount) ? inc.retryCount : null,
    resetTime: inc.resetTime || null,
    message: inc.message ? sanitizeAlertText(inc.message, 160) : null,
  }));

  const kind = alertEvent?.kind || 'alert';
  return {
    url: channel.url,
    body: {
      source: 'antigravity-token-lens',
      event: `watchdog.${kind}`,
      kind,
      category: alertEvent?.category || 'unknown',
      severity: alertEvent?.severity || 'warning',
      title: sanitizeAlertText(alertEvent?.title || '', 80),
      summary: sanitizeAlertText(alertEvent?.summary || '', 200),
      incidents,
      timestamp: new Date(nowMs).toISOString(),
    },
  };
}

const PAYLOAD_BUILDERS = {
  feishu: buildFeishuPayload,
  dingtalk: buildDingtalkPayload,
  wecom: buildWecomPayload,
  webhook: buildGenericPayload,
};

/**
 * 按渠道类型构造适配飞书、钉钉、企业微信或通用 Webhook 的请求 URL 与 JSON 请求体。
 *
 * @param {object} channel 告警通道配置
 * @param {object} alertEvent 巡检告警事件
 * @param {{ nowMs?: number, lang?: string }} [options] 构造选项
 * @return {{ url: string, body: object }}
 */
export function buildChannelPayload(channel, alertEvent, { nowMs = Date.now(), lang = 'zh-CN' } = {}) {
  const builder = PAYLOAD_BUILDERS[channel?.type] || buildGenericPayload;
  return builder(channel, alertEvent, { nowMs, lang });
}

function postJsonDirect(targetUrl, bodyObj, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const payload = JSON.stringify(bodyObj);
    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requester(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload, 'utf8'),
          'User-Agent': 'antigravity-token-lens/1.0',
        },
      },
      (res) => {
        const chunks = [];
        let total = 0;
        let settled = false;
        const done = (err, text = '') => {
          if (settled) return;
          settled = true;
          if (err) reject(err);
          else resolve({ statusCode: res.statusCode || 0, text });
        };

        res.on('error', (err) => done(err));
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total <= MAX_RESPONSE_BYTES) chunks.push(chunk);
        });
        res.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
      },
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Webhook request timeout (${timeoutMs}ms)`));
    });
    req.end(payload);
  });
}

function checkPlatformResponseError(type, statusCode, text) {
  if (statusCode < 200 || statusCode >= 300) {
    return {
      ok: false,
      retryable: statusCode >= 500 || statusCode === 429,
      error: `HTTP ${statusCode}`,
    };
  }
  if (!text || !text.trim()) return { ok: true, retryable: false, error: null };

  try {
    const json = JSON.parse(text);
    if (type === 'feishu' && json?.code !== undefined && json.code !== 0) {
      return { ok: false, retryable: false, error: `Feishu code ${json.code}: ${sanitizeAlertText(json.msg || '', 80)}` };
    }
    if ((type === 'dingtalk' || type === 'wecom') && json?.errcode !== undefined && json.errcode !== 0) {
      return { ok: false, retryable: false, error: `${type} errcode ${json.errcode}: ${sanitizeAlertText(json.errmsg || '', 80)}` };
    }
  } catch {
    // 非 JSON 响应体但 HTTP 2xx 视为投递成功
  }
  return { ok: true, retryable: false, error: null };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 向单个告警通道直连发送 Webhook 消息，遇到 5xx 或网络异常时最多轻量退避重试 2 次。
 *
 * @param {object} channel 通道配置
 * @param {object} alertEvent 告警事件对象
 * @param {{ nowFn?: Function, lang?: string, requestFn?: Function, retryDelaysMs?: number[], timeoutMs?: number }} [options] 发送选项
 * @return {Promise<{ ok: boolean, channelId: string, channelName: string, type: string, attempts: number, error: string|null }>}
 */
export async function sendWebhookMessage(
  channel,
  alertEvent,
  {
    nowFn = Date.now,
    lang = 'zh-CN',
    requestFn = null,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {},
) {
  const validUrl = validateWebhookUrl(channel?.url);
  if (!validUrl) {
    return {
      ok: false,
      channelId: channel?.id || '',
      channelName: channel?.name || '',
      type: channel?.type || 'webhook',
      attempts: 0,
      error: 'Invalid webhook URL',
    };
  }

  const doPost = requestFn || ((u, b) => postJsonDirect(u, b, timeoutMs));
  const maxAttempts = 1 + retryDelaysMs.length;
  let lastError = 'Unknown error';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { url, body } = buildChannelPayload({ ...channel, url: validUrl }, alertEvent, {
        nowMs: nowFn(),
        lang,
      });
      const res = await doPost(url, body);
      const check = checkPlatformResponseError(channel.type, res?.statusCode || 0, res?.text || '');
      if (check.ok) {
        return {
          ok: true,
          channelId: channel.id || '',
          channelName: channel.name || '',
          type: channel.type || 'webhook',
          attempts: attempt,
          error: null,
        };
      }
      lastError = check.error || 'Webhook rejected';
      if (!check.retryable || attempt >= maxAttempts) {
        break;
      }
    } catch (err) {
      lastError = sanitizeAlertText(err instanceof Error ? err.message : String(err || 'Network error'), 100) || 'Network error';
      if (attempt >= maxAttempts) break;
    }
    await sleep(retryDelaysMs[attempt - 1] ?? 500);
  }

  return {
    ok: false,
    channelId: channel?.id || '',
    channelName: channel?.name || '',
    type: channel?.type || 'webhook',
    attempts: maxAttempts,
    error: lastError,
  };
}
