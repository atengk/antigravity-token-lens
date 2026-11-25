/**
 * 可用性巡检核心状态机，被动观测全局 Language Server 会话与配额异常并聚合冷却推送告警。
 *
 * @author Ateng
 * @since 2026-11-25
 */

import { randomUUID } from 'node:crypto';
import { normalizeAlertChannels, sanitizeAlertText, sendWebhookMessage } from './notifier.mjs';
import { DEFAULT_WATCHDOG_PREFERENCES, normalizeWatchdogPreferences } from './store.mjs';

const SUMMARY_POLL_MS = 15_000;
const QUOTA_POLL_MS = 60_000;
const LS_UNREACHABLE_THRESHOLD_MS = 30_000;
const DEFAULT_AGGREGATION_WINDOW_MS = 5_000;
const MAX_RECENT_DELIVERIES = 20;
const MAX_TRACKED_CONVERSATIONS = 200;

const TERMINAL_FAILURE_RE = /(?:^|_|\b)(FAILED|ERROR)(?:$|_|\b)/i;
const TERMINAL_SUCCESS_RE = /(?:^|_|\b)(DONE|COMPLETED|IDLE|CANCELLED|CANCELED|STOPPED)(?:$|_|\b)/i;
const USER_CANCELLED_RE = /(?:^|_|\b)(CANCELLED|CANCELED)(?:$|_|\b)/i;
const RETRY_STATUS_RE = /RETRY/i;
const ACTIVE_STATUS_RE = /RUNNING|GENERATING|WAITING/i;

const REGION_ERR_RE =
  /region|country|territory|geo[\s_-]?block|not\s+available\s+in\s+your|unsupported\s+(?:location|region|country)|permission_denied.*location|\b403\b.*(?:region|location|country)/i;
const QUOTA_ERR_RE =
  /resource_exhausted|quota|rate[\s_-]?limit|too\s+many\s+requests|\b429\b|credits?\s+(?:exhausted|insufficient)|limit\s+reached/i;
const AUTH_ERR_RE =
  /unauthenticated|unauthorized|invalid[\s_-]?token|expired[\s_-]?token|\boauth\b|sign\s*in|permission_denied|forbidden|\b(?:401|403)\b/i;
const NETWORK_ERR_RE =
  /econnreset|econnrefused|etimedout|enotfound|enetunreach|socket\s+hang\s+up|network|tls|ssl|proxy|fetch\s+failed|timeout|unavailable/i;

const HARD_BLOCKER_CATEGORIES = new Set(['region_unavailable', 'quota_exhausted', 'auth_error']);

const CATEGORY_TITLES = {
  'zh-CN': {
    region_unavailable: '地区不可用（节点受限）',
    quota_exhausted: '账号配额耗尽',
    auth_error: '账号鉴权或权限受限',
    network_error: '上游网络异常',
    task_failed: '后台任务执行失败',
    retry_stall: '任务连续重试卡死',
    silent_stall: '上游响应静默挂起',
    model_disabled: '模型已被系统禁用',
    ls_unreachable: 'Language Server 失联',
    test: '告警通道连通性测试',
  },
  en: {
    region_unavailable: 'Region Unavailable',
    quota_exhausted: 'Quota Exhausted',
    auth_error: 'Auth / Access Denied',
    network_error: 'Upstream Network Error',
    task_failed: 'Task Execution Failed',
    retry_stall: 'Task Stuck Retrying',
    silent_stall: 'Upstream Response Stalled',
    model_disabled: 'Model Disabled',
    ls_unreachable: 'Language Server Unreachable',
    test: 'Alert Channel Connectivity Test',
  },
};

/**
 * 根据原始错误文本归类阻断故障类型。
 *
 * @param {unknown} rawMessage 错误摘要文本
 * @return {'region_unavailable'|'quota_exhausted'|'auth_error'|'network_error'|'task_failed'}
 */
export function classifyFailureReason(rawMessage) {
  const text = typeof rawMessage === 'string' ? rawMessage : '';
  if (!text) return 'task_failed';
  if (REGION_ERR_RE.test(text)) return 'region_unavailable';
  if (QUOTA_ERR_RE.test(text)) return 'quota_exhausted';
  if (AUTH_ERR_RE.test(text)) return 'auth_error';
  if (NETWORK_ERR_RE.test(text)) return 'network_error';
  return 'task_failed';
}

function isRetryStep(step) {
  if (!step) return false;
  const type = String(step.type || '');
  const status = String(step.status || '');
  return type.includes('ERROR_MESSAGE') || type.includes('RETRY') || RETRY_STATUS_RE.test(status) || Boolean(step.errorSummary);
}

function isArchivedSummary(summary) {
  return Boolean(summary?.archived || summary?.isArchived || summary?.trajectoryMetadata?.archived);
}

function hasTerminalErrorTail(proj) {
  const steps = Array.isArray(proj?.steps) ? proj.steps : [];
  if (steps.length === 0) return false;
  const lastStep = steps[steps.length - 1];
  const status = String(lastStep?.status || '');
  const type = String(lastStep?.type || '');
  const isToolStep = Boolean(lastStep?.toolSummary) || /CODE_ACTION|VIEW_FILE|COMMAND|TOOL/i.test(type);
  if (isToolStep) return false;
  return isRetryStep(lastStep) || TERMINAL_FAILURE_RE.test(status);
}

function inspectProjectionActivity(proj, summaryStatus = '') {
  const steps = Array.isArray(proj?.steps) ? proj.steps : [];
  let pendingStep = null;
  let pendingIdx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    const status = String(step?.status || '');
    if (ACTIVE_STATUS_RE.test(status) || RETRY_STATUS_RE.test(status)) {
      pendingStep = step;
      pendingIdx = i;
      break;
    }
  }

  let latestErrorMessage = null;
  let retryCount = 0;
  const isSummaryRetrying = RETRY_STATUS_RE.test(String(summaryStatus || ''));
  let scanEnd = steps.length - 1;
  const pendingIsUnstartedPlanner =
    pendingStep &&
    pendingIdx === scanEnd &&
    String(pendingStep.type || '').includes('PLANNER_RESPONSE') &&
    !pendingStep.viewableAt;

  if (pendingIsUnstartedPlanner) {
    scanEnd--;
  }

  for (let i = scanEnd; i >= 0; i--) {
    const step = steps[i];
    if (!isRetryStep(step)) break;
    // 若当前摘要并非 RETRY 态且正在等待首字，仅采信尚未完结的重试步，防止回扫已恢复的历史错误步
    if (pendingIsUnstartedPlanner && !isSummaryRetrying && !RETRY_STATUS_RE.test(String(step.status || ''))) {
      break;
    }
    retryCount++;
    if (!latestErrorMessage && step.errorSummary?.message) {
      latestErrorMessage = step.errorSummary.message;
    }
    if (Number.isInteger(step.errorSummary?.attempt) && step.errorSummary.attempt > retryCount) {
      retryCount = step.errorSummary.attempt;
    }
  }

  if (!latestErrorMessage) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i]?.errorSummary?.message) {
        latestErrorMessage = steps[i].errorSummary.message;
        break;
      }
    }
  }

  const pendingStatus = String(pendingStep?.status || '');
  const pendingType = String(pendingStep?.type || '');
  const isWaitingForUser = /WAITING_FOR_USER/i.test(pendingStatus);
  const isLocalTool =
    Boolean(pendingStep?.toolSummary) ||
    Boolean(pendingStep?.invokeSubagent) ||
    /CODE_ACTION|VIEW_FILE|COMMAND|TOOL/i.test(pendingType);
  const isWaitingForModel =
    Boolean(pendingStep) &&
    !isWaitingForUser &&
    !isLocalTool &&
    (!pendingType || pendingType.includes('PLANNER_RESPONSE')) &&
    !pendingStep.viewableAt;

  return {
    latestErrorMessage,
    retryCount,
    isWaitingForUser,
    isLocalTool,
    isWaitingForModel,
  };
}

function logWatchdogWarning(scope, err) {
  const msg = err instanceof Error ? err.message : String(err || 'unknown error');
  console.warn(`[token-lens] watchdog ${scope}: ${msg}`);
}

/**
 * 后台可用性巡检器，负责增量监听全局任务状态与配额变化并发送冷却防重的脱敏告警。
 */
export class AvailabilityWatchdog {
  #lsClient;
  #sendFn;
  #nowFn;
  #lang;
  #config;
  #aggregationWindowMs;
  #pollTimer = null;
  #flushTimer = null;
  #polling = false;
  #initialized = false;
  #running = false;
  #lastPollAt = null;
  #lastQuotaPollAt = null;
  #lsDownSinceMs = null;
  #lsHealthy = true;
  #convStates = new Map();
  #quotaStates = new Map();
  #modelDisabledStates = new Map();
  #activeIncidents = new Map();
  #lastAlertAt = new Map();
  #pendingQueue = [];
  #recentDeliveries = [];

  /**
   * @param {object} deps 巡检依赖
   * @param {object} deps.lsClient Language Server 客户端实例
   * @param {object} [deps.config] 初始巡检配置
   * @param {string} [deps.lang='zh-CN'] 通知文案语言
   * @param {Function} [deps.sendFn] 投递函数（单测可注入）
   * @param {Function} [deps.nowFn] 时钟函数
   * @param {number} [deps.aggregationWindowMs=5000] 同类突发故障合并窗口毫秒数
   */
  constructor({
    lsClient,
    config = DEFAULT_WATCHDOG_PREFERENCES,
    lang = 'zh-CN',
    sendFn = null,
    nowFn = Date.now,
    aggregationWindowMs = DEFAULT_AGGREGATION_WINDOW_MS,
  }) {
    this.#lsClient = lsClient;
    this.#config = normalizeWatchdogPreferences(config);
    this.#lang = lang === 'en' ? 'en' : 'zh-CN';
    this.#sendFn = sendFn || ((ch, evt) => sendWebhookMessage(ch, evt, { nowFn: this.#nowFn, lang: this.#lang }));
    this.#nowFn = nowFn;
    this.#aggregationWindowMs = Math.max(0, Number(aggregationWindowMs) || 0);
  }

  /**
   * 更新运行时配置与语言；重新启用时重置基线，防止补发停用期间的历史旧账。
   *
   * @param {object} nextConfig 最新巡检配置
   * @param {{ lang?: string }} [options] 附加选项
   */
  updateConfig(nextConfig, { lang = null } = {}) {
    const prevEnabled = this.#config.enabled;
    this.#config = normalizeWatchdogPreferences(nextConfig, this.#config);
    if (lang === 'en' || lang === 'zh-CN') {
      this.#lang = lang;
    }
    if (!prevEnabled && this.#config.enabled) {
      this.#resetRuntimeBaselines();
    }
  }

  #resetRuntimeBaselines() {
    this.#initialized = false;
    this.#convStates.clear();
    this.#quotaStates.clear();
    this.#modelDisabledStates.clear();
    this.#activeIncidents.clear();
    this.#pendingQueue = [];
    this.#lsDownSinceMs = null;
  }

  /**
   * 启动后台定时巡检循环（15s 会话摘要 + 60s 配额）。
   */
  start() {
    if (this.#pollTimer) return;
    this.#running = true;
    void this.pollOnce({ forceQuota: true }).catch((err) => logWatchdogWarning('initial poll', err));
    this.#pollTimer = setInterval(() => {
      void this.pollOnce().catch((err) => logWatchdogWarning('poll cycle', err));
    }, SUMMARY_POLL_MS);
    if (typeof this.#pollTimer.unref === 'function') this.#pollTimer.unref();
  }

  /**
   * 停止后台巡检循环并清理定时器。
   */
  stop() {
    this.#running = false;
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }
  }

  /**
   * 执行单次可用性巡检扫描（并发重入保护）。
   *
   * @param {{ forceQuota?: boolean }} [options] 巡检选项
   * @return {Promise<void>}
   */
  async pollOnce({ forceQuota = false } = {}) {
    if (this.#polling) return;
    this.#polling = true;
    const nowMs = this.#nowFn();

    try {
      if (!this.#config.enabled) {
        this.#lastPollAt = nowMs;
        return;
      }

      // 1. 拉取全局会话与子代理摘要，判定 LS 连通性并初始化首轮基线
      let summaries = null;
      try {
        summaries = await this.#lsClient.getSummaries(true);
        this.#lsDownSinceMs = null;
        this.#lsHealthy = true;
        this.#resolveIncident('ls_unreachable', {
          category: 'ls_unreachable',
          summary: this.#lang === 'en' ? 'Language Server connection restored.' : '本机 Language Server 连接已恢复。',
        });
      } catch (err) {
        this.#handleLsUnreachable(err, nowMs);
        this.#lastPollAt = nowMs;
        return;
      }

      if (!this.#initialized) {
        await this.#captureStartupBaseline(summaries, nowMs);
        this.#initialized = true;
        this.#lastPollAt = nowMs;
        return;
      }

      // 2. 扫描非归档主会话及子代理异常信号
      await this.#inspectConversations(summaries, nowMs);

      // 3. 按 60s 周期巡检账户配额耗尽与模型禁用变更
      const shouldPollQuota = forceQuota || !this.#lastQuotaPollAt || nowMs - this.#lastQuotaPollAt >= QUOTA_POLL_MS;
      if (shouldPollQuota) {
        await this.#inspectQuota(nowMs, false);
      }

      this.#lastPollAt = nowMs;
    } finally {
      this.#polling = false;
    }
  }

  #handleLsUnreachable(err, nowMs) {
    this.#lsHealthy = false;
    if (this.#lsDownSinceMs === null) {
      this.#lsDownSinceMs = nowMs;
      return;
    }
    if (nowMs - this.#lsDownSinceMs >= LS_UNREACHABLE_THRESHOLD_MS) {
      this.#raiseIncident('ls_unreachable', {
        id: 'ls_unreachable',
        category: 'ls_unreachable',
        severity: 'critical',
        message: err instanceof Error ? err.message : String(err || 'Language Server unavailable'),
      });
    }
  }

  #setConvState(conversationId, state) {
    this.#convStates.set(conversationId, {
      status: state.status,
      stepCount: state.stepCount,
      lastModifiedTime: state.lastModifiedTime,
      retrySinceMs: state.retrySinceMs ?? null,
      lastProgressAtMs: state.lastProgressAtMs ?? null,
      baselineRetryCount: state.baselineRetryCount ?? 0,
      terminalFailed: Boolean(state.terminalFailed),
    });
  }

  async #captureStartupBaseline(summaries, nowMs) {
    for (const [conversationId, summary] of Object.entries(summaries || {})) {
      if (isArchivedSummary(summary) || summary?.trajectoryMetadata?.parentConversationId) continue;
      const status = String(summary?.status || 'IDLE');
      const isRetrying = RETRY_STATUS_RE.test(status);
      const isActive = isRetrying || ACTIVE_STATUS_RE.test(status);
      let baselineRetryCount = 0;

      if (isActive) {
        const proj = await this.#safeGetProjection(conversationId, summary);
        if (proj) {
          baselineRetryCount = inspectProjectionActivity(proj, status).retryCount;
        }
      }

      this.#setConvState(conversationId, {
        status,
        stepCount: Number(summary?.stepCount) || 0,
        lastModifiedTime: summary?.lastModifiedTime || null,
        retrySinceMs: isRetrying ? nowMs : null,
        lastProgressAtMs: isActive ? nowMs : null,
        baselineRetryCount,
      });
    }
    await this.#inspectQuota(nowMs, true);
  }

  async #collectChildIssues(summaries) {
    const childIssuesByRoot = new Map();
    for (const [childId, summary] of Object.entries(summaries || {})) {
      if (isArchivedSummary(summary)) continue;
      const meta = summary?.trajectoryMetadata || {};
      const parentId = meta.rootConversationId || meta.parentConversationId;
      if (!parentId || parentId === childId) continue;

      const status = String(summary?.status || '');
      if (!TERMINAL_FAILURE_RE.test(status) && !RETRY_STATUS_RE.test(status)) continue;

      const proj = await this.#safeGetProjection(childId, summary);
      const info = proj ? inspectProjectionActivity(proj, status) : null;
      const issue = {
        id: childId,
        status,
        role: meta?.subagentSpec?.role || summary?.summary || 'subagent',
        retryCount: info?.retryCount || 0,
        errorMessage: info?.latestErrorMessage || null,
      };
      if (!childIssuesByRoot.has(parentId)) childIssuesByRoot.set(parentId, []);
      childIssuesByRoot.get(parentId).push(issue);
    }
    return childIssuesByRoot;
  }

  async #inspectConversations(summaries, nowMs) {
    const childIssuesByRoot = await this.#collectChildIssues(summaries);
    const liveMainIds = [];

    for (const [conversationId, summary] of Object.entries(summaries || {})) {
      if (isArchivedSummary(summary) || summary?.trajectoryMetadata?.parentConversationId) continue;
      liveMainIds.push(conversationId);
      await this.#inspectSingleConversation(conversationId, summary, childIssuesByRoot.get(conversationId) || [], nowMs);
    }

    if (this.#convStates.size > MAX_TRACKED_CONVERSATIONS) {
      const liveSet = new Set(liveMainIds);
      for (const conversationId of this.#convStates.keys()) {
        if (!liveSet.has(conversationId)) this.#convStates.delete(conversationId);
      }
    }
  }

  async #inspectSingleConversation(conversationId, summary, childIssues, nowMs) {
    const status = String(summary?.status || 'IDLE');
    const stepCount = Number(summary?.stepCount) || 0;
    const lastModifiedTime = summary?.lastModifiedTime || null;
    const title = sanitizeAlertText(summary?.summary || conversationId.slice(0, 8), 48) || conversationId.slice(0, 8);
    const prev = this.#convStates.get(conversationId) || null;
    const progressed =
      !prev ||
      prev.stepCount !== stepCount ||
      prev.lastModifiedTime !== lastModifiedTime ||
      prev.status !== status;

    if (TERMINAL_FAILURE_RE.test(status)) {
      await this.#handleTerminalFailure(conversationId, summary, title, status, stepCount, lastModifiedTime, prev, childIssues);
      return;
    }

    if (TERMINAL_SUCCESS_RE.test(status)) {
      if (prev && progressed && !USER_CANCELLED_RE.test(status)) {
        const proj = await this.#safeGetProjection(conversationId, summary);
        if (hasTerminalErrorTail(proj)) {
          await this.#handleTerminalFailure(conversationId, summary, title, status, stepCount, lastModifiedTime, prev, childIssues, proj);
          return;
        }
      }
      this.#setConvState(conversationId, { status, stepCount, lastModifiedTime, terminalFailed: false });
      this.#resolveConversationIncidents(conversationId, title, status);
      return;
    }

    const isRetryingStatus = RETRY_STATUS_RE.test(status);
    if (!isRetryingStatus && !ACTIVE_STATUS_RE.test(status)) {
      this.#setConvState(conversationId, { status, stepCount, lastModifiedTime });
      return;
    }

    await this.#handleActiveConversation({
      conversationId,
      summary,
      title,
      status,
      stepCount,
      lastModifiedTime,
      prev,
      progressed,
      isRetryingStatus,
      childIssues,
      nowMs,
    });
  }

  async #handleTerminalFailure(conversationId, summary, title, status, stepCount, lastModifiedTime, prev, childIssues, prefetchedProj = null) {
    const wasAlreadyFailed = Boolean(prev?.terminalFailed || (prev && TERMINAL_FAILURE_RE.test(prev.status)));
    this.#setConvState(conversationId, { status, stepCount, lastModifiedTime, terminalFailed: true });
    if (wasAlreadyFailed) return;

    this.#clearStallIncidentSilently(conversationId);
    const proj = prefetchedProj || (await this.#safeGetProjection(conversationId, summary));
    const info = inspectProjectionActivity(proj, status);
    const primaryChild = childIssues.find((c) => c.errorMessage) || childIssues[0] || null;
    const rawMsg =
      info.latestErrorMessage ||
      (primaryChild ? `Subagent ${primaryChild.role} ${primaryChild.status}: ${primaryChild.errorMessage || ''}` : `Conversation ${status}`);
    const category = classifyFailureReason(rawMsg);
    this.#raiseIncident(`${category}:${conversationId}`, {
      id: `${category}:${conversationId}`,
      category,
      severity: 'critical',
      conversationId,
      conversationTitle: title,
      retryCount: info.retryCount || null,
      message: rawMsg,
    });
  }

  async #handleActiveConversation({
    conversationId,
    summary,
    title,
    status,
    stepCount,
    lastModifiedTime,
    prev,
    progressed,
    isRetryingStatus,
    childIssues,
    nowMs,
  }) {
    const childFailed = childIssues.find((c) => TERMINAL_FAILURE_RE.test(c.status) || HARD_BLOCKER_CATEGORIES.has(classifyFailureReason(c.errorMessage)));
    if (childFailed) {
      const childMsg = childFailed.errorMessage || `Subagent ${childFailed.role} ${childFailed.status}`;
      const childCat = classifyFailureReason(childMsg);
      this.#raiseIncident(`${childCat}:${conversationId}`, {
        id: `${childCat}:${conversationId}`,
        category: childCat,
        severity: 'critical',
        conversationId,
        conversationTitle: title,
        retryCount: childFailed.retryCount || null,
        message: `[${childFailed.role}] ${childMsg}`,
      });
    }

    const lastProgressAtMs = progressed ? nowMs : prev?.lastProgressAtMs ?? nowMs;
    const needProjection =
      isRetryingStatus ||
      progressed ||
      nowMs - lastProgressAtMs >= this.#config.silentStallSec * 1000;

    let info = { latestErrorMessage: null, retryCount: 0, isWaitingForUser: false, isLocalTool: false, isWaitingForModel: false };
    if (needProjection) {
      const proj = await this.#safeGetProjection(conversationId, summary);
      if (proj) info = inspectProjectionActivity(proj, status);
    }

    if (info.isWaitingForUser) {
      this.#setConvState(conversationId, { status, stepCount, lastModifiedTime, lastProgressAtMs: nowMs });
      this.#resolveConversationIncidents(conversationId, title, status);
      return;
    }

    const effectiveRetryCount = progressed || isRetryingStatus
      ? info.retryCount
      : Math.max(0, info.retryCount - (prev?.baselineRetryCount || 0));
    const isRetrying = isRetryingStatus || effectiveRetryCount > 0;
    const retrySinceMs = isRetrying ? (prev?.retrySinceMs ?? nowMs) : null;
    // 本地工具合法长耗时执行期间刷新检查基准，避免每 15s 重复拉取投影
    const nextProgressMs = !isRetrying && info.isLocalTool ? nowMs : lastProgressAtMs;

    this.#setConvState(conversationId, {
      status,
      stepCount,
      lastModifiedTime,
      retrySinceMs,
      lastProgressAtMs: nextProgressMs,
      baselineRetryCount: isRetrying ? 0 : (prev?.baselineRetryCount || 0),
    });

    if (isRetrying) {
      const errCat = classifyFailureReason(info.latestErrorMessage);
      if (HARD_BLOCKER_CATEGORIES.has(errCat)) {
        this.#raiseIncident(`${errCat}:${conversationId}`, {
          id: `${errCat}:${conversationId}`,
          category: errCat,
          severity: 'critical',
          conversationId,
          conversationTitle: title,
          retryCount: info.retryCount || 1,
          message: info.latestErrorMessage,
        });
        return;
      }

      const retryElapsedMs = retrySinceMs !== null ? nowMs - retrySinceMs : 0;
      if (info.retryCount >= this.#config.retryThreshold || retryElapsedMs >= this.#config.retryDurationSec * 1000) {
        this.#raiseIncident(`retry_stall:${conversationId}`, {
          id: `retry_stall:${conversationId}`,
          category: 'retry_stall',
          severity: 'warning',
          conversationId,
          conversationTitle: title,
          retryCount: info.retryCount || 1,
          message: info.latestErrorMessage || `Retrying for ${Math.round(retryElapsedMs / 1000)}s`,
        });
      }
      return;
    }

    if (info.isWaitingForModel && nowMs - lastProgressAtMs >= this.#config.silentStallSec * 1000) {
      this.#raiseIncident(`silent_stall:${conversationId}`, {
        id: `silent_stall:${conversationId}`,
        category: 'silent_stall',
        severity: 'warning',
        conversationId,
        conversationTitle: title,
        message:
          this.#lang === 'en'
            ? `No model response for ${Math.round((nowMs - lastProgressAtMs) / 1000)}s`
            : `等待模型首字响应已超过 ${Math.round((nowMs - lastProgressAtMs) / 1000)}s`,
      });
    } else if (progressed && !childFailed) {
      this.#resolveConversationIncidents(conversationId, title, status);
    }
  }

  async #safeGetProjection(conversationId, summary) {
    try {
      return await this.#lsClient.getProjection(conversationId, { summary, force: true });
    } catch (err) {
      logWatchdogWarning(`getProjection(${conversationId.slice(0, 8)})`, err);
      return null;
    }
  }

  async #inspectQuota(nowMs, baselineOnly) {
    let payload = null;
    try {
      payload = await this.#lsClient.getQuotaSummary({ force: true });
    } catch (err) {
      logWatchdogWarning('getQuotaSummary', err);
      return;
    }
    this.#lastQuotaPollAt = nowMs;

    for (const group of Array.isArray(payload?.groups) ? payload.groups : []) {
      const groupName = group?.displayName || 'Quota Group';
      for (const bucket of Array.isArray(group?.buckets) ? group.buckets : []) {
        const bucketId = bucket?.bucketId || `${groupName}:${bucket?.window || 'default'}`;
        const frac = Number(bucket?.remainingFraction);
        if (!Number.isFinite(frac)) continue;

        const prevFrac = this.#quotaStates.get(bucketId);
        this.#quotaStates.set(bucketId, frac);
        if (baselineOnly) continue;

        const fingerprint = `quota_exhausted:${bucketId}`;
        if (frac <= 0 && (prevFrac === undefined || prevFrac > 0)) {
          this.#raiseIncident(fingerprint, {
            id: fingerprint,
            category: 'quota_exhausted',
            severity: 'critical',
            groupName,
            bucketName: bucket.displayName || bucket.window || bucketId,
            resetTime: bucket.resetTime || null,
            message: `${groupName} (${bucket.displayName || bucket.window || ''}) remaining 0%`,
          });
        } else if (frac > 0) {
          this.#resolveIncident(fingerprint, {
            category: 'quota_exhausted',
            groupName,
            bucketName: bucket.displayName || bucket.window || bucketId,
            summary:
              this.#lang === 'en'
                ? `${groupName} quota has recovered (${Math.round(frac * 100)}% left).`
                : `${groupName} 配额已重置恢复（当前剩余 ${Math.round(frac * 100)}%）。`,
          });
        }
      }
    }

    for (const modelInfo of Array.isArray(payload?.models) ? payload.models : []) {
      const modelId = modelInfo?.modelId || modelInfo?.rawModel || modelInfo?.display;
      if (!modelId) continue;
      const disabled = Boolean(modelInfo?.disabled);
      const prevDisabled = this.#modelDisabledStates.get(modelId);
      this.#modelDisabledStates.set(modelId, disabled);
      if (baselineOnly) continue;

      const fingerprint = `model_disabled:${modelId}`;
      if (disabled && prevDisabled !== true) {
        this.#raiseIncident(fingerprint, {
          id: fingerprint,
          category: 'model_disabled',
          severity: 'warning',
          message: `${modelInfo.display || modelId} is now disabled`,
        });
      } else if (!disabled && prevDisabled === true) {
        this.#resolveIncident(fingerprint, {
          category: 'model_disabled',
          summary: `${modelInfo.display || modelId} ${this.#lang === 'en' ? 'is available again.' : '已恢复可用。'}`,
        });
      }
    }
  }

  #clearStallIncidentSilently(conversationId) {
    this.#activeIncidents.delete(`retry_stall:${conversationId}`);
    this.#activeIncidents.delete(`silent_stall:${conversationId}`);
  }

  #resolveConversationIncidents(conversationId, title, status) {
    for (const [fingerprint, incident] of [...this.#activeIncidents.entries()]) {
      if (incident.conversationId !== conversationId) continue;
      this.#resolveIncident(fingerprint, {
        category: incident.category,
        conversationId,
        conversationTitle: title,
        summary:
          this.#lang === 'en'
            ? `Conversation "${title}" recovered (${status}).`
            : `会话「${title}」已恢复（当前状态：${status}）。`,
      });
    }
  }

  #raiseIncident(fingerprint, incident) {
    const nowMs = this.#nowFn();
    this.#activeIncidents.set(fingerprint, { ...incident, detectedAtMs: nowMs });

    const lastSentAt = this.#lastAlertAt.get(fingerprint);
    const cooldownMs = this.#config.cooldownMin * 60_000;
    if (lastSentAt !== undefined && nowMs - lastSentAt < cooldownMs) {
      return false;
    }

    this.#lastAlertAt.set(fingerprint, nowMs);
    this.#enqueue({ kind: 'alert', fingerprint, incident });
    return true;
  }

  #resolveIncident(fingerprint, details) {
    const existing = this.#activeIncidents.get(fingerprint);
    if (!existing) return false;
    this.#activeIncidents.delete(fingerprint);
    if (!this.#config.notifyRecovery) return false;

    this.#enqueue({
      kind: 'recovery',
      fingerprint,
      incident: {
        id: fingerprint,
        category: details.category || existing.category,
        conversationId: details.conversationId || existing.conversationId || null,
        conversationTitle: details.conversationTitle || existing.conversationTitle || null,
        groupName: details.groupName || existing.groupName || null,
        message: details.summary,
      },
    });
    return true;
  }

  #enqueue(entry) {
    this.#pendingQueue.push(entry);
    if (this.#aggregationWindowMs === 0) return;
    if (!this.#flushTimer) {
      this.#flushTimer = setTimeout(() => {
        this.#flushTimer = null;
        void this.flushPending().catch((err) => logWatchdogWarning('flushPending', err));
      }, this.#aggregationWindowMs);
      if (typeof this.#flushTimer.unref === 'function') this.#flushTimer.unref();
    }
  }

  /**
   * 立即合并并派发当前待推送队列中的告警或恢复事件。
   *
   * @return {Promise<Array<object>>} 本次投递回执记录列表
   */
  async flushPending() {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }
    if (this.#pendingQueue.length === 0) return [];

    const batch = this.#pendingQueue.splice(0, this.#pendingQueue.length);
    const grouped = new Map();
    for (const item of batch) {
      const category = item.incident.category;
      const key = `${item.kind}\0${category}`;
      if (!grouped.has(key)) {
        grouped.set(key, { kind: item.kind, category, incidents: [] });
      }
      grouped.get(key).incidents.push(item.incident);
    }

    const enabledChannels = this.#config.channels.filter((ch) => ch.enabled);
    const deliveries = [];

    for (const { kind, category, incidents } of grouped.values()) {
      const alertEvent = this.#buildAlertEvent(kind, category, incidents);
      if (enabledChannels.length === 0) {
        deliveries.push(this.#recordDelivery(alertEvent, []));
        continue;
      }
      const channelResults = await Promise.all(enabledChannels.map((ch) => this.#sendFn(ch, alertEvent)));
      deliveries.push(this.#recordDelivery(alertEvent, channelResults));
    }

    return deliveries;
  }

  #buildAlertEvent(kind, category, incidents) {
    const dict = CATEGORY_TITLES[this.#lang] || CATEGORY_TITLES['zh-CN'];
    const baseTitle = dict[category] || category;
    const isRecovery = kind === 'recovery';
    const title = isRecovery
      ? `${this.#lang === 'en' ? '[Recovered] ' : '[已恢复] '}${baseTitle}`
      : baseTitle;

    let summary = '';
    if (isRecovery) {
      summary = incidents[0]?.message || title;
    } else if (incidents.length > 1) {
      summary =
        this.#lang === 'en'
          ? `${incidents.length} items affected by ${baseTitle}.`
          : `同时检测到 ${incidents.length} 项任务/资源触发「${baseTitle}」，请及时排查节点或额度。`;
    } else {
      summary =
        this.#lang === 'en'
          ? `Detected ${baseTitle}; please inspect VPN node, account quota, or task status.`
          : `检测到「${baseTitle}」，请及时排查 VPN 节点、账号配额或任务状态。`;
    }

    const maxSeverity = incidents.some((i) => i.severity === 'critical') ? 'critical' : 'warning';
    return {
      kind,
      category,
      severity: isRecovery ? 'info' : maxSeverity,
      title,
      summary,
      incidents,
    };
  }

  #recordDelivery(alertEvent, channelResults) {
    const entry = {
      id: randomUUID(),
      ts: this.#nowFn(),
      kind: alertEvent.kind,
      category: alertEvent.category,
      title: sanitizeAlertText(alertEvent.title, 80),
      summary: sanitizeAlertText(alertEvent.summary, 160),
      incidentCount: Array.isArray(alertEvent.incidents) ? alertEvent.incidents.length : 0,
      channelResults: (Array.isArray(channelResults) ? channelResults : []).map((r) => ({
        channelId: r.channelId,
        channelName: sanitizeAlertText(r.channelName, 40),
        type: r.type,
        ok: Boolean(r.ok),
        error: r.error ? sanitizeAlertText(r.error, 100) : null,
      })),
    };

    this.#recentDeliveries.unshift(entry);
    if (this.#recentDeliveries.length > MAX_RECENT_DELIVERIES) {
      this.#recentDeliveries.length = MAX_RECENT_DELIVERIES;
    }
    return entry;
  }

  /**
   * 立即向指定通道、临时表单通道或全部启用通道发送测试通知。
   *
   * @param {{ channelId?: string|null, channel?: object|null }} [params] 测试目标
   * @return {Promise<{ ok: boolean, error: string|null, results: Array<object> }>}
   */
  async sendTestAlert({ channelId = null, channel = null } = {}) {
    let targets = [];
    if (channel && typeof channel === 'object') {
      targets = normalizeAlertChannels([channel], this.#config.channels);
    } else if (channelId) {
      targets = this.#config.channels.filter((c) => c.id === channelId);
    } else {
      targets = this.#config.channels.filter((c) => c.enabled);
    }

    if (targets.length === 0) {
      return { ok: false, error: 'no_channels', results: [] };
    }

    const isEn = this.#lang === 'en';
    const alertEvent = {
      kind: 'test',
      category: 'test',
      severity: 'info',
      title: CATEGORY_TITLES[this.#lang].test,
      summary: isEn
        ? 'Antigravity Token Lens availability watchdog webhook test succeeded.'
        : 'Antigravity Token Lens 可用性巡检告警通道测试成功，VPN 节点异常或配额耗尽时将推送至此。',
      incidents: [],
    };

    const results = await Promise.all(targets.map((ch) => this.#sendFn(ch, alertEvent)));
    this.#recordDelivery(alertEvent, results);
    return {
      ok: results.every((r) => r.ok),
      error: results.find((r) => !r.ok)?.error || null,
      results,
    };
  }

  /**
   * 返回供面板展示的脱敏巡检状态、活跃事件与最近 20 条投递流水。
   *
   * @return {object}
   */
  getStatus() {
    const enabledChannelCount = this.#config.channels.filter((c) => c.enabled).length;
    return {
      enabled: this.#config.enabled,
      running: this.#running,
      initialized: this.#initialized,
      lsHealthy: this.#lsHealthy,
      lastPollAt: this.#lastPollAt,
      lastQuotaPollAt: this.#lastQuotaPollAt,
      channelCount: this.#config.channels.length,
      enabledChannelCount,
      activeIncidents: [...this.#activeIncidents.values()].map((inc) => ({
        id: inc.id,
        category: inc.category,
        severity: inc.severity,
        conversationId: inc.conversationId || null,
        conversationTitle: inc.conversationTitle || null,
        groupName: inc.groupName || null,
        message: sanitizeAlertText(inc.message || '', 120),
        detectedAtMs: inc.detectedAtMs,
      })),
      recentDeliveries: this.#recentDeliveries.map((d) => ({ ...d })),
    };
  }
}
