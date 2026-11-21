/**
 * Token Lens 前端交互与可视化引擎，负责自适应轮询、主题同步、中英双语、SVG 趋势图与视角钻取。
 *
 * @author Ateng
 * @since 2026-11-16
 */

(() => {
  'use strict';

  const I18N = {
    'zh-CN': {
      backParent: '← 返回主会话',
      copySummary: '复制会话诊断摘要',
      settingsTitle: '上限与预警设置',
      limitLabel: '当前模型上下文上限 (Tokens)',
      limitPlaceholder: '留空使用宿主/参考上限',
      resetLimit: '恢复默认',
      warnAtLabel: '注意阈值 (%)',
      critAtLabel: '预警阈值 (%)',
      saveSettings: '保存配置',
      emptyTitle: '等待会话数据',
      emptyDesc: '在对话发送首条消息后，上下文水位、流式速率与缓存指标将实时显示在此处。',
      contextTitle: '上下文水位',
      remaining: '剩余可用',
      srcOverride: '自定义上限',
      srcHost: '宿主实时上报',
      srcRef: '模型参考上限',
      srcUnknown: '上限未知（可在右上角设置）',
      usedMeasured: '实测占用',
      usedPreflight: '预估占用',
      breakdownPreflightPrefix: '构成明细为宿主发包前预估',
      breakdownDeltaPrefix: '与实测差值',
      warnAlert: '上下文占用偏高，建议留意长文件与大输出',
      critAlert: '上下文接近上限，建议执行 /compact 或开启新会话',
      speedTitle: '纯流式速率',
      speedTitleEst: '估算速率 (含等待)',
      speedTitleE2e: '端到端速率',
      ttftTitle: '首字延迟 TTFT',
      turnElapsedLabel: '跨步耗时',
      cacheTitle: '缓存命中率',
      latestHit: '本轮',
      savedPrefix: '命中省下',
      writePrefix: '写入',
      uncachedPrefix: '未命中',
      rebuiltTag: '次缓存重建',
      turnRebuilt: '缓存重建',
      totalsTitle: '会话累计消耗',
      totMain: '主会话',
      totSub: '子代理',
      totGrand: '总计',
      tabBreakdown: '上下文构成',
      tabTurns: '逐轮明细',
      tabSubagents: '子代理',
      tabDiagnostics: '工具与诊断',
      runningPhaseWait: '思考/排队中',
      runningPhaseStream: '流式生成中',
      runningPhaseRetry: '重试中',
      idleStatus: '空闲',
      offlineStatus: '离线快照',
      sourceRpc: 'RPC 实时',
      sourceTranscript: '离线日志',
      noBreakdown: '离线日志模式暂无结构拆分，连接活跃 Antigravity 宿主后即可查看 System / Tools / Chat 占比。',
      noTurns: '暂无已完成的模型响应记录。',
      noFilteredTurns: '当前筛选条件下无匹配轮次。',
      noSubagents: '当前会话尚未派生子代理。',
      noToolsUsed: '当前会话暂无工具调用记录。',
      topHotspots: '最占上下文的步骤 (Top 10)',
      thinkingLabel: '思考',
      responseLabel: '正文',
      avgLabel: '均值',
      peakLabel: '峰值',
      ttftLabel: 'TTFT',
      e2eLabel: 'E2E',
      stepPrefix: '步骤 #',
      clickInspect: '点击下钻查看 →',
      groupSystem: '系统指令',
      groupTools: '工具定义',
      groupChat: '对话消息',
      groupOther: '其他',
      perTurnGrowth: '轮均增长',
      estTurnsLeft: '约剩',
      turnsUnit: '轮',
      shortSampleTag: '短样本',
      retryTag: '重试',
      expandAll: '展开全部',
      collapseList: '收起',
      filterAll: '全部',
      filterRebuilt: '缓存重建',
      filterSlow: '慢首字 (>5s)',
      filterRetry: '含重试',
      timingWait: '首字等待',
      timingStream: '流式生成',
      timingElapsed: '跨步耗时',
      timingTool: '工具执行',
      diagLatencyTitle: '延迟与重试统计',
      diagAvgTtft: '平均 / P95 首字',
      diagRetryCost: '重试次数 / 消耗',
      diagBudgetTitle: '规则与定制预算',
      diagCustomUsed: '定制底座 (Rules/Skills/Subagents)',
      diagToolsTitle: '工具消耗排行榜',
      diagToolMeta: '次调用',
      diagErrCount: '失败',
      exportJson: '复制完整 JSON 快照',
    },
    en: {
      backParent: '← Back to Parent',
      copySummary: 'Copy Markdown summary',
      settingsTitle: 'Context Limit & Alerts',
      limitLabel: 'Context Window Limit (Tokens)',
      limitPlaceholder: 'Auto (host / reference)',
      resetLimit: 'Reset',
      warnAtLabel: 'Warn Threshold (%)',
      critAtLabel: 'Critical Threshold (%)',
      saveSettings: 'Save',
      emptyTitle: 'Waiting for Conversation Data',
      emptyDesc: 'Send a prompt to start tracking live context window usage, throughput, and cache hits.',
      contextTitle: 'Context Window',
      remaining: 'Remaining',
      srcOverride: 'Custom override',
      srcHost: 'Host reported',
      srcRef: 'Reference limit',
      srcUnknown: 'Unknown limit (set in gear)',
      usedMeasured: 'Measured',
      usedPreflight: 'Est.',
      breakdownPreflightPrefix: 'Breakdown uses host pre-flight estimate',
      breakdownDeltaPrefix: 'Δ vs measured',
      warnAlert: 'Context usage is rising; watch large tool outputs.',
      critAlert: 'Context nearly full. Consider /compact or starting a new chat.',
      speedTitle: 'Streaming Speed',
      speedTitleEst: 'Est. Speed (incl. wait)',
      speedTitleE2e: 'E2E Speed',
      ttftTitle: 'TTFT Latency',
      turnElapsedLabel: 'Elapsed',
      cacheTitle: 'Cache Hit Rate',
      latestHit: 'Last',
      savedPrefix: 'Saved',
      writePrefix: 'Write',
      uncachedPrefix: 'Uncached',
      rebuiltTag: 'cache rebuilds',
      turnRebuilt: 'Rebuilt',
      totalsTitle: 'Cumulative Usage',
      totMain: 'Main',
      totSub: 'Subagents',
      totGrand: 'Total',
      tabBreakdown: 'Breakdown',
      tabTurns: 'Turns',
      tabSubagents: 'Subagents',
      tabDiagnostics: 'Diagnostics',
      runningPhaseWait: 'Thinking / Queue',
      runningPhaseStream: 'Streaming',
      runningPhaseRetry: 'Retrying',
      idleStatus: 'Idle',
      offlineStatus: 'Offline',
      sourceRpc: 'Live RPC',
      sourceTranscript: 'Transcript',
      noBreakdown: 'Breakdown is available in Live RPC mode.',
      noTurns: 'No completed model responses yet.',
      noFilteredTurns: 'No turns match the active filter.',
      noSubagents: 'No subagents spawned in this conversation.',
      noToolsUsed: 'No tool calls recorded in this conversation.',
      topHotspots: 'Heaviest Chat Steps (Top 10)',
      thinkingLabel: 'Think',
      responseLabel: 'Resp',
      avgLabel: 'Avg',
      peakLabel: 'Peak',
      ttftLabel: 'TTFT',
      e2eLabel: 'E2E',
      stepPrefix: 'Step #',
      clickInspect: 'Inspect →',
      groupSystem: 'System Prompt',
      groupTools: 'Tools',
      groupChat: 'Chat Messages',
      groupOther: 'Other',
      perTurnGrowth: 'Growth',
      estTurnsLeft: '~left',
      turnsUnit: 'turns',
      shortSampleTag: 'Short',
      retryTag: 'Retry',
      expandAll: 'Show all',
      collapseList: 'Collapse',
      filterAll: 'All',
      filterRebuilt: 'Rebuilt',
      filterSlow: 'Slow TTFT (>5s)',
      filterRetry: 'Retried',
      timingWait: 'TTFT Wait',
      timingStream: 'Streaming',
      timingElapsed: 'Turn Elapsed',
      timingTool: 'Tools',
      diagLatencyTitle: 'Latency & Retries',
      diagAvgTtft: 'Avg / P95 TTFT',
      diagRetryCost: 'Retries / Overhead',
      diagBudgetTitle: 'Rules & Custom Budget',
      diagCustomUsed: 'Custom Base (Rules/Skills/Subagents)',
      diagToolsTitle: 'Tool Impact Leaderboard',
      diagToolMeta: 'calls',
      diagErrCount: 'err',
      exportJson: 'Copy JSON Snapshot',
    },
  };

  const state = {
    lang: 'zh-CN',
    activeTab: 'breakdown',
    turnFilter: 'all',
    expandedGroups: new Set(),
    chartMode: 'streaming', // 'streaming' | 'ttft'
    rootConversationId: resolveInitialConversationId(),
    focusedConversationId: resolveInitialConversationId(),
    etag: null,
    snapshot: null,
    pollTimer: null,
    clockTimer: null,
    isFetching: false,
  };

  const $ = (id) => document.getElementById(id);

  function resolveInitialConversationId() {
    const fromSidecar = window.sidecar?.conversationId;
    if (fromSidecar) return fromSidecar;
    const params = new URLSearchParams(window.location.search);
    return params.get('conversationId') || null;
  }

  function apiFetch(url, options = {}) {
    if (window.sidecar?.fetch) {
      return window.sidecar.fetch(url, options);
    }
    return fetch(url, options);
  }

  function t(key) {
    return I18N[state.lang]?.[key] ?? I18N['zh-CN'][key] ?? key;
  }

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtCompact(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(Math.round(n));
  }

  function fmtInt(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function fmtRate(n, estimated = false) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    return `${estimated ? '~' : ''}${n.toFixed(1)}`;
  }

  function fmtSec(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    return n >= 10 ? `${n.toFixed(1)}s` : `${n.toFixed(2)}s`;
  }

  function fmtPct(ratio, isAlreadyPercent = false) {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '—';
    const val = isAlreadyPercent ? ratio : ratio * 100;
    return `${val.toFixed(1)}%`;
  }

  function detectThemeFromBg() {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    const hex = bg.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      document.documentElement.dataset.theme = lum < 0.45 ? 'dark' : 'light';
      return true;
    }
    return false;
  }

  function applyTheme(hostMode) {
    if (detectThemeFromBg()) return;
    if (hostMode === 'dark' || hostMode === 'light') {
      document.documentElement.dataset.theme = hostMode;
    } else {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    }
  }

  function localizeStaticUi() {
    document.documentElement.lang = state.lang;
    $('btn-lang').textContent = state.lang === 'zh-CN' ? 'EN' : '中文';
    $('btn-back-parent').textContent = t('backParent');
    $('btn-copy-summary').title = t('copySummary');
    $('lbl-settings-title').textContent = t('settingsTitle');
    $('lbl-limit-input').textContent = t('limitLabel');
    $('input-max-tokens').placeholder = t('limitPlaceholder');
    $('btn-reset-limit').textContent = t('resetLimit');
    $('lbl-warn-at').textContent = t('warnAtLabel');
    $('lbl-crit-at').textContent = t('critAtLabel');
    $('btn-save-settings').textContent = t('saveSettings');
    $('empty-title').textContent = t('emptyTitle');
    $('empty-desc').textContent = t('emptyDesc');
    $('lbl-context-title').textContent = t('contextTitle');
    $('lbl-cache-title').textContent = t('cacheTitle');
    $('lbl-totals-title').textContent = t('totalsTitle');
    $('lbl-tot-main').textContent = t('totMain');
    $('lbl-tot-grand').textContent = t('totGrand');

    const tabs = document.querySelectorAll('.tl-tab');
    for (const tab of tabs) {
      if (tab.dataset.tab === 'breakdown') tab.textContent = t('tabBreakdown');
      else if (tab.dataset.tab === 'turns') tab.textContent = t('tabTurns');
      else if (tab.dataset.tab === 'subagents') tab.textContent = t('tabSubagents');
      else if (tab.dataset.tab === 'diagnostics') tab.textContent = t('tabDiagnostics');
    }
  }

  async function copyText(text, btnEl) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    if (btnEl) {
      btnEl.classList.add('is-copied');
      setTimeout(() => btnEl.classList.remove('is-copied'), 1200);
    }
  }

  function renderConversationTitle(snap) {
    const titleEl = $('conv-title');
    if (!titleEl) return;
    if (!snap || snap.empty || snap.notFound) {
      titleEl.textContent = '--';
      titleEl.title = '';
      return;
    }
    const c = snap.conversation || {};
    const title = c.title || (c.id ? c.id.slice(0, 8) : '--');
    titleEl.textContent = title;
    titleEl.title = c.id ? `${title} (${c.id})` : title;
  }

  async function refreshSnapshot(force = false) {
    if (state.isFetching) return;
    state.isFetching = true;
    try {
      const params = new URLSearchParams();
      if (state.focusedConversationId) params.set('conversationId', state.focusedConversationId);
      if (state.etag && !force) params.set('etag', state.etag);
      if (force) params.set('force', '1');

      const res = await apiFetch(`/api/snapshot?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.preferences?.lang && data.preferences.lang !== state.lang) {
        state.lang = data.preferences.lang;
        localizeStaticUi();
      }
      applyTheme(data.hostTheme?.mode);

      if (data.unchanged) {
        scheduleNextPoll();
        return;
      }

      if (data.etag) state.etag = data.etag;
      state.snapshot = data;
      renderSnapshot(data);
    } catch {
      // 网络波动等待下次轮询恢复
    } finally {
      state.isFetching = false;
      scheduleNextPoll();
    }
  }

  function scheduleNextPoll() {
    clearTimeout(state.pollTimer);
    const hidden = document.visibilityState === 'hidden';
    const isRunning = Boolean(state.snapshot?.conversation?.isRunning);
    const delay = hidden ? 6000 : isRunning ? 1000 : 2000;
    state.pollTimer = setTimeout(() => void refreshSnapshot(false), delay);
  }

  function formatRunningPhaseLabel(ar) {
    if (ar?.phase === 'streaming') return t('runningPhaseStream');
    if (ar?.phase === 'retrying') {
      const base = t('runningPhaseRetry');
      if (ar.retryAttempt > 0 && ar.retryMaxAttempts > 0) {
        return `${base} (${ar.retryAttempt}/${ar.retryMaxAttempts})`;
      }
      if (ar.retryAttempt > 0) {
        return state.lang === 'zh-CN' ? `${base} (第 ${ar.retryAttempt} 次)` : `${base} (#${ar.retryAttempt})`;
      }
      return base;
    }
    return t('runningPhaseWait');
  }

  function updateRunningTimer() {
    const snap = state.snapshot;
    const pill = $('status-badge');
    const textEl = $('status-text');
    if (!snap || snap.empty || snap.notFound) {
      pill.classList.remove('is-running', 'is-retrying');
      pill.title = '';
      textEl.textContent = '--';
      return;
    }

    const c = snap.conversation;
    if (c?.isRunning) {
      const ar = snap.activeRun;
      const isRetrying = ar?.phase === 'retrying';
      pill.classList.add('is-running');
      pill.classList.toggle('is-retrying', isRetrying);
      pill.title = isRetrying && ar?.retryError ? ar.retryError : '';
      const elapsedSec = ar?.startedAtMs ? Math.max(0, (Date.now() - ar.startedAtMs) / 1000) : null;
      const phaseLabel = formatRunningPhaseLabel(ar);
      textEl.textContent = elapsedSec !== null ? `${phaseLabel} · ${elapsedSec.toFixed(1)}s` : phaseLabel;
    } else {
      pill.classList.remove('is-running', 'is-retrying');
      pill.title = '';
      textEl.textContent = snap.source === 'rpc' ? t('idleStatus') : t('offlineStatus');
    }
  }

  function renderSnapshot(snap) {
    const hierarchy = snap.hierarchy || {};
    const parentId = hierarchy.parentId || null;
    const backBtn = $('btn-back-parent');
    if (parentId || (state.rootConversationId && state.focusedConversationId !== state.rootConversationId)) {
      backBtn.classList.remove('hidden');
      backBtn.dataset.targetId = parentId || state.rootConversationId;
    } else {
      backBtn.classList.add('hidden');
    }

    if (snap.empty || snap.notFound) {
      $('empty-state').classList.remove('hidden');
      $('main-content').classList.add('hidden');
      $('model-badge').textContent = '--';
      $('source-badge').textContent = '--';
      $('source-badge').title = snap.rpcError || '';
      renderConversationTitle(snap);
      updateRunningTimer();
      return;
    }

    $('empty-state').classList.add('hidden');
    $('main-content').classList.remove('hidden');

    const c = snap.conversation || {};
    const ctx = snap.context || {};
    const tp = snap.throughput || {};
    const ch = snap.cache || {};
    const tot = snap.totals || {};
    const prefs = snap.preferences || {};

    renderConversationTitle(snap);
    $('model-badge').textContent = c.model || 'Unknown';
    $('source-badge').textContent = snap.source === 'rpc' ? t('sourceRpc') : t('sourceTranscript');
    $('source-badge').title = snap.source !== 'rpc' && snap.rpcError ? snap.rpcError : '';
    updateRunningTimer();

    // 1. 上下文水位
    $('ctx-used').textContent = fmtCompact(ctx.usedTokens);
    $('ctx-max').textContent = fmtCompact(ctx.maxTokens);
    const pctEl = $('ctx-pct');
    pctEl.textContent = fmtPct(ctx.usedPercent, true);
    pctEl.className = `tl-pct-pill ${ctx.alertLevel === 'critical' ? 'is-crit' : ctx.alertLevel === 'warn' ? 'is-warn' : ''}`;

    const barEl = $('ctx-bar');
    const clampedPct = ctx.usedPercent !== null ? Math.min(100, Math.max(0, ctx.usedPercent)) : 0;
    barEl.style.width = `${clampedPct.toFixed(1)}%`;
    barEl.className = `tl-progress-fill ${ctx.alertLevel === 'critical' ? 'is-crit' : ctx.alertLevel === 'warn' ? 'is-warn' : ''}`;

    $('ctx-warn-mark').style.left = `${prefs.warnAt ?? 70}%`;
    $('ctx-crit-mark').style.left = `${prefs.criticalAt ?? 85}%`;

    const remBase = ctx.remainingTokens !== null ? `${t('remaining')}: ${fmtCompact(ctx.remainingTokens)}` : `${t('remaining')}: —`;
    const growth = ctx.growth || {};
    const growthNote =
      growth.avgPerTurn > 0
        ? ` · +${fmtCompact(growth.avgPerTurn)}/${t('turnsUnit')}${growth.estTurnsToCritical !== null ? ` (${t('estTurnsLeft')} ${growth.estTurnsToCritical} ${t('turnsUnit')})` : ''}`
        : '';
    $('ctx-remaining').textContent = `${remBase}${growthNote}`;
    const srcMap = { override: 'srcOverride', host: 'srcHost', reference: 'srcRef', unknown: 'srcUnknown' };
    const usedMap = { measured: 'usedMeasured', preflight: 'usedPreflight' };
    const usedPrefix = usedMap[ctx.usedSource] ? `${t(usedMap[ctx.usedSource])} · ` : '';
    $('ctx-max-source').textContent = `${usedPrefix}${t(srcMap[ctx.maxSource] || 'srcUnknown')}`;

    const alertBanner = $('ctx-alert-banner');
    if (ctx.alertLevel === 'critical' || ctx.alertLevel === 'warn') {
      alertBanner.classList.remove('hidden');
      alertBanner.className = `tl-alert ${ctx.alertLevel === 'critical' ? 'is-crit' : ''}`;
      $('ctx-alert-text').textContent = ctx.alertLevel === 'critical' ? t('critAlert') : t('warnAlert');
    } else {
      alertBanner.classList.add('hidden');
    }

    renderMiniBreakdown(ctx.breakdown);

    // 2. 速率卡片
    renderThroughputCard(tp, snap.estimatedSpeed, snap.source === 'transcript');

    // 3. 缓存卡片
    $('cache-main').textContent = fmtPct(ch.cumulativeHitRate);
    $('cache-latest').textContent = `${t('latestHit')} ${fmtPct(ch.latestHitRate)}`;
    $('cache-saved').textContent = `${t('savedPrefix')} ${fmtCompact(ch.totalSavedTokens)} tok`;
    const writeText = ch.totalCacheWrite > 0 ? ` · ${t('writePrefix')} ${fmtCompact(ch.totalCacheWrite)}` : '';
    $('cache-detail').textContent = `${t('uncachedPrefix')} ${fmtCompact(ch.totalUncachedInput)}${writeText}`;
    const hitPct = ch.cumulativeHitRate !== null ? Math.min(100, Math.max(0, ch.cumulativeHitRate * 100)) : 0;
    $('cache-bar').style.width = `${hitPct.toFixed(1)}%`;
    renderCacheSparkline($('cache-sparkline'), ch.series || []);

    const rebuildEl = $('cache-rebuild-pill');
    if (ch.rebuildCount > 0) {
      rebuildEl.classList.remove('hidden');
      rebuildEl.textContent = `${ch.rebuildCount} ${t('rebuiltTag')}`;
    } else {
      rebuildEl.classList.add('hidden');
    }

    // 4. 累计消耗与耗时分布
    $('lbl-tot-sub').textContent = `${t('totSub')} (${tot.subagentCount || 0})`;
    $('tot-main-val').textContent = fmtCompact(tot.main?.totalTokens);
    $('tot-sub-val').textContent = fmtCompact(tot.subagents?.totalTokens);
    $('tot-grand-val').textContent = fmtCompact(tot.grand?.totalTokens);
    $('totals-grand-pill').textContent = `${fmtInt(tot.grand?.totalTokens)} tok`;
    $('tot-breakdown-line').textContent = `${t('uncachedPrefix')} ${fmtCompact(tot.grand?.uncachedInput)} · Cache ${fmtCompact(tot.grand?.cacheRead)} · Out ${fmtCompact(tot.grand?.output)}`;

    const tm = snap.timing || {};
    const retry = snap.diagnostics?.retry || {};
    const timingParts = [];
    if (tm.totalTtftSec > 0) timingParts.push(`${t('timingWait')} ${fmtSec(tm.totalTtftSec)}`);
    if (tm.totalStreamingSec > 0) {
      const streamLbl = snap.source === 'transcript' ? t('timingElapsed') : t('timingStream');
      timingParts.push(`${streamLbl} ${fmtSec(tm.totalStreamingSec)}`);
    }
    if (tm.totalToolSec > 0) timingParts.push(`${t('timingTool')} ${fmtSec(tm.totalToolSec)}`);
    if (retry.count > 0) timingParts.push(`${t('retryTag')} ×${retry.count} (+${fmtCompact(retry.totalTokens)})`);
    const timingEl = $('tot-timing-line');
    if (timingParts.length > 0) {
      timingEl.classList.remove('hidden');
      timingEl.textContent = `⏱ ${timingParts.join(' · ')}`;
    } else {
      timingEl.classList.add('hidden');
    }

    // 5. 下钻 Tabs
    renderBreakdownTab(ctx.breakdown, ctx.estimationDelta);
    renderTurnsTab(snap.turns || []);
    renderSubagentsTab(snap.subagents || []);
    renderDiagnosticsTab(snap);
  }

  function renderMiniBreakdown(breakdown) {
    const wrap = $('breakdown-mini');
    if (!breakdown || !breakdown.groups?.length) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    const segBar = $('breakdown-seg-bar');
    const legend = $('breakdown-legend');
    segBar.replaceChildren();
    legend.replaceChildren();

    const colorClass = { system: 'tl-seg-system', tools: 'tl-seg-tools', chat: 'tl-seg-chat', other: 'tl-seg-other' };
    const labelKey = { system: 'groupSystem', tools: 'groupTools', chat: 'groupChat', other: 'groupOther' };

    for (const g of breakdown.groups) {
      const seg = document.createElement('div');
      seg.className = `tl-seg ${colorClass[g.key] || 'tl-seg-other'}`;
      seg.style.width = `${Math.max(0.5, g.percent).toFixed(2)}%`;
      segBar.appendChild(seg);

      const item = document.createElement('span');
      item.className = 'tl-legend-item';
      const dot = document.createElement('span');
      dot.className = `tl-legend-dot ${colorClass[g.key] || 'tl-seg-other'}`;
      const txt = document.createElement('span');
      txt.textContent = `${t(labelKey[g.key] || 'groupOther')} ${fmtCompact(g.tokens)} (${g.percent.toFixed(0)}%)`;
      item.append(dot, txt);
      legend.appendChild(item);
    }
  }

  function renderThroughputCard(tp, estimated, isTranscript = false) {
    const isTtft = !isTranscript && state.chartMode === 'ttft';
    $('btn-toggle-chart').classList.toggle('hidden', isTranscript);
    $('btn-toggle-chart').textContent = isTtft ? 'TTFT' : 'tok/s';
    $('lbl-speed-title').textContent = isTtft
      ? t('ttftTitle')
      : isTranscript
        ? t('speedTitleEst')
        : t('speedTitle');

    if (isTtft) {
      $('tp-main').textContent = tp.latestTtftSec !== null ? tp.latestTtftSec.toFixed(1) : '—';
      $('tp-unit').textContent = 's';
      $('tp-sub-line1').textContent = `${t('speedTitle')} ${fmtRate(tp.latestStreamingTps, estimated)} tok/s · ${t('e2eLabel')} ${fmtRate(tp.latestE2eTps, estimated)}`;
    } else {
      $('tp-main').textContent = fmtRate(tp.latestStreamingTps, estimated);
      $('tp-unit').textContent = 'tok/s';
      $('tp-sub-line1').textContent = isTranscript
        ? `${t('turnElapsedLabel')} ${fmtSec(tp.latestStreamingSec)}`
        : `${t('ttftLabel')} ${fmtSec(tp.latestTtftSec)} · ${t('e2eLabel')} ${fmtRate(tp.latestE2eTps, estimated)}`;
    }

    const thinkInfo =
      tp.latestThinkingTokens !== null && tp.latestOutputTokens !== null
        ? ` · ${t('thinkingLabel')} ${fmtCompact(tp.latestThinkingTokens)}/${fmtCompact(tp.latestOutputTokens)}`
        : '';
    $('tp-sub-line2').textContent = `${t('avgLabel')} ${fmtRate(tp.avgStreamingTps, estimated)} · ${t('peakLabel')} ${fmtRate(tp.peakStreamingTps, estimated)}${thinkInfo}`;

    renderSparkline($('tp-sparkline'), tp.series || [], isTtft ? 'ttftSec' : 'streamingTps');
  }

  function renderSparkline(container, series, field) {
    container.replaceChildren();
    const vals = series.map((s) => (typeof s[field] === 'number' && Number.isFinite(s[field]) ? s[field] : null));
    const valid = vals.filter((v) => v !== null);
    if (valid.length === 0) return;

    const stableVals =
      field === 'streamingTps'
        ? series.filter((s) => !s.isShortSample && typeof s[field] === 'number').map((s) => s[field])
        : valid;
    const max = Math.max(...(stableVals.length ? stableVals : valid), 1);
    const width = 160;
    const height = 28;
    const barGap = 2;
    const count = Math.max(vals.length, 6);
    const barW = (width - barGap * (count - 1)) / count;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    const offset = count - vals.length;
    vals.forEach((v, idx) => {
      const step = series[idx];
      const clampedRatio = v === null ? 0 : Math.min(1, v / max);
      const h = v === null ? 2 : Math.max(3, Math.round(clampedRatio * (height - 2)));
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String((offset + idx) * (barW + barGap)));
      rect.setAttribute('y', String(height - h));
      rect.setAttribute('width', String(Math.max(2, barW)));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '1.5');
      const isShort = field === 'streamingTps' && step.isShortSample;
      const fill =
        v === null
          ? 'var(--tl-border)'
          : isShort
            ? 'color-mix(in srgb, var(--tl-fg-muted) 45%, transparent)'
            : idx === vals.length - 1
              ? 'var(--tl-primary)'
              : 'color-mix(in srgb, var(--tl-primary) 55%, transparent)';
      rect.setAttribute('fill', fill);
      const title = document.createElementNS(svgNS, 'title');
      const shortNote = isShort ? ` (${t('shortSampleTag')})` : '';
      title.textContent = `#${step.stepIndex}: ${v !== null ? v.toFixed(1) : '—'}${shortNote}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });

    container.appendChild(svg);
  }

  function renderCacheSparkline(container, series) {
    container.replaceChildren();
    if (!Array.isArray(series) || series.length === 0) return;
    const vals = series.map((s) => (typeof s.cacheHitRate === 'number' && Number.isFinite(s.cacheHitRate) ? s.cacheHitRate : null));
    if (!vals.some((v) => v !== null)) return;

    const width = 160;
    const height = 24;
    const barGap = 2;
    const count = Math.max(vals.length, 6);
    const barW = (width - barGap * (count - 1)) / count;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    const offset = count - vals.length;
    vals.forEach((v, idx) => {
      const step = series[idx];
      const h = v === null ? 2 : Math.max(2, Math.round(Math.min(1, Math.max(0, v)) * (height - 2)));
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String((offset + idx) * (barW + barGap)));
      rect.setAttribute('y', String(height - h));
      rect.setAttribute('width', String(Math.max(2, barW)));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '1.5');
      const fill =
        v === null
          ? 'var(--tl-border)'
          : step.cacheRebuilt
            ? 'var(--tl-warn)'
            : idx === vals.length - 1
              ? 'var(--tl-success)'
              : 'color-mix(in srgb, var(--tl-success) 55%, transparent)';
      rect.setAttribute('fill', fill);
      const title = document.createElementNS(svgNS, 'title');
      const rebuiltNote = step.cacheRebuilt ? ` · ${t('turnRebuilt')}` : '';
      title.textContent = `#${step.stepIndex}: ${v !== null ? `${(v * 100).toFixed(1)}%` : '—'} (Cache ${fmtCompact(step.cacheReadTokens)} / In ${fmtCompact(step.inputTokens)})${rebuiltNote}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });

    container.appendChild(svg);
  }

  function formatSignedDelta(delta) {
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return null;
    const sign = delta > 0 ? '+' : '-';
    return `${sign}${fmtCompact(Math.abs(delta))}`;
  }

  function renderBreakdownTab(breakdown, estimationDelta = null) {
    const pane = $('tab-breakdown');
    pane.replaceChildren();
    if (!breakdown || !breakdown.groups?.length) {
      const msg = document.createElement('div');
      msg.className = 'tl-muted';
      msg.textContent = t('noBreakdown');
      pane.appendChild(msg);
      return;
    }

    const deltaStr = formatSignedDelta(estimationDelta);
    const note = document.createElement('div');
    note.className = 'tl-bk-note tl-muted';
    const baseText = `${t('breakdownPreflightPrefix')} (${fmtCompact(breakdown.totalTokens)})`;
    note.textContent = deltaStr ? `${baseText} · ${t('breakdownDeltaPrefix')} ${deltaStr}` : baseText;
    pane.appendChild(note);

    if (breakdown.topMessages?.length) {
      pane.appendChild(buildBreakdownGroupCard('top', t('topHotspots'), '', breakdown.topMessages));
    }

    const labelKey = { system: 'groupSystem', tools: 'groupTools', chat: 'groupChat', other: 'groupOther' };
    for (const g of breakdown.groups) {
      if (g.key === 'chat' && breakdown.topMessages?.length) continue;
      pane.appendChild(
        buildBreakdownGroupCard(
          g.key,
          t(labelKey[g.key] || 'groupOther'),
          `${fmtCompact(g.tokens)} (${g.percent.toFixed(1)}%)`,
          g.items || [],
        ),
      );
    }
  }

  function buildBreakdownGroupCard(groupId, title, rightText, items) {
    const box = document.createElement('div');
    box.className = 'tl-bk-group';
    const head = document.createElement('div');
    head.className = 'tl-bk-group-head';
    const l = document.createElement('span');
    l.textContent = title;
    const r = document.createElement('span');
    r.className = 'tl-bk-val';
    r.textContent = rightText;
    head.append(l, r);

    const list = document.createElement('div');
    list.className = 'tl-bk-items';
    const maxDefault = groupId === 'top' ? 10 : 8;
    const isExpanded = state.expandedGroups.has(groupId);
    const visibleItems = isExpanded ? items : items.slice(0, maxDefault);
    const peakPct = items[0]?.percent || 1;

    for (const it of visibleItems) {
      const wrap = document.createElement('div');
      wrap.className = 'tl-bk-item-wrap';
      const row = document.createElement('div');
      row.className = 'tl-bk-item';
      const name = document.createElement('span');
      name.className = `tl-bk-name${it.hasError ? ' is-err' : ''}`;
      const displayLabel = it.label || it.name;
      name.textContent = it.hasError ? `⚠ ${displayLabel}` : displayLabel;
      name.title = it.label && it.label !== it.name ? `${it.label}\n${it.name}` : it.name;
      const val = document.createElement('span');
      val.className = 'tl-bk-val';
      val.textContent = `${fmtCompact(it.tokens)} (${it.percent.toFixed(1)}%)`;
      row.append(name, val);
      wrap.appendChild(row);

      if (groupId === 'top') {
        const track = document.createElement('div');
        track.className = 'tl-bk-mini-track';
        const fill = document.createElement('div');
        fill.className = 'tl-bk-mini-fill';
        fill.style.width = `${Math.min(100, Math.max(4, (it.percent / peakPct) * 100)).toFixed(1)}%`;
        track.appendChild(fill);
        wrap.appendChild(track);
      }
      list.appendChild(wrap);
    }

    box.append(head, list);

    if (items.length > maxDefault) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'tl-bk-toggle';
      toggle.textContent = isExpanded ? t('collapseList') : `${t('expandAll')} (${items.length})`;
      toggle.addEventListener('click', () => {
        if (state.expandedGroups.has(groupId)) state.expandedGroups.delete(groupId);
        else state.expandedGroups.add(groupId);
        if (state.snapshot) renderBreakdownTab(state.snapshot.context?.breakdown);
      });
      box.appendChild(toggle);
    }
    return box;
  }

  function matchesTurnFilter(turn, filter) {
    if (filter === 'rebuilt') return Boolean(turn.cacheRebuilt);
    if (filter === 'slow') return typeof turn.ttftSec === 'number' && turn.ttftSec > 5;
    if (filter === 'retry') return (turn.retryCount || 0) > 0;
    return true;
  }

  function renderTurnsTab(turns) {
    const pane = $('tab-turns');
    pane.replaceChildren();
    if (!turns.length) {
      const msg = document.createElement('div');
      msg.className = 'tl-muted';
      msg.textContent = t('noTurns');
      pane.appendChild(msg);
      return;
    }

    const filterCounts = {
      all: turns.length,
      rebuilt: turns.filter((x) => matchesTurnFilter(x, 'rebuilt')).length,
      slow: turns.filter((x) => matchesTurnFilter(x, 'slow')).length,
      retry: turns.filter((x) => matchesTurnFilter(x, 'retry')).length,
    };

    const filterBar = document.createElement('div');
    filterBar.className = 'tl-filter-bar';
    const filters = [
      { id: 'all', label: `${t('filterAll')} (${filterCounts.all})` },
      { id: 'rebuilt', label: `${t('filterRebuilt')} (${filterCounts.rebuilt})` },
      { id: 'slow', label: `${t('filterSlow')} (${filterCounts.slow})` },
      { id: 'retry', label: `${t('filterRetry')} (${filterCounts.retry})` },
    ];
    for (const f of filters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tl-filter-chip${state.turnFilter === f.id ? ' is-active' : ''}`;
      btn.textContent = f.label;
      btn.addEventListener('click', () => {
        state.turnFilter = f.id;
        renderTurnsTab(state.snapshot?.turns || []);
      });
      filterBar.appendChild(btn);
    }
    pane.appendChild(filterBar);

    const visible = turns.filter((x) => matchesTurnFilter(x, state.turnFilter)).slice(0, 80);
    if (!visible.length) {
      const msg = document.createElement('div');
      msg.className = 'tl-muted';
      msg.textContent = t('noFilteredTurns');
      pane.appendChild(msg);
      return;
    }

    for (const turn of visible) {
      const row = document.createElement('div');
      row.className = 'tl-turn-row';

      const top = document.createElement('div');
      top.className = 'tl-turn-top';
      const left = document.createElement('span');
      left.className = 'tl-turn-id';
      left.textContent = `${t('stepPrefix')}${turn.stepIndex} · ${turn.model}`;

      const right = document.createElement('span');
      right.className = 'tl-turn-tags';
      if (turn.retryCount > 0) {
        const tag = document.createElement('span');
        tag.className = 'tl-err-tag';
        tag.textContent = `${t('retryTag')} ×${turn.retryCount}`;
        right.appendChild(tag);
      }
      if (turn.isShortSample) {
        const tag = document.createElement('span');
        tag.className = 'tl-muted-tag';
        tag.textContent = t('shortSampleTag');
        right.appendChild(tag);
      }
      if (turn.cacheRebuilt) {
        const tag = document.createElement('span');
        tag.className = 'tl-warn-tag';
        tag.textContent = t('turnRebuilt');
        right.appendChild(tag);
      }
      if (!turn.cacheRebuilt && !(turn.retryCount > 0)) {
        const timeEl = document.createElement('span');
        timeEl.className = 'tl-muted';
        timeEl.textContent = turn.createdAt ? new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        right.appendChild(timeEl);
      }
      top.append(left, right);

      const stats = document.createElement('div');
      stats.className = 'tl-turn-stats';
      const outDetail =
        turn.thinkingTokens > 0
          ? `${fmtCompact(turn.outputTokens)} (${t('thinkingLabel')} ${fmtCompact(turn.thinkingTokens)} + ${t('responseLabel')} ${fmtCompact(turn.responseTokens)})`
          : fmtCompact(turn.outputTokens);

      const timingText =
        turn.estimatedSpeed && turn.ttftSec === null
          ? `${t('turnElapsedLabel')} ${fmtSec(turn.streamingSec)}`
          : `TTFT ${fmtSec(turn.ttftSec)} / ${fmtSec(turn.streamingSec)}`;

      stats.innerHTML = [
        `<span>⚡ ${fmtRate(turn.streamingTps, turn.estimatedSpeed)} tok/s</span>`,
        `<span>⏱ ${timingText}</span>`,
        `<span>🧊 ${fmtPct(turn.cacheHitRate)}</span>`,
        `<span>In ${fmtCompact(turn.inputTokens)} · Cache ${fmtCompact(turn.cacheReadTokens)} · Out ${escHtml(outDetail)}</span>`,
      ].join('');

      row.append(top, stats);

      if (Array.isArray(turn.tools) && turn.tools.length > 0) {
        const toolWrap = document.createElement('div');
        toolWrap.className = 'tl-turn-tools';
        for (const tl of turn.tools) {
          const pill = document.createElement('span');
          pill.className = `tl-tool-pill${tl.hasError ? ' is-err' : ''}`;
          pill.textContent = `${tl.name}${tl.count > 1 ? ` ×${tl.count}` : ''}${tl.hasError ? ' ⚠' : ''}`;
          toolWrap.appendChild(pill);
        }
        row.appendChild(toolWrap);
      }

      pane.appendChild(row);
    }
  }

  function renderDiagnosticsTab(snap) {
    const pane = $('tab-diagnostics');
    pane.replaceChildren();
    const tm = snap.timing || {};
    const diag = snap.diagnostics || {};
    const retry = diag.retry || {};
    const budgets = diag.budgets || {};
    const tools = Array.isArray(diag.tools) ? diag.tools : [];

    // 1. 延迟与重试概览
    const grid = document.createElement('div');
    grid.className = 'tl-diag-grid';

    const cardLat = document.createElement('div');
    cardLat.className = 'tl-diag-stat';
    cardLat.innerHTML = `<span class="tl-diag-label">${escHtml(t('diagAvgTtft'))}</span><span class="tl-diag-val">${escHtml(fmtSec(tm.avgTtftSec))} / ${escHtml(fmtSec(tm.p95TtftSec))}</span><span class="tl-diag-sub">${escHtml(t('timingWait'))} ${escHtml(fmtSec(tm.totalTtftSec))} · ${escHtml(t('timingStream'))} ${escHtml(fmtSec(tm.totalStreamingSec))}</span>`;

    const cardRetry = document.createElement('div');
    cardRetry.className = 'tl-diag-stat';
    cardRetry.innerHTML = `<span class="tl-diag-label">${escHtml(t('diagRetryCost'))}</span><span class="tl-diag-val">${retry.count || 0} / ${escHtml(fmtCompact(retry.totalTokens || 0))}</span><span class="tl-diag-sub">${escHtml(t('timingTool'))} ${escHtml(fmtSec(tm.totalToolSec))}</span>`;

    grid.append(cardLat, cardRetry);
    pane.appendChild(grid);

    // 2. 规则与定制预算水位
    const budgetCap = budgets.rulesTokenBudget || budgets.customizationTokenBudget;
    if (budgetCap > 0 && budgets.customUsedTokens > 0) {
      const bCard = document.createElement('div');
      bCard.className = 'tl-bk-group';
      const pct = Math.min(100, (budgets.customUsedTokens / budgetCap) * 100);
      const head = document.createElement('div');
      head.className = 'tl-bk-group-head';
      const l = document.createElement('span');
      l.textContent = t('diagBudgetTitle');
      const r = document.createElement('span');
      r.className = 'tl-bk-val';
      r.textContent = `${fmtCompact(budgets.customUsedTokens)} / ${fmtCompact(budgetCap)} (${pct.toFixed(1)}%)`;
      head.append(l, r);

      const sub = document.createElement('div');
      sub.className = 'tl-diag-sub';
      sub.textContent = t('diagCustomUsed');

      const track = document.createElement('div');
      track.className = 'tl-progress-track';
      track.style.height = '5px';
      track.style.marginTop = '5px';
      const fill = document.createElement('div');
      fill.className = `tl-progress-fill${pct >= 85 ? ' is-crit' : pct >= 70 ? ' is-warn' : ''}`;
      fill.style.width = `${pct.toFixed(1)}%`;
      track.appendChild(fill);
      bCard.append(head, sub, track);
      pane.appendChild(bCard);
    }

    // 3. 工具消耗排行榜
    const tCard = document.createElement('div');
    tCard.className = 'tl-bk-group';
    const tHead = document.createElement('div');
    tHead.className = 'tl-bk-group-head';
    const tl = document.createElement('span');
    tl.textContent = t('diagToolsTitle');
    const tr = document.createElement('span');
    tr.className = 'tl-bk-val';
    tr.textContent = `${tools.length}`;
    tHead.append(tl, tr);
    tCard.appendChild(tHead);

    if (!tools.length) {
      const empty = document.createElement('div');
      empty.className = 'tl-muted';
      empty.textContent = t('noToolsUsed');
      tCard.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'tl-bk-items';
      for (const item of tools.slice(0, 15)) {
        const row = document.createElement('div');
        row.className = 'tl-bk-item';
        const left = document.createElement('span');
        left.className = `tl-bk-name${item.errorCount > 0 ? ' is-err' : ''}`;
        const errPart = item.errorCount > 0 ? ` · ${t('diagErrCount')} ${item.errorCount}` : '';
        left.textContent = `${item.name} (${item.count} ${t('diagToolMeta')}${errPart})`;
        const right = document.createElement('span');
        right.className = 'tl-bk-val';
        const durPart = item.totalDurationSec > 0 ? `${fmtSec(item.totalDurationSec)} · ` : '';
        right.textContent = `${durPart}${fmtCompact(item.contextTokens)} tok`;
        row.append(left, right);
        list.appendChild(row);
      }
      tCard.appendChild(list);
    }
    pane.appendChild(tCard);

    // 4. 一键导出 JSON 快照
    const actions = document.createElement('div');
    actions.className = 'tl-diag-actions';
    const btnJson = document.createElement('button');
    btnJson.type = 'button';
    btnJson.className = 'tl-btn tl-btn-ghost';
    btnJson.textContent = t('exportJson');
    btnJson.addEventListener('click', () => {
      void copyText(JSON.stringify(snap, null, 2), btnJson);
    });
    actions.appendChild(btnJson);
    pane.appendChild(actions);
  }

  function renderSubagentsTab(subagents) {
    const pane = $('tab-subagents');
    pane.replaceChildren();
    if (!subagents.length) {
      const msg = document.createElement('div');
      msg.className = 'tl-muted';
      msg.textContent = t('noSubagents');
      pane.appendChild(msg);
      return;
    }

    for (const sub of subagents) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tl-subagent-card';
      card.addEventListener('click', () => switchConversation(sub.id));

      const head = document.createElement('div');
      head.className = 'tl-sub-head';
      const role = document.createElement('span');
      role.className = 'tl-sub-role';
      role.textContent = `${sub.role || sub.id.slice(0, 8)} (${sub.typeName})`;

      const inspect = document.createElement('span');
      inspect.className = 'tl-muted';
      inspect.textContent = t('clickInspect');
      head.append(role, inspect);

      const row1 = document.createElement('div');
      row1.className = 'tl-sub-meta-row';
      const ctxStr = `${fmtCompact(sub.contextUsed)} / ${fmtCompact(sub.contextMax)} (${fmtPct(sub.contextPercent, true)})`;
      const totStr = `${fmtCompact(sub.totalTokens)} tok · 🧊 ${fmtPct(sub.cacheHitRate)}`;
      const s1 = document.createElement('span');
      s1.textContent = ctxStr;
      const s2 = document.createElement('span');
      s2.textContent = totStr;
      row1.append(s1, s2);

      const barWrap = document.createElement('div');
      barWrap.className = 'tl-progress-track';
      barWrap.style.height = '5px';
      const fill = document.createElement('div');
      fill.className = 'tl-progress-fill';
      fill.style.width = `${sub.contextPercent !== null ? Math.min(100, sub.contextPercent).toFixed(1) : 0}%`;
      barWrap.appendChild(fill);

      card.append(head, row1, barWrap);
      pane.appendChild(card);
    }
  }

  function switchConversation(nextId) {
    if (!nextId || nextId === state.focusedConversationId) return;
    state.focusedConversationId = nextId;
    state.etag = null;
    state.turnFilter = 'all';
    state.expandedGroups.clear();
    void refreshSnapshot(true);
  }

  function openSettingsDrawer() {
    const snap = state.snapshot;
    const prefs = snap?.preferences || {};
    const c = snap?.conversation || {};
    const overrides = prefs.contextLimitOverrides || {};
    const currentLimit = overrides[c.id] ?? (c.modelKey ? overrides[c.modelKey] : undefined) ?? overrides[c.model] ?? '';
    $('input-max-tokens').value = currentLimit ? String(currentLimit) : '';
    $('input-warn-at').value = String(prefs.warnAt ?? 70);
    $('input-crit-at').value = String(prefs.criticalAt ?? 85);
    $('settings-drawer').classList.remove('hidden');
  }

  async function saveSettings() {
    const c = state.snapshot?.conversation || {};
    const key = c.modelKey || c.id;
    const rawLimit = $('input-max-tokens').value.trim();
    const warnAt = Number($('input-warn-at').value);
    const criticalAt = Number($('input-crit-at').value);

    const payload = { warnAt, criticalAt };
    if (key) {
      payload.contextLimitOverrides = {
        [key]: rawLimit ? Number(rawLimit) : null,
      };
    }

    const res = await apiFetch('/api/preferences', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      $('settings-drawer').classList.add('hidden');
      state.etag = null;
      await refreshSnapshot(true);
    }
  }

  async function toggleLanguage() {
    const nextLang = state.lang === 'zh-CN' ? 'en' : 'zh-CN';
    state.lang = nextLang;
    localizeStaticUi();
    await apiFetch('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({ lang: nextLang }),
    }).catch(() => {});
    state.etag = null;
    void refreshSnapshot(true);
  }

  function bindEvents() {
    $('btn-lang').addEventListener('click', () => void toggleLanguage());
    $('btn-refresh').addEventListener('click', () => {
      void refreshSnapshot(true);
    });
    $('btn-copy-summary').addEventListener('click', () => {
      void copyText(state.snapshot?.markdownSummary || '', $('btn-copy-summary'));
    });
    $('btn-copy-compact').addEventListener('click', () => {
      void copyText('/compact', $('btn-copy-compact'));
    });
    $('btn-back-parent').addEventListener('click', () => {
      const target = $('btn-back-parent').dataset.targetId || state.rootConversationId;
      switchConversation(target);
    });
    $('btn-toggle-chart').addEventListener('click', () => {
      state.chartMode = state.chartMode === 'streaming' ? 'ttft' : 'streaming';
      if (state.snapshot) {
        renderThroughputCard(
          state.snapshot.throughput || {},
          state.snapshot.estimatedSpeed,
          state.snapshot.source === 'transcript',
        );
      }
    });

    $('btn-settings').addEventListener('click', () => {
      const drawer = $('settings-drawer');
      if (drawer.classList.contains('hidden')) openSettingsDrawer();
      else drawer.classList.add('hidden');
    });
    $('btn-close-settings').addEventListener('click', () => $('settings-drawer').classList.add('hidden'));
    $('btn-reset-limit').addEventListener('click', () => {
      $('input-max-tokens').value = '';
    });
    $('btn-save-settings').addEventListener('click', () => void saveSettings());

    for (const btn of document.querySelectorAll('.tl-chip-btn')) {
      btn.addEventListener('click', () => {
        $('input-max-tokens').value = btn.dataset.limit || '';
      });
    }

    for (const tab of document.querySelectorAll('.tl-tab')) {
      tab.addEventListener('click', () => {
        state.activeTab = tab.dataset.tab;
        for (const el of document.querySelectorAll('.tl-tab')) {
          el.classList.toggle('is-active', el === tab);
        }
        $('tab-breakdown').classList.toggle('hidden', state.activeTab !== 'breakdown');
        $('tab-turns').classList.toggle('hidden', state.activeTab !== 'turns');
        $('tab-subagents').classList.toggle('hidden', state.activeTab !== 'subagents');
        $('tab-diagnostics').classList.toggle('hidden', state.activeTab !== 'diagnostics');
      });
    }

    document.addEventListener('visibilitychange', () => scheduleNextPoll());
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'theme-change') {
        applyTheme(state.snapshot?.hostTheme?.mode);
      }
    });
  }

  function boot() {
    localizeStaticUi();
    applyTheme('system');
    bindEvents();
    void refreshSnapshot(true);
    state.clockTimer = setInterval(() => {
      if (state.snapshot?.conversation?.isRunning) updateRunningTimer();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
