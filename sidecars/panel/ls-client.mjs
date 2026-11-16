/**
 * 本机 Language Server Connect RPC 客户端，提供隔离重连、增量 Trajectory 分页切片、重文本剥离与 LRU 内存控制。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SERVICE_PREFIX = '/exa.language_server_pb.LanguageServerService/';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const SETTLED_STATUS_RE = /IDLE|DONE|COMPLETED|CANCELLED|CANCELED|STOPPED|FAILED|ERROR/;
const PORT_LOG_RE = /listening on random port at (\d+) for HTTP(?:\s|$)/g;
const DEFAULT_BUDGET_BYTES = 16 * 1024 * 1024;
const SUMMARY_CACHE_TTL_MS = 1200;
const RPC_TIMEOUT_MS = 5000;
const MAX_TARGET_LEN = 38;
const MAX_USER_PREVIEW_LEN = 28;

function truncateText(text, maxLen) {
  if (typeof text !== 'string') return '';
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (!singleLine) return '';
  return singleLine.length > maxLen ? `${singleLine.slice(0, maxLen - 1)}…` : singleLine;
}

function extractFileBasename(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return '';
  const clean = rawPath.trim().replace(/[?#].*$/, '');
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return truncateText(parts.at(-1) || clean, MAX_TARGET_LEN);
}

function parseToolArgsSafe(toolCall) {
  if (!toolCall || typeof toolCall !== 'object') return {};
  if (toolCall.args && typeof toolCall.args === 'object') return toolCall.args;
  if (typeof toolCall.argumentsJson === 'string') {
    try {
      const parsed = JSON.parse(toolCall.argumentsJson);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function extractToolSummary(rawStep, meta, parsedArgs) {
  const toolCall = meta.toolCall && typeof meta.toolCall === 'object' ? meta.toolCall : null;
  const toolName = typeof toolCall?.name === 'string' && toolCall.name ? toolCall.name : null;
  const exitCode = Number.isInteger(rawStep?.runCommand?.exitCode) ? rawStep.runCommand.exitCode : null;
  const hasError = Boolean(rawStep?.error) || (exitCode !== null && exitCode !== 0);

  if (!toolName && !rawStep?.viewFile && !rawStep?.runCommand && !rawStep?.codeAction) {
    return null;
  }

  let name = toolName;
  let target = '';

  if (rawStep?.viewFile) {
    name = name || 'read_file';
    target = extractFileBasename(rawStep.viewFile.absolutePathUri || parsedArgs.Path || parsedArgs.path);
  } else if (rawStep?.runCommand) {
    name = name || 'run_command';
    target = truncateText(rawStep.runCommand.commandLine || rawStep.runCommand.proposedCommandLine || parsedArgs.CommandLine || '', MAX_TARGET_LEN);
  } else if (rawStep?.codeAction) {
    name = name || 'code_action';
    target = extractFileBasename(parsedArgs.Path || parsedArgs.TargetFile || rawStep.codeAction.path || '');
  } else if (name) {
    const guess =
      parsedArgs.Path ||
      parsedArgs.path ||
      parsedArgs.CommandLine ||
      parsedArgs.query ||
      parsedArgs.Role ||
      parsedArgs.TypeName ||
      parsedArgs.ToolName ||
      parsedArgs.Url ||
      '';
    target = guess && (String(guess).includes('/') || String(guess).includes('\\'))
      ? extractFileBasename(String(guess))
      : truncateText(String(guess), MAX_TARGET_LEN);
  }

  return {
    name: name || 'tool',
    target: target || null,
    hasError,
    exitCode,
  };
}

function extractUserPreview(rawStep) {
  const ui = rawStep?.userInput;
  if (!ui || typeof ui !== 'object') return null;
  if (typeof ui.userResponse === 'string' && ui.userResponse.trim()) {
    const reqMatch = ui.userResponse.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
    return truncateText(reqMatch ? reqMatch[1] : ui.userResponse, MAX_USER_PREVIEW_LEN) || null;
  }
  if (Array.isArray(ui.items)) {
    for (const item of ui.items) {
      const txt = typeof item?.text === 'string' ? item.text : '';
      if (txt.trim()) {
        const reqMatch = txt.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
        return truncateText(reqMatch ? reqMatch[1] : txt, MAX_USER_PREVIEW_LEN) || null;
      }
    }
  }
  return null;
}

/**
 * 校验并解析本地回环服务地址。
 *
 * @param {string} rawAddress 地址字符串（如 localhost:7108）
 * @return {{ hostname: string, port: number }|null}
 */
export function parseLoopbackAddress(rawAddress) {
  if (typeof rawAddress !== 'string' || !rawAddress.trim()) return null;
  const raw = rawAddress.trim().replace(/^https?:\/\//i, '');
  const idx = raw.lastIndexOf(':');
  if (idx <= 0) return null;
  const host = raw.slice(0, idx).toLowerCase();
  const port = Number(raw.slice(idx + 1));
  if (!LOOPBACK_HOSTS.has(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return { hostname: host === 'localhost' ? '127.0.0.1' : host.replace(/^\[|\]$/g, ''), port };
}

/**
 * 剥离单条 Step 中的大段文本，仅保留统计指标、短标签与步骤时间轴投影。
 *
 * @param {object} rawStep 原始步骤对象
 * @param {number} index 步骤在会话中的绝对索引
 * @return {object}
 */
export function projectStep(rawStep, index) {
  const s = rawStep && typeof rawStep === 'object' ? rawStep : {};
  const meta = s.metadata && typeof s.metadata === 'object' ? s.metadata : {};
  const mu = meta.modelUsage && typeof meta.modelUsage === 'object' ? meta.modelUsage : null;
  const toolCall = meta.toolCall && typeof meta.toolCall === 'object' ? meta.toolCall : null;
  const parsedArgs = toolCall ? parseToolArgsSafe(toolCall) : {};

  let invokeSubagent = null;
  if (toolCall?.name === 'invoke_subagent') {
    invokeSubagent = {
      id: toolCall.id || null,
      role: String(parsedArgs.Role || parsedArgs.role || ''),
      typeName: String(parsedArgs.TypeName || parsedArgs.typeName || ''),
    };
  }

  const toolSummary = extractToolSummary(s, meta, parsedArgs);
  const userPreview = s.type?.includes('USER_INPUT') ? extractUserPreview(s) : null;
  const toolCallCount = Array.isArray(s.plannerResponse?.toolCalls) ? s.plannerResponse.toolCalls.length : 0;

  const stepProj = {
    index,
    type: String(s.type || ''),
    status: String(s.status || ''),
    createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : null,
    viewableAt: typeof meta.viewableAt === 'string' ? meta.viewableAt : null,
    finishedGeneratingAt: typeof meta.finishedGeneratingAt === 'string' ? meta.finishedGeneratingAt : null,
    startedAt: typeof meta.startedAt === 'string' ? meta.startedAt : null,
    completedAt: typeof meta.completedAt === 'string' ? meta.completedAt : null,
    generatorModel: typeof meta.generatorModel === 'string' ? meta.generatorModel : null,
    modelUsage: mu ? sanitizeUsage(mu) : null,
    invokeSubagent,
  };
  if (toolSummary) stepProj.toolSummary = toolSummary;
  if (userPreview) stepProj.userPreview = userPreview;
  if (toolCallCount > 0) stepProj.toolCallCount = toolCallCount;
  return stepProj;
}

/**
 * 精简 tokenBreakdown 结构树，过滤非数字与冗长字段。
 *
 * @param {object} rawBreakdown 原始 tokenBreakdown 对象
 * @return {{ totalTokens: number|null, groups: Array<object> }|null}
 */
export function sanitizeBreakdown(rawBreakdown) {
  if (!rawBreakdown || typeof rawBreakdown !== 'object') return null;
  const groups = Array.isArray(rawBreakdown.groups)
    ? rawBreakdown.groups.map((g) => ({
        name: String(g?.name || ''),
        type: String(g?.type || ''),
        numTokens: Number.isFinite(Number(g?.numTokens)) ? Number(g.numTokens) : 0,
        children: Array.isArray(g?.children)
          ? g.children.map((c) => ({
              name: String(c?.name || ''),
              numTokens: Number.isFinite(Number(c?.numTokens)) ? Number(c.numTokens) : 0,
            }))
          : [],
      }))
    : [];
  const totalTokens = Number.isFinite(Number(rawBreakdown.totalTokens)) ? Number(rawBreakdown.totalTokens) : null;
  return { totalTokens, groups };
}

/**
 * 提取 Usage 中的纯数值统计字段。
 *
 * @param {object} rawUsage 原始 usage 对象
 * @return {object|null}
 */
function sanitizeUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object') return null;
  const num = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  return {
    model: typeof rawUsage.model === 'string' ? rawUsage.model : null,
    inputTokens: num(rawUsage.inputTokens),
    outputTokens: num(rawUsage.outputTokens),
    thinkingOutputTokens: num(rawUsage.thinkingOutputTokens),
    responseOutputTokens: num(rawUsage.responseOutputTokens),
    cacheReadTokens: num(rawUsage.cacheReadTokens),
    cacheWriteTokens: num(rawUsage.cacheWriteTokens),
    apiProvider: typeof rawUsage.apiProvider === 'string' ? rawUsage.apiProvider : null,
  };
}

function summarizeRetries(retryInfos) {
  // Language Server 在 retryInfos 中记录该次请求的所有尝试（正常单次调用 length === 1）
  // 仅当 length > 1 时，前 length - 1 条才是实际触发重连/重试产生的额外尝试
  if (!Array.isArray(retryInfos) || retryInfos.length <= 1) return null;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  for (let i = 0; i < retryInfos.length - 1; i++) {
    const u = sanitizeUsage(retryInfos[i]?.usage);
    if (!u) continue;
    inputTokens += u.inputTokens ?? 0;
    cacheReadTokens += u.cacheReadTokens ?? 0;
    outputTokens += u.outputTokens ?? 0;
  }
  return {
    count: retryInfos.length - 1,
    inputTokens,
    cacheReadTokens,
    outputTokens,
  };
}

/**
 * 剥离单条 GeneratorMetadata 中的大文本 prompt/tools，保留指标、重试与上下文水位结构。
 *
 * @param {object} rawMeta 原始 generatorMetadata 条目
 * @param {number} index 元数据绝对索引
 * @return {object}
 */
export function projectGeneratorMeta(rawMeta, index) {
  const g = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const chat = g.chatModel && typeof g.chatModel === 'object' ? g.chatModel : {};
  const startMeta = chat.chatStartMetadata && typeof chat.chatStartMetadata === 'object' ? chat.chatStartMetadata : {};
  const cw = startMeta.contextWindowMetadata && typeof startMeta.contextWindowMetadata === 'object' ? startMeta.contextWindowMetadata : null;
  const pc = g.plannerConfig && typeof g.plannerConfig === 'object' ? g.plannerConfig : {};

  const gmProj = {
    index,
    stepIndices: Array.isArray(g.stepIndices) ? g.stepIndices.filter((n) => Number.isInteger(n) && n >= 0) : [],
    model: typeof chat.model === 'string' ? chat.model : null,
    modelDisplayName: typeof chat.modelDisplayName === 'string' ? chat.modelDisplayName : null,
    responseModel: typeof chat.responseModel === 'string' ? chat.responseModel : null,
    timeToFirstToken: chat.timeToFirstToken ?? null,
    streamingDuration: chat.streamingDuration ?? null,
    chatStartCreatedAt: typeof startMeta.createdAt === 'string' ? startMeta.createdAt : null,
    usage: sanitizeUsage(chat.usage),
    contextWindow: cw
      ? {
          estimatedTokensUsed: Number.isFinite(Number(cw.estimatedTokensUsed)) ? Number(cw.estimatedTokensUsed) : null,
          maxContextTokens: Number.isFinite(Number(cw.maxContextTokens)) ? Number(cw.maxContextTokens) : null,
          tokenBreakdown: sanitizeBreakdown(cw.tokenBreakdown),
        }
      : null,
  };
  if (typeof pc.modelName === 'string' && pc.modelName) gmProj.plannerModelName = pc.modelName;
  if (Number.isSafeInteger(Number(pc.rulesTokenBudget))) gmProj.rulesTokenBudget = Number(pc.rulesTokenBudget);
  if (Number.isSafeInteger(Number(pc.customizationTokenBudget))) gmProj.customizationTokenBudget = Number(pc.customizationTokenBudget);
  if (Number.isInteger(startMeta.checkpointIndex) && startMeta.checkpointIndex >= 0) gmProj.checkpointIndex = startMeta.checkpointIndex;
  const retrySummary = summarizeRetries(chat.retryInfos);
  if (retrySummary) gmProj.retrySummary = retrySummary;
  return gmProj;
}

/**
 * 增量合并步进切片与生成器元数据切片。
 *
 * @param {object|null} oldProj 既有投影
 * @param {object} summary 最新摘要
 * @param {object[]} deltaSteps 新增/更新步骤数组（起始偏移为 stepOffset）
 * @param {number} stepOffset 步骤切片起始下标
 * @param {object[]} deltaMeta 新增/更新元数据数组（起始偏移为 gmOffset）
 * @param {number} gmOffset 元数据切片起始下标
 * @return {object} 更新后的投影对象
 */
export function mergeTrajectoryProjection(oldProj, summary, deltaSteps, stepOffset, deltaMeta, gmOffset) {
  const steps = oldProj ? oldProj.steps.slice(0, stepOffset) : [];
  for (let i = 0; i < deltaSteps.length; i++) {
    steps.push(projectStep(deltaSteps[i], stepOffset + i));
  }

  const generatorMetadata = oldProj ? oldProj.generatorMetadata.slice(0, gmOffset) : [];
  for (let i = 0; i < deltaMeta.length; i++) {
    generatorMetadata.push(projectGeneratorMeta(deltaMeta[i], gmOffset + i));
  }

  const mark = buildSummaryMark(summary);
  const proj = {
    summary,
    mark,
    steps,
    generatorMetadata,
    verifiedAt: Date.now(),
    bytes: 0,
  };
  proj.bytes = Buffer.byteLength(JSON.stringify(proj), 'utf8');
  return proj;
}

/**
 * 构造摘要比对指纹。
 *
 * @param {object} summary 会话摘要
 * @return {string}
 */
export function buildSummaryMark(summary) {
  return JSON.stringify([
    summary?.stepCount ?? null,
    summary?.lastModifiedTime ?? null,
    summary?.status ?? null,
    summary?.lastUserInputStepIndex ?? null,
  ]);
}

/**
 * 扫描当前产品对应的本机语言服务进程与日志以恢复重连端点。
 *
 * @param {string} productName 产品目录名（如 antigravity 或 antigravity-ide）
 * @param {string} [home=homedir()] 用户目录
 * @return {Promise<{ hostname: string, port: number, csrf: string }|null>}
 */
async function discoverEndpointFromHost(productName, home = homedir()) {
  const logPorts = await collectRecentPorts(productName, home);

  if (process.platform === 'win32') {
    const script = [
      "Get-CimInstance Win32_Process -Filter \"Name LIKE '%language_server%'\" |",
      'Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress',
    ].join(' ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 4500,
      windowsHide: true,
    });
    const rows = parseProcessJson(stdout);
    return matchProcessAndPort(rows, productName, logPorts);
  }

  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,args='], { timeout: 4000 });
  const rows = stdout
    .split(/\r?\n/)
    .map((line) => {
      const m = line.trim().match(/^(\d+)\s+(.*)$/);
      return m ? { ProcessId: Number(m[1]), CommandLine: m[2] } : null;
    })
    .filter(Boolean);
  return matchProcessAndPort(rows, productName, logPorts);
}

function parseProcessJson(raw) {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function matchProcessAndPort(rows, productName, logPorts) {
  const candidates = rows.filter((r) => /--standalone\b/.test(r?.CommandLine || ''));
  const productMatched = candidates.filter((r) => {
    const cmd = r.CommandLine || '';
    if (productName === 'antigravity-ide') return /antigravity[-_]?ide/i.test(cmd);
    if (productName === 'antigravity-cli') return /antigravity[-_]?cli/i.test(cmd);
    return !/antigravity[-_]?(ide|cli)/i.test(cmd);
  });

  const target = productMatched[0] || (candidates.length === 1 ? candidates[0] : null);
  if (!target) return null;

  const csrf = target.CommandLine.match(/--csrf_token(?:=|\s+)"?([^\s"]+)/)?.[1];
  const portMatch = target.CommandLine.match(/--(?:server_port|port)(?:=|\s+)(\d+)/)?.[1];
  const port = Number(portMatch) || logPorts[0];
  if (!csrf || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { hostname: '127.0.0.1', port, csrf };
}

async function collectRecentPorts(productName, home) {
  const dirs = [
    join(home, '.gemini', productName, 'logs'),
    join(home, '.gemini', productName),
  ];
  const ports = [];
  for (const dir of dirs) {
    try {
      const files = await readdir(dir);
      for (const f of files.filter((n) => n.endsWith('.log')).slice(0, 6)) {
        const text = await readFile(join(dir, f), 'utf8').catch(() => '');
        for (const m of text.matchAll(PORT_LOG_RE)) {
          ports.unshift(Number(m[1]));
        }
      }
    } catch {
      // 日志目录不存在时跳过
    }
  }
  return ports;
}

/**
 * Antigravity Language Server 客户端，管理连接、增量拉取、防内存溢出 LRU 缓存。
 */
export class LanguageServerClient {
  #endpoint = null;
  #productName;
  #budgetBytes;
  #requestFn;
  #discoverFn;
  #nowFn;
  #summariesCache = null;
  #summariesAt = -Infinity;
  #summariesPending = null;
  #projCache = new Map();
  #inFlight = new Map();
  #totalCachedBytes = 0;
  #backoffUntil = 0;
  #failures = 0;

  /**
   * @param {object} [options] 客户端配置
   * @param {string} [options.lsAddress] 初始 LS 地址（默认读取环境变量）
   * @param {string} [options.csrfToken] 初始 CSRF Token（仅存内存，默认读取环境变量）
   * @param {string} [options.productName='antigravity'] 当前所属产品目录名
   * @param {number} [options.budgetBytes=16777216] 投影 LRU 内存上限字节数
   * @param {Function} [options.requestFn] 可注入 HTTP 请求实现（用于单测）
   * @param {Function} [options.discoverFn] 可注入端点发现实现（用于单测）
   * @param {Function} [options.nowFn] 时钟函数
   */
  constructor({
    lsAddress = process.env.ANTIGRAVITY_LS_ADDRESS,
    csrfToken = process.env.ANTIGRAVITY_CSRF_TOKEN,
    productName = 'antigravity',
    budgetBytes = DEFAULT_BUDGET_BYTES,
    requestFn = null,
    discoverFn = null,
    nowFn = Date.now,
  } = {}) {
    this.#productName = productName;
    this.#budgetBytes = budgetBytes;
    this.#requestFn = requestFn;
    this.#discoverFn = discoverFn || (() => discoverEndpointFromHost(this.#productName));
    this.#nowFn = nowFn;

    const parsed = parseLoopbackAddress(lsAddress);
    if (parsed && csrfToken) {
      this.#endpoint = { ...parsed, csrf: csrfToken };
    }
  }

  /**
   * 返回当前缓存占用字节数（用于可观测性与单元测试校验）。
   *
   * @return {number}
   */
  get cachedBytes() {
    return this.#totalCachedBytes;
  }

  /**
   * 调用 Language Server Connect JSON RPC 接口。
   *
   * @param {string} method RPC 方法名
   * @param {object} [body={}] 请求体
   * @param {boolean} [allowRediscover=true] 失败后是否尝试重发现一次
   * @return {Promise<object>}
   */
  async call(method, body = {}, allowRediscover = true) {
    const endpoint = await this.#ensureEndpoint();
    try {
      const result = await this.#sendRpc(endpoint, method, body);
      this.#failures = 0;
      this.#backoffUntil = 0;
      return result;
    } catch (err) {
      if (!allowRediscover) throw err;
      this.#endpoint = null;
      const rediscovered = await this.#discoverWithBackoff();
      if (!rediscovered) throw err;
      return this.#sendRpc(rediscovered, method, body);
    }
  }

  async #ensureEndpoint() {
    if (this.#endpoint) return this.#endpoint;
    const discovered = await this.#discoverWithBackoff();
    if (!discovered) {
      throw new Error('Language Server unavailable');
    }
    return discovered;
  }

  async #discoverWithBackoff() {
    const now = this.#nowFn();
    if (now < this.#backoffUntil) return null;
    try {
      const next = await this.#discoverFn();
      if (!next) {
        this.#recordDiscoveryFailure(now);
        return null;
      }
      this.#endpoint = next;
      this.#failures = 0;
      this.#backoffUntil = 0;
      return next;
    } catch {
      this.#recordDiscoveryFailure(now);
      return null;
    }
  }

  #recordDiscoveryFailure(now) {
    this.#failures++;
    const waitMs = Math.min(30_000, 2000 * 2 ** Math.min(4, this.#failures - 1));
    this.#backoffUntil = now + waitMs;
  }

  #sendRpc(endpoint, method, body) {
    if (this.#requestFn) {
      return this.#requestFn(endpoint, method, body);
    }
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = httpRequest(
        {
          hostname: endpoint.hostname,
          port: endpoint.port,
          method: 'POST',
          path: `${SERVICE_PREFIX}${method}`,
          agent: false,
          headers: {
            'Content-Type': 'application/json',
            'Connect-Protocol-Version': '1',
            'x-codeium-csrf-token': endpoint.csrf,
            'Content-Length': Buffer.byteLength(payload, 'utf8'),
          },
        },
        (res) => {
          const chunks = [];
          let settled = false;
          const fail = (err) => {
            if (settled) return;
            settled = true;
            req.destroy();
            reject(err);
          };

          res.on('error', fail);
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            if (settled) return;
            settled = true;
            const text = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode !== 200) {
              reject(new Error(`RPC ${method} failed with HTTP ${res.statusCode}`));
              return;
            }
            try {
              resolve(text ? JSON.parse(text) : {});
            } catch (err) {
              reject(new Error(`Invalid JSON from RPC ${method}: ${err.message}`));
            }
          });
        },
      );

      req.on('error', reject);
      req.setTimeout(RPC_TIMEOUT_MS, () => {
        req.destroy(new Error(`RPC ${method} timeout`));
      });
      req.end(payload);
    });
  }

  /**
   * 获取所有会话及子代理摘要（带短 TTL 缓存防止并发雪崩）。
   *
   * @param {boolean} [force=false] 是否跳过缓存强制刷新
   * @return {Promise<Record<string, object>>}
   */
  async getSummaries(force = false) {
    const now = this.#nowFn();
    if (!force && this.#summariesCache && now - this.#summariesAt < SUMMARY_CACHE_TTL_MS) {
      return this.#summariesCache;
    }
    if (this.#summariesPending) return this.#summariesPending;

    this.#summariesPending = this.call('GetAllCascadeTrajectories', { excludeSubtrajectories: false })
      .then((res) => {
        const summaries = res?.trajectorySummaries && typeof res.trajectorySummaries === 'object' ? res.trajectorySummaries : {};
        this.#summariesCache = summaries;
        this.#summariesAt = this.#nowFn();
        return summaries;
      })
      .finally(() => {
        this.#summariesPending = null;
      });

    return this.#summariesPending;
  }

  /**
   * 获取指定会话的增量统计投影，自动复用缓存与 LRU 淘汰。
   *
   * @param {string} cascadeId 会话 ID
   * @param {{ summary?: object, force?: boolean }} [options] 读取选项
   * @return {Promise<object>}
   */
  async getProjection(cascadeId, { summary: providedSummary = null, force = false } = {}) {
    if (this.#inFlight.has(cascadeId)) {
      return this.#inFlight.get(cascadeId);
    }

    const job = this.#loadProjection(cascadeId, { providedSummary, force }).finally(() => {
      this.#inFlight.delete(cascadeId);
    });
    this.#inFlight.set(cascadeId, job);
    return job;
  }

  async #loadProjection(cascadeId, { providedSummary, force }) {
    const summaries = providedSummary ? null : await this.getSummaries(force);
    const summary = providedSummary || summaries?.[cascadeId];
    if (!summary) {
      throw new Error('Conversation summary not found in Language Server');
    }

    const mark = buildSummaryMark(summary);
    const old = this.#projCache.get(cascadeId) || null;
    const isSettled = SETTLED_STATUS_RE.test(String(summary.status || ''));

    if (!force && old && old.mark === mark && isSettled) {
      this.#touchCache(cascadeId, old);
      return old;
    }

    const remoteStepCount = Number(summary.stepCount);
    const canIncrement =
      old &&
      !force &&
      Number.isInteger(remoteStepCount) &&
      remoteStepCount >= old.steps.length;

    let stepOffset = 0;
    let gmOffset = 0;
    let baseProj = null;

    if (canIncrement) {
      baseProj = old;
      const firstUnsettled = old.steps.findIndex((s) => !SETTLED_STATUS_RE.test(s.status));
      if (firstUnsettled >= 0) {
        stepOffset = firstUnsettled;
      } else {
        stepOffset = Math.max(0, old.steps.length - 1);
      }
      gmOffset = Math.max(0, old.generatorMetadata.length - 1);
    }

    const [stepsRes, gmRes] = await Promise.all([
      this.call('GetCascadeTrajectorySteps', { cascadeId, stepOffset }),
      this.call('GetCascadeTrajectoryGeneratorMetadata', { cascadeId, generatorMetadataOffset: gmOffset }),
    ]);

    const deltaSteps = Array.isArray(stepsRes?.steps) ? stepsRes.steps : [];
    const deltaMeta = Array.isArray(gmRes?.generatorMetadata) ? gmRes.generatorMetadata : [];
    const nextProj = mergeTrajectoryProjection(baseProj, summary, deltaSteps, stepOffset, deltaMeta, gmOffset);

    this.#putCache(cascadeId, nextProj);
    return nextProj;
  }

  #touchCache(id, entry) {
    this.#projCache.delete(id);
    this.#projCache.set(id, entry);
  }

  #putCache(id, entry) {
    const existing = this.#projCache.get(id);
    if (existing) {
      this.#totalCachedBytes -= existing.bytes;
      this.#projCache.delete(id);
    }
    this.#projCache.set(id, entry);
    this.#totalCachedBytes += entry.bytes;
    this.#evictOverflow(id);
  }

  #evictOverflow(keepId) {
    if (this.#totalCachedBytes <= this.#budgetBytes) return;
    for (const [id, entry] of this.#projCache.entries()) {
      if (this.#totalCachedBytes <= this.#budgetBytes) break;
      if (id === keepId) continue;
      this.#totalCachedBytes -= entry.bytes;
      this.#projCache.delete(id);
    }
  }
}
