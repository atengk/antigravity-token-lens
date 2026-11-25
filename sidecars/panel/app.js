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
      groupRules: '用户规则 (Rules)',
      groupSkills: '技能 (Skills)',
      groupSubagents: '子代理定义',
      groupPlugins: '扩展插件',
      groupMcp: 'MCP 工具',
      groupTools: '内置工具',
      groupChat: '对话消息',
      groupOther: '其他',
      groupCustomBase: '定制与MCP底座',
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
      tabQuota: '配额用量',
      quotaOffline: '当前处于离线或未连接语言服务状态，仅在线 RPC 模式可查看实时账号配额（已按规则屏蔽历史过期余额）。',
      quotaCurrentGroup: '当前配额组',
      quotaUrgentGroup: '最紧迫组',
      quotaDisabledTag: '不可用',
      quotaWin5h: '5小时限额',
      quotaWinWeekly: '每周限额',
      quotaIdleFull: '满额待激活（首次调用开启计时）',
      quotaResetsIn: '后重置',
      quotaDepleteWarn: '预计重置前耗尽',
      quotaTimeVsUsed: '周期时间',
      quotaUsedLabel: '已耗',
      quotaPacingFast: '消耗偏快',
      quotaPacingSteady: '节奏平稳',
      quotaPacingRelaxed: '余量充裕',
      quotaBurnRateLabel: '实测速率',
      quotaEtaLabel: '预计耗尽',
      quotaSafeReset: '可安全撑到重置',
      quotaCollecting: '观察累计中（待跨度达标后输出速率预测）',
      quotaObservedDrop: '观察期已降',
      quotaCreditsPrompt: 'Prompt 积分',
      quotaCreditsFlow: 'Flow 积分',
      quotaScopeNote: '注：配额消耗为账号级全局实测值（包含并发对话窗口与子代理调用），不同模型按成本比例扣减。',
      quotaOtherModels: '其他套餐限制模型',
      convFilterPlaceholder: '搜索历史会话标题...',
      convBackRoot: '← 回到当前宿主会话',
      convNoMatch: '未找到匹配会话',
      concurrentRunningSuffix: '后台运行中',
      emptyViewStats: '查看日 / 周 / 月 / 年用量统计',
      tabStats: '用量统计',
      statsDay: '日',
      statsWeek: '周',
      statsMonth: '月',
      statsYear: '年',
      statsTotal: '周期总消耗',
      statsTurns: '轮调用',
      statsUncached: '未命中输入',
      statsOutput: '模型输出',
      statsCacheHit: '缓存命中率',
      statsSaved: '命中省下',
      statsByModel: '按模型分布',
      statsTopConvs: 'Top 消耗会话',
      statsWithSubagents: '含 {n} 子代理',
      statsSubagentTag: '子代理',
      statsNoData: '选定周期内暂无 Token 消耗记录。',
      statsLoading: '正在同步本地用量账本...',
      statsScopeNote: '注：统计基于本地持久化全量轨迹账本（涵盖全部主会话与子代理，不含在线重试及缓存写入附加开销）。',
      settingsTabContext: '上下文与阈值',
      settingsTabWatchdog: '可用性巡检与通知',
      wdActivationHint: '提示：重启 Antigravity 后打开一次 Token Lens 面板即可激活后台巡检（切走标签页仍可持续监控）。',
      wdPillWatching: '巡检中',
      wdPillAlert: '巡检告警',
      wdPillPaused: '巡检暂停',
      wdPillUnconfigured: '待配通知',
      wdStatusWatching: '巡检运行中 · 最近心跳 {time}',
      wdStatusPaused: '后台巡检已暂停',
      wdStatusUninit: '巡检待初始化...',
      wdLsDown: 'LS 失联',
      wdActiveIncidents: '{n} 项阻塞告警',
      wdEnabledLabel: '启用后台可用性巡检（失败 / 重试卡死 / 额满 / LS 失联）',
      wdRecoveryLabel: '故障或配额重置恢复后发送 [已恢复] 通知',
      wdRetryCountLabel: '重试触发次数',
      wdRetrySecLabel: '重试超时 (秒)',
      wdStallSecLabel: '静默卡死 (秒)',
      wdCooldownMinLabel: '同故障冷却 (分)',
      wdChannelsTitle: '通知通道 (Webhook)',
      wdAddChannel: '+ 添加通道',
      wdNoChannels: '尚未配置 Webhook 通道，点击右上角“+ 添加通道”接入飞书 / 钉钉 / 企业微信。',
      wdChTypeLabel: '平台类型',
      wdChTypeFeishu: '飞书机器人',
      wdChTypeDingtalk: '钉钉机器人',
      wdChTypeWecom: '企业微信',
      wdChTypeWebhook: '通用 Webhook',
      wdChNameLabel: '通道名称',
      wdChNamePlaceholder: '如：主力飞书群',
      wdChUrlLabel: 'Webhook URL',
      wdChUrlPlaceholderKeep: '留空或保持掩码则沿用已保存 URL',
      wdChSecretLabel: '加签密钥 Secret（可选）',
      wdChSecretPlaceholder: '留空则不加签',
      wdChSecretPlaceholderKeep: '已设置密钥（留空保留原密钥）',
      wdChClearSecret: '清除密钥',
      wdChCancel: '取消',
      wdChTest: '测试',
      wdChEdit: '编辑',
      wdChDelete: '删除',
      wdChTestInline: '测试此通道',
      wdChApply: '确认通道',
      wdTestAll: '测试启用通道',
      wdSave: '保存巡检配置',
      wdDeliveriesTitle: '最近告警与投递流水 (最多 20 条)',
      wdNoDeliveries: '暂无触发告警或测试投递记录。',
      wdMsgSaved: '巡检配置已保存并立即生效。',
      wdMsgSaveFailed: '保存巡检配置失败，请检查输入格式。',
      wdMsgInvalidUrl: '请输入有效的 http:// 或 https:// Webhook 地址。',
      wdMsgTesting: '正在发送测试消息...',
      wdMsgTestOk: '测试消息发送成功！请检查目标群/接收端。',
      wdMsgTestNoChannel: '请先添加并启用至少一个通知通道。',
      wdMsgTestFail: '发送失败：{err}',
      wdKindAlert: '告警',
      wdKindRecovery: '恢复',
      wdKindTest: '测试',
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
      groupRules: 'Rules',
      groupSkills: 'Skills',
      groupSubagents: 'Subagents',
      groupPlugins: 'Plugins',
      groupMcp: 'MCP Tools',
      groupTools: 'Tools',
      groupChat: 'Chat Messages',
      groupOther: 'Other',
      groupCustomBase: 'Custom & MCP Base',
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
      tabQuota: 'Quota',
      quotaOffline: 'Live account quota is only available in Live RPC mode (stale offline balances are hidden by design).',
      quotaCurrentGroup: 'Active Group',
      quotaUrgentGroup: 'Lowest Group',
      quotaDisabledTag: 'Disabled',
      quotaWin5h: '5h Limit',
      quotaWinWeekly: 'Weekly Limit',
      quotaIdleFull: 'Full · starts on first request',
      quotaResetsIn: 'to reset',
      quotaDepleteWarn: 'May deplete before reset',
      quotaTimeVsUsed: 'Elapsed',
      quotaUsedLabel: 'Used',
      quotaPacingFast: 'Burning fast',
      quotaPacingSteady: 'On pace',
      quotaPacingRelaxed: 'Relaxed',
      quotaBurnRateLabel: 'Burn Rate',
      quotaEtaLabel: 'Depletes in',
      quotaSafeReset: 'Lasts past reset',
      quotaCollecting: 'Collecting samples (awaiting stable window)',
      quotaObservedDrop: 'Observed drop',
      quotaCreditsPrompt: 'Prompt Credits',
      quotaCreditsFlow: 'Flow Credits',
      quotaScopeNote: 'Account-wide measured quota (includes concurrent chats & subagents); consumed proportionally to token cost.',
      quotaOtherModels: 'Other tier-gated models',
      convFilterPlaceholder: 'Filter conversations...',
      convBackRoot: '← Return to host focus conversation',
      convNoMatch: 'No matching conversations',
      concurrentRunningSuffix: 'running',
      emptyViewStats: 'View Daily / Weekly / Monthly / Yearly Stats',
      tabStats: 'Usage Stats',
      statsDay: 'Day',
      statsWeek: 'Week',
      statsMonth: 'Month',
      statsYear: 'Year',
      statsTotal: 'Period Total',
      statsTurns: 'turns',
      statsUncached: 'Uncached In',
      statsOutput: 'Output',
      statsCacheHit: 'Cache Hit',
      statsSaved: 'Saved',
      statsByModel: 'By Model',
      statsTopConvs: 'Top Conversations',
      statsWithSubagents: '+{n} subagents',
      statsSubagentTag: 'Subagent',
      statsNoData: 'No token usage recorded for this period.',
      statsLoading: 'Syncing local usage ledger...',
      statsScopeNote: 'Computed from persistent local transcript ledger (includes all main chats & subagents; excludes retry & cache-write overhead).',
      settingsTabContext: 'Context Limits',
      settingsTabWatchdog: 'Availability Alerts',
      wdActivationHint: 'Tip: Open Token Lens once after restarting Antigravity to wake background monitoring (keeps running across tabs).',
      wdPillWatching: 'Watching',
      wdPillAlert: 'Alerting',
      wdPillPaused: 'Paused',
      wdPillUnconfigured: 'No Webhook',
      wdStatusWatching: 'Watching · last check {time}',
      wdStatusPaused: 'Background watchdog paused',
      wdStatusUninit: 'Initializing watchdog...',
      wdLsDown: 'LS Down',
      wdActiveIncidents: '{n} active incidents',
      wdEnabledLabel: 'Enable background watchdog (failures / retries / quota 0% / LS down)',
      wdRecoveryLabel: 'Send [Recovered] message when issue resolves or quota resets',
      wdRetryCountLabel: 'Retry Threshold',
      wdRetrySecLabel: 'Retry Timeout (s)',
      wdStallSecLabel: 'Silent Hang (s)',
      wdCooldownMinLabel: 'Cooldown (min)',
      wdChannelsTitle: 'Alert Channels (Webhook)',
      wdAddChannel: '+ Add Channel',
      wdNoChannels: 'No channels yet. Click "+ Add Channel" to connect Feishu, DingTalk, WeCom, or a Webhook.',
      wdChTypeLabel: 'Platform',
      wdChTypeFeishu: 'Feishu Bot',
      wdChTypeDingtalk: 'DingTalk Bot',
      wdChTypeWecom: 'WeCom Bot',
      wdChTypeWebhook: 'Generic Webhook',
      wdChNameLabel: 'Name',
      wdChNamePlaceholder: 'e.g. Primary Alert Group',
      wdChUrlLabel: 'Webhook URL',
      wdChUrlPlaceholderKeep: 'Leave blank to keep existing saved URL',
      wdChSecretLabel: 'Signing Secret (Optional)',
      wdChSecretPlaceholder: 'Optional HMAC secret',
      wdChSecretPlaceholderKeep: 'Secret saved (leave blank to keep)',
      wdChClearSecret: 'Clear Secret',
      wdChCancel: 'Cancel',
      wdChTest: 'Test',
      wdChEdit: 'Edit',
      wdChDelete: 'Delete',
      wdChTestInline: 'Test Channel',
      wdChApply: 'Apply',
      wdTestAll: 'Test Enabled',
      wdSave: 'Save Watchdog',
      wdDeliveriesTitle: 'Recent Alerts & Deliveries (max 20)',
      wdNoDeliveries: 'No alert or test deliveries recorded yet.',
      wdMsgSaved: 'Watchdog settings saved and applied.',
      wdMsgSaveFailed: 'Failed to save watchdog settings.',
      wdMsgInvalidUrl: 'Please enter a valid http:// or https:// webhook URL.',
      wdMsgTesting: 'Sending test alert...',
      wdMsgTestOk: 'Test message delivered! Check your target group.',
      wdMsgTestNoChannel: 'Add and enable at least one alert channel first.',
      wdMsgTestFail: 'Delivery failed: {err}',
      wdKindAlert: 'Alert',
      wdKindRecovery: 'Recovered',
      wdKindTest: 'Test',
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
    quota: null,
    conversations: null,
    stats: null,
    statsPeriod: 'day',
    statsTargetKey: null,
    convDropdownOpen: false,
    convFilter: '',
    pollTimer: null,
    quotaTimer: null,
    clockTimer: null,
    isFetching: false,
    isQuotaFetching: false,
    isStatsFetching: false,
    pendingQuotaForce: false,
    wasRunning: false,
    emptyQuotaOpen: false,
    emptyStatsOpen: false,
    lastAutoResetRefreshAt: 0,
    lastClockTickSec: 0,
    preferences: null,
    watchdogStatus: null,
    watchdogChannelsDraft: [],
    editingChannelId: null,
    clearSecretDraft: false,
    settingsTab: 'context',
    watchdogTimer: null,
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
    $('btn-settings-tab-context').textContent = t('settingsTabContext');
    $('btn-settings-tab-watchdog').textContent = t('settingsTabWatchdog');
    $('wd-activation-hint').textContent = t('wdActivationHint');
    $('lbl-wd-enabled').textContent = t('wdEnabledLabel');
    $('lbl-wd-recovery').textContent = t('wdRecoveryLabel');
    $('lbl-wd-retry-count').textContent = t('wdRetryCountLabel');
    $('lbl-wd-retry-sec').textContent = t('wdRetrySecLabel');
    $('lbl-wd-stall-sec').textContent = t('wdStallSecLabel');
    $('lbl-wd-cooldown-min').textContent = t('wdCooldownMinLabel');
    $('lbl-wd-channels').textContent = t('wdChannelsTitle');
    $('btn-wd-add-channel').textContent = t('wdAddChannel');
    $('lbl-wd-ch-type').textContent = t('wdChTypeLabel');
    $('lbl-wd-ch-name').textContent = t('wdChNameLabel');
    $('input-wd-ch-name').placeholder = t('wdChNamePlaceholder');
    $('lbl-wd-ch-url').textContent = t('wdChUrlLabel');
    $('lbl-wd-ch-secret').textContent = t('wdChSecretLabel');
    $('btn-wd-ch-clear-secret').textContent = t('wdChClearSecret');
    $('btn-wd-ch-cancel').textContent = t('wdChCancel');
    $('btn-wd-ch-test').textContent = t('wdChTestInline');
    $('btn-wd-ch-apply').textContent = t('wdChApply');
    $('btn-wd-test-all').textContent = t('wdTestAll');
    $('btn-wd-save').textContent = t('wdSave');
    $('lbl-wd-deliveries').textContent = t('wdDeliveriesTitle');

    const chTypeSel = $('input-wd-ch-type');
    if (chTypeSel && chTypeSel.options.length >= 4) {
      chTypeSel.options[0].textContent = t('wdChTypeFeishu');
      chTypeSel.options[1].textContent = t('wdChTypeDingtalk');
      chTypeSel.options[2].textContent = t('wdChTypeWecom');
      chTypeSel.options[3].textContent = t('wdChTypeWebhook');
    }
    $('empty-title').textContent = t('emptyTitle');
    $('empty-desc').textContent = t('emptyDesc');
    $('btn-empty-stats').textContent = t('emptyViewStats');
    $('input-conv-filter').placeholder = t('convFilterPlaceholder');
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
      else if (tab.dataset.tab === 'quota') tab.textContent = t('tabQuota');
      else if (tab.dataset.tab === 'stats') tab.textContent = t('tabStats');
    }
    if (state.quota) renderQuotaUi();
    if (state.conversations) renderConversationsUi();
    if (state.stats) renderStatsUi();
    if (state.watchdogStatus) {
      renderWatchdogPill();
      if (!$('settings-drawer').classList.contains('hidden')) {
        renderWatchdogStatusBox();
        renderWatchdogDeliveries();
      }
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

      if (data.preferences) {
        state.preferences = data.preferences;
      }
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
      const nowRunning = Boolean(data.conversation?.isRunning);
      const finishedTurn = state.wasRunning && !nowRunning;
      state.wasRunning = nowRunning;
      state.snapshot = data;
      renderSnapshot(data);

      // 一轮生成刚结束、强制刷新或切换至离线日志模式时，同步刷新配额状态
      if ((data.source === 'transcript' && state.quota?.available) || finishedTurn || force) {
        void refreshQuota(true);
      }
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

  async function refreshQuota(force = false) {
    if (state.isQuotaFetching) {
      if (force) state.pendingQuotaForce = true;
      return;
    }
    state.isQuotaFetching = true;
    try {
      const params = new URLSearchParams();
      const conv = state.snapshot?.conversation;
      if (conv?.model) params.set('model', conv.model);
      if (conv?.modelKey) params.set('modelKey', conv.modelKey);
      if (force) params.set('force', '1');

      const res = await apiFetch(`/api/quota?${params.toString()}`);
      if (!res.ok) {
        console.warn(`[token-lens] Quota endpoint returned HTTP ${res.status}`);
        state.quota = { available: false, reason: 'http_error' };
        renderQuotaUi();
        return;
      }
      state.quota = await res.json();
      renderQuotaUi();
    } catch (err) {
      console.warn('[token-lens] Quota request failed:', err);
      state.quota = { available: false, reason: 'network_error' };
      renderQuotaUi();
    } finally {
      state.isQuotaFetching = false;
      if (state.pendingQuotaForce) {
        state.pendingQuotaForce = false;
        void refreshQuota(true);
      } else {
        scheduleNextQuotaPoll();
      }
    }
  }

  function scheduleNextQuotaPoll() {
    clearTimeout(state.quotaTimer);
    const hidden = document.visibilityState === 'hidden';
    const delay = hidden ? 60_000 : 20_000;
    state.quotaTimer = setTimeout(() => {
      void refreshQuota(false);
      void refreshConversations();
      void refreshWatchdogStatus();
    }, delay);
  }

  async function refreshConversations() {
    try {
      const params = new URLSearchParams();
      if (state.focusedConversationId) params.set('conversationId', state.focusedConversationId);
      const res = await apiFetch(`/api/conversations?${params.toString()}`);
      if (!res.ok) return;
      state.conversations = await res.json();
      renderConversationsUi();
    } catch {
      // 会话列表刷新失败不影响主指标链路
    }
  }

  function renderConversationsUi() {
    const data = state.conversations;
    const concBtn = $('concurrent-badge');
    const runningOthers = Array.isArray(data?.activeRunningOthers) ? data.activeRunningOthers : [];
    if (runningOthers.length > 0) {
      concBtn.classList.remove('hidden');
      concBtn.replaceChildren();
      const dot = document.createElement('span');
      dot.className = 'tl-live-dot';
      const txt = document.createElement('span');
      txt.textContent = `+${runningOthers.length} ${t('concurrentRunningSuffix')}`;
      concBtn.append(dot, txt);
      concBtn.title = runningOthers.map((r) => r.title).join('\n');
    } else {
      concBtn.classList.add('hidden');
    }

    const listEl = $('conv-list');
    if (!state.convDropdownOpen || !listEl) return;
    listEl.replaceChildren();

    if (state.rootConversationId && state.focusedConversationId !== state.rootConversationId) {
      const backItem = document.createElement('button');
      backItem.type = 'button';
      backItem.className = 'tl-conv-item';
      backItem.textContent = t('convBackRoot');
      backItem.addEventListener('click', () => {
        closeConvDropdown();
        switchConversation(state.rootConversationId);
      });
      listEl.appendChild(backItem);
    }

    const q = state.convFilter.trim().toLowerCase();
    const items = (data?.items || []).filter((it) => !q || String(it.title || '').toLowerCase().includes(q));
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tl-muted';
      empty.style.padding = '6px 8px';
      empty.textContent = t('convNoMatch');
      listEl.appendChild(empty);
      return;
    }

    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSelected = item.id === state.focusedConversationId;
      btn.className = `tl-conv-item${isSelected ? ' is-selected' : ''}`;
      btn.addEventListener('click', () => {
        closeConvDropdown();
        switchConversation(item.id);
      });

      const left = document.createElement('span');
      left.className = 'tl-conv-item-left';
      if (/RUNNING|RETRY/i.test(item.status || '')) {
        const dot = document.createElement('span');
        dot.className = 'tl-live-dot';
        left.appendChild(dot);
      }
      const title = document.createElement('span');
      title.className = 'tl-conv-item-title';
      title.textContent = item.title || item.id.slice(0, 8);
      left.appendChild(title);

      const meta = document.createElement('span');
      meta.className = 'tl-conv-item-meta';
      const subNote = item.subagentCount > 0 ? `+${item.subagentCount} ` : '';
      const timeStr = item.updatedAt
        ? new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      meta.textContent = `${subNote}${timeStr}`;

      btn.append(left, meta);
      listEl.appendChild(btn);
    }
  }

  function closeConvDropdown() {
    state.convDropdownOpen = false;
    $('conv-dropdown').classList.add('hidden');
    $('btn-conv-picker').setAttribute('aria-expanded', 'false');
  }

  async function refreshStats(force = false) {
    if (state.isStatsFetching) return;
    state.isStatsFetching = true;
    renderStatsUi();
    try {
      const params = new URLSearchParams();
      params.set('period', state.statsPeriod || 'day');
      if (state.statsTargetKey) params.set('targetKey', state.statsTargetKey);
      if (force) params.set('force', '1');
      const res = await apiFetch(`/api/stats?${params.toString()}`);
      if (!res.ok) return;
      state.stats = await res.json();
    } catch {
      // 统计接口异常不阻断主面板
    } finally {
      state.isStatsFetching = false;
      renderStatsUi();
    }
  }

  function formatPeriodBarLabel(key, period) {
    if (!key) return '';
    if (period === 'day') return key.slice(5);
    if (period === 'week') return key.slice(5);
    if (period === 'month') return key.slice(2);
    return key;
  }

  function renderStatsTab(container, stats) {
    container.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'tl-stats-pane';

    // 1. 顶部周期切换工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'tl-stats-toolbar';

    const periods = document.createElement('div');
    periods.className = 'tl-stats-periods';
    const periodOpts = [
      { id: 'day', label: t('statsDay') },
      { id: 'week', label: t('statsWeek') },
      { id: 'month', label: t('statsMonth') },
      { id: 'year', label: t('statsYear') },
    ];
    for (const p of periodOpts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tl-filter-chip${state.statsPeriod === p.id ? ' is-active' : ''}`;
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        if (state.statsPeriod === p.id) return;
        state.statsPeriod = p.id;
        state.statsTargetKey = null;
        void refreshStats(false);
      });
      periods.appendChild(btn);
    }

    const controls = document.createElement('div');
    controls.className = 'tl-stats-controls';
    if (stats?.availableKeys?.length) {
      const sel = document.createElement('select');
      sel.className = 'tl-stats-select';
      for (const k of stats.availableKeys) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        opt.selected = k === stats.selectedKey;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        state.statsTargetKey = sel.value || null;
        void refreshStats(false);
      });
      controls.appendChild(sel);
    }
    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.className = 'tl-btn tl-btn-mini';
    reloadBtn.textContent = '↻';
    reloadBtn.addEventListener('click', () => void refreshStats(true));
    controls.appendChild(reloadBtn);

    toolbar.append(periods, controls);
    wrap.appendChild(toolbar);

    if (!stats && state.isStatsFetching) {
      const loading = document.createElement('div');
      loading.className = 'tl-muted';
      loading.textContent = t('statsLoading');
      wrap.appendChild(loading);
      container.appendChild(wrap);
      return;
    }

    if (!stats) {
      container.appendChild(wrap);
      return;
    }

    // 2. 周期汇总 3 格卡片
    const sel = stats.selected || {};
    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'tl-totals-grid';
    summaryGrid.innerHTML = [
      `<div class="tl-total-cell"><span class="tl-cell-label">${escHtml(t('statsTotal'))}</span><span class="tl-cell-num tl-num-accent">${escHtml(fmtCompact(sel.totalTokens))}</span><span class="tl-diag-sub">${escHtml(fmtInt(sel.turns))} ${escHtml(t('statsTurns'))}</span></div>`,
      `<div class="tl-total-cell"><span class="tl-cell-label">${escHtml(t('statsUncached'))} / ${escHtml(t('statsOutput'))}</span><span class="tl-cell-num">${escHtml(fmtCompact(sel.uncachedInput))}</span><span class="tl-diag-sub">${escHtml(t('statsOutput'))} ${escHtml(fmtCompact(sel.output))}</span></div>`,
      `<div class="tl-total-cell"><span class="tl-cell-label">${escHtml(t('statsCacheHit'))}</span><span class="tl-cell-num">${escHtml(fmtPct(sel.cacheHitRate))}</span><span class="tl-diag-sub">${escHtml(t('statsSaved'))} ${escHtml(fmtCompact(sel.cacheRead))}</span></div>`,
    ].join('');
    wrap.appendChild(summaryGrid);

    // 3. 交互式周期柱状图
    const series = Array.isArray(stats.series) ? stats.series : [];
    if (series.length > 0) {
      const chartBox = document.createElement('div');
      chartBox.className = 'tl-stats-chart-box';
      const maxVal = Math.max(...series.map((s) => s.totalTokens || 0), 1);
      const bars = document.createElement('div');
      bars.className = 'tl-stats-bars';

      for (const s of series) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tl-stats-bar-btn${s.key === stats.selectedKey ? ' is-active' : ''}`;
        btn.title = `${s.key}: ${fmtInt(s.totalTokens)} tok (${s.turns} ${t('statsTurns')})`;
        btn.addEventListener('click', () => {
          state.statsTargetKey = s.key;
          void refreshStats(false);
        });

        const pctH = s.totalTokens > 0 ? Math.max(8, (s.totalTokens / maxVal) * 52) : 3;
        const fill = document.createElement('div');
        fill.className = 'tl-stats-bar-fill';
        fill.style.height = `${pctH.toFixed(1)}px`;

        const lbl = document.createElement('span');
        lbl.className = 'tl-stats-bar-lbl';
        lbl.textContent = formatPeriodBarLabel(s.key, stats.period);
        btn.append(fill, lbl);
        bars.appendChild(btn);
      }
      chartBox.appendChild(bars);
      wrap.appendChild(chartBox);
    }

    if ((sel.totalTokens || 0) === 0) {
      const empty = document.createElement('div');
      empty.className = 'tl-muted';
      empty.textContent = t('statsNoData');
      wrap.appendChild(empty);
    } else {
      // 4. 分模型排行 + Top 会话榜单
      const grid2 = document.createElement('div');
      grid2.className = 'tl-stats-grid-2';

      const mCard = document.createElement('div');
      mCard.className = 'tl-bk-group';
      const mHead = document.createElement('div');
      mHead.className = 'tl-bk-group-head';
      mHead.textContent = t('statsByModel');
      mCard.appendChild(mHead);

      const mList = document.createElement('div');
      mList.className = 'tl-bk-items';
      for (const m of (stats.byModel || []).slice(0, 10)) {
        const itemWrap = document.createElement('div');
        itemWrap.className = 'tl-bk-item-wrap';
        const row = document.createElement('div');
        row.className = 'tl-bk-item';
        const left = document.createElement('span');
        left.className = 'tl-bk-name';
        left.textContent = m.model;
        const right = document.createElement('span');
        right.className = 'tl-bk-val';
        right.textContent = `${fmtCompact(m.totalTokens)} (${m.sharePct.toFixed(0)}%)`;
        row.append(left, right);

        const track = document.createElement('div');
        track.className = 'tl-bk-mini-track';
        const fill = document.createElement('div');
        fill.className = 'tl-bk-mini-fill';
        fill.style.width = `${Math.min(100, Math.max(4, m.sharePct)).toFixed(1)}%`;
        track.appendChild(fill);
        itemWrap.append(row, track);
        mList.appendChild(itemWrap);
      }
      mCard.appendChild(mList);

      const cCard = document.createElement('div');
      cCard.className = 'tl-bk-group';
      const cHead = document.createElement('div');
      cHead.className = 'tl-bk-group-head';
      cHead.textContent = t('statsTopConvs');
      cCard.appendChild(cHead);

      const cList = document.createElement('div');
      cList.className = 'tl-bk-items';
      for (const c of (stats.topConversations || []).slice(0, 10)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tl-stats-conv-btn';
        btn.addEventListener('click', () => {
          state.emptyStatsOpen = false;
          switchConversation(c.id);
        });

        const left = document.createElement('span');
        left.className = 'tl-bk-name';
        const subBadge = c.subagentCount > 0
          ? ` (${t('statsWithSubagents').replace('{n}', String(c.subagentCount))})`
          : c.isSubagent
            ? ` (${t('statsSubagentTag')})`
            : '';
        left.textContent = `${c.title}${subBadge}`;
        left.title = c.title;

        const right = document.createElement('span');
        right.className = 'tl-bk-val';
        right.textContent = `${fmtCompact(c.totalTokens)} · ${fmtPct(c.cacheHitRate)}`;
        btn.append(left, right);
        cList.appendChild(btn);
      }
      cCard.appendChild(cList);

      grid2.append(mCard, cCard);
      wrap.appendChild(grid2);
    }

    const note = document.createElement('div');
    note.className = 'tl-quota-footnote';
    note.textContent = t('statsScopeNote');
    wrap.appendChild(note);

    container.appendChild(wrap);
  }

  function renderStatsUi() {
    renderStatsTab($('tab-stats'), state.stats);
    const isEmptyView = !$('empty-state').classList.contains('hidden');
    const standalone = $('empty-stats-card');
    if (isEmptyView && state.emptyStatsOpen) {
      standalone.classList.remove('hidden');
      renderStatsTab(standalone, state.stats);
    } else {
      standalone.classList.add('hidden');
    }
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
      renderQuotaUi();
      return;
    }

    $('empty-state').classList.add('hidden');
    $('empty-quota-card').classList.add('hidden');
    $('empty-stats-card').classList.add('hidden');
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
    renderQuotaUi();
  }

  function formatCountdownShort(sec) {
    if (typeof sec !== 'number' || !Number.isFinite(sec)) return '—';
    const total = Math.max(0, Math.round(sec));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${total}s`;
  }

  function computeLiveResetSec(bucket) {
    if (bucket.isIdleFull || !bucket.resetTime) return null;
    const targetMs = Date.parse(bucket.resetTime);
    if (!Number.isFinite(targetMs)) return bucket.resetsInSec;
    return Math.max(0, (targetMs - Date.now()) / 1000);
  }

  function formatResetLabel(bucket) {
    if (bucket.isIdleFull) return t('quotaIdleFull');
    const sec = computeLiveResetSec(bucket);
    if (sec === null) return '—';
    return `${formatCountdownShort(sec)} ${t('quotaResetsIn')}`;
  }

  function formatWindowTitle(bucket) {
    if (bucket.window === '5h') return t('quotaWin5h');
    if (bucket.window === 'weekly') return t('quotaWinWeekly');
    return bucket.displayName || bucket.bucketId;
  }

  function renderQuotaSparkline(container, series, alertLevel) {
    container.replaceChildren();
    if (!Array.isArray(series) || series.length < 2) return;
    const width = 160;
    const height = 22;
    const pad = 2;
    const minTs = series[0].ts;
    const maxTs = Math.max(series.at(-1).ts, minTs + 1);
    const pts = series.map((pt) => {
      const x = pad + ((pt.ts - minTs) / (maxTs - minTs)) * (width - pad * 2);
      const pct = Math.min(100, Math.max(0, pt.remainingPct));
      const y = pad + (1 - pct / 100) * (height - pad * 2);
      return { x, y, pt };
    });

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    const stroke =
      alertLevel === 'critical'
        ? 'var(--tl-error)'
        : alertLevel === 'warn'
          ? 'var(--tl-warn)'
          : 'var(--tl-success)';

    const poly = document.createElementNS(svgNS, 'polyline');
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', stroke);
    poly.setAttribute('stroke-width', '1.6');
    poly.setAttribute('stroke-linejoin', 'round');
    poly.setAttribute('stroke-linecap', 'round');
    poly.setAttribute('points', pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
    svg.appendChild(poly);

    const last = pts.at(-1);
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', last.x.toFixed(1));
    dot.setAttribute('cy', last.y.toFixed(1));
    dot.setAttribute('r', '2.3');
    dot.setAttribute('fill', stroke);
    svg.appendChild(dot);

    container.appendChild(svg);
  }

  function renderQuotaStrip(quota, isOfflineTranscript) {
    const strip = $('quota-strip');
    if (!quota || !quota.available || isOfflineTranscript || !Array.isArray(quota.groups) || !quota.groups.length) {
      strip.classList.add('hidden');
      return;
    }

    const activeGroup = quota.groups.find((g) => g.isActive) || quota.groups[0];
    strip.classList.remove('hidden');
    strip.classList.toggle('is-warn', activeGroup.alertLevel === 'warn');
    strip.classList.toggle('is-critical', activeGroup.alertLevel === 'critical');

    $('quota-strip-group').textContent = activeGroup.displayName;
    $('quota-strip-badge').textContent = quota.activeMatchKind === 'model' ? t('quotaCurrentGroup') : t('quotaUrgentGroup');

    const tierEl = $('quota-strip-tier');
    const tierName = quota.tier?.name || quota.credits?.planName;
    if (tierName) {
      tierEl.classList.remove('hidden');
      tierEl.textContent = tierName;
    } else {
      tierEl.classList.add('hidden');
    }

    const hasDepleteRisk = activeGroup.buckets.some((b) => b.willDepleteBeforeReset);
    const riskEl = $('quota-strip-alert');
    if (hasDepleteRisk || activeGroup.alertLevel === 'critical') {
      riskEl.classList.remove('hidden');
      riskEl.classList.toggle('is-critical', activeGroup.alertLevel === 'critical');
      riskEl.textContent = `⚠ ${t('quotaDepleteWarn')}`;
    } else {
      riskEl.classList.add('hidden');
    }

    const bucketsWrap = $('quota-strip-buckets');
    bucketsWrap.replaceChildren();
    for (const b of activeGroup.buckets) {
      const pill = document.createElement('div');
      pill.className = 'tl-qstrip-pill';

      const left = document.createElement('span');
      left.className = 'tl-qstrip-win';
      left.textContent = b.window === 'weekly' ? 'Weekly' : b.window === '5h' ? '5h' : b.displayName;

      const right = document.createElement('span');
      const val = document.createElement('span');
      val.className = `tl-qstrip-val is-${b.alertLevel}`;
      val.textContent = b.remainingPct !== null ? `${b.remainingPct.toFixed(1)}%` : '—';

      const reset = document.createElement('span');
      reset.className = 'tl-qstrip-reset';
      reset.dataset.quotaBucketId = b.bucketId;
      reset.textContent = b.isIdleFull
        ? ` · ${state.lang === 'zh-CN' ? '待激活' : 'Idle'}`
        : ` · ${formatCountdownShort(computeLiveResetSec(b))}`;

      right.append(val, reset);
      pill.append(left, right);
      bucketsWrap.appendChild(pill);
    }
  }

  function renderQuotaAccountBar(quota) {
    if (!quota.tier?.name && !quota.credits) return null;
    const bar = document.createElement('div');
    bar.className = 'tl-quota-account-bar';
    const tierBadge = document.createElement('span');
    tierBadge.className = 'tl-quota-tier-badge';
    tierBadge.textContent = quota.tier?.name || quota.credits?.planName || 'Antigravity';

    const credits = document.createElement('div');
    credits.className = 'tl-quota-credits';
    if (quota.credits?.promptAvailable !== null && quota.credits?.promptAvailable !== undefined) {
      const p = document.createElement('span');
      const cap = quota.credits.promptMonthly ? `/${fmtCompact(quota.credits.promptMonthly)}` : '';
      p.textContent = `${t('quotaCreditsPrompt')}: ${fmtInt(quota.credits.promptAvailable)}${cap}`;
      credits.appendChild(p);
    }
    if (quota.credits?.flowAvailable !== null && quota.credits?.flowAvailable !== undefined) {
      const f = document.createElement('span');
      const cap = quota.credits.flowMonthly ? `/${fmtCompact(quota.credits.flowMonthly)}` : '';
      f.textContent = `${t('quotaCreditsFlow')}: ${fmtInt(quota.credits.flowAvailable)}${cap}`;
      credits.appendChild(f);
    }
    bar.append(tierBadge, credits);
    return bar;
  }

  function renderQuotaBucketRow(b) {
    const row = document.createElement('div');
    row.className = 'tl-quota-bucket-row';

    const ringWrap = document.createElement('div');
    ringWrap.className = 'tl-quota-ring-wrap';
    const r = 20;
    const c = 2 * Math.PI * r;
    const pct = b.remainingPct !== null ? Math.min(100, Math.max(0, b.remainingPct)) : 0;
    const offset = c * (1 - pct / 100);
    ringWrap.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="tl-quota-ring-track" cx="24" cy="24" r="${r}"/><circle class="tl-quota-ring-fill is-${escHtml(b.alertLevel)}" cx="24" cy="24" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/></svg><span class="tl-quota-ring-text">${b.remainingPct !== null ? `${b.remainingPct.toFixed(0)}%` : '—'}</span>`;

    const body = document.createElement('div');
    body.className = 'tl-quota-bucket-body';

    const top = document.createElement('div');
    top.className = 'tl-quota-bucket-top';
    const bName = document.createElement('span');
    bName.className = 'tl-quota-bucket-name';
    bName.textContent = `${formatWindowTitle(b)} · ${b.remainingPct !== null ? `${b.remainingPct.toFixed(1)}%` : '—'}`;
    const bReset = document.createElement('span');
    bReset.className = 'tl-quota-bucket-meta';
    bReset.dataset.quotaBucketDetailId = b.bucketId;
    bReset.textContent = formatResetLabel(b);
    top.append(bName, bReset);
    body.appendChild(top);

    if (!b.isIdleFull && b.timeElapsedPct !== null && b.usedPct !== null) {
      const paceWrap = document.createElement('div');
      paceWrap.className = 'tl-pacing-wrap';
      const paceLabel = document.createElement('div');
      paceLabel.className = 'tl-quota-bucket-meta';
      const paceKey = b.pacingStatus === 'fast' ? 'quotaPacingFast' : b.pacingStatus === 'relaxed' ? 'quotaPacingRelaxed' : 'quotaPacingSteady';
      paceLabel.textContent = `${t('quotaTimeVsUsed')} ${b.timeElapsedPct.toFixed(0)}% vs ${t('quotaUsedLabel')} ${b.usedPct.toFixed(1)}% · ${t(paceKey)}`;

      const bars = document.createElement('div');
      bars.className = 'tl-pacing-bars';
      bars.innerHTML = `<div class="tl-pacing-track"><div class="tl-pacing-fill-time" style="width:${Math.min(100, b.timeElapsedPct).toFixed(1)}%"></div></div><div class="tl-pacing-track"><div class="tl-pacing-fill-used is-${escHtml(b.alertLevel)}" style="width:${Math.min(100, b.usedPct).toFixed(1)}%"></div></div>`;
      paceWrap.append(paceLabel, bars);
      body.appendChild(paceWrap);
    }

    const burnEl = document.createElement('div');
    burnEl.className = `tl-quota-burn-line${b.burnStatus === 'danger' || b.burnStatus === 'depleted' ? ' is-danger' : ''}`;
    if (b.burnStatus === 'danger') {
      burnEl.textContent = `⚠ ${t('quotaBurnRateLabel')} ${b.burnRatePctPerHour.toFixed(1)}%/h · ${t('quotaEtaLabel')} ${formatCountdownShort(b.etaDepletionSec)} (${t('quotaDepleteWarn')})`;
    } else if (b.burnStatus === 'safe') {
      burnEl.textContent = `⚡ ${t('quotaBurnRateLabel')} ${b.burnRatePctPerHour.toFixed(1)}%/h · ${t('quotaSafeReset')}`;
    } else if (b.burnStatus === 'collecting') {
      const dropNote = b.observedDropPct > 0 ? ` (${t('quotaObservedDrop')} -${b.observedDropPct.toFixed(2)}%)` : '';
      burnEl.textContent = `${t('quotaCollecting')}${dropNote}`;
    } else if (b.burnStatus === 'depleted') {
      burnEl.textContent = `⚠ ${t('quotaDepleteWarn')}`;
    }
    if (burnEl.textContent) body.appendChild(burnEl);

    if (!b.isIdleFull && Array.isArray(b.series) && b.series.length >= 2) {
      const pcts = b.series.map((pt) => pt.remainingPct);
      const hasChange = Math.max(...pcts) - Math.min(...pcts) >= 0.05;
      if (hasChange) {
        const spark = document.createElement('div');
        spark.className = 'tl-quota-sparkline';
        renderQuotaSparkline(spark, b.series, b.alertLevel);
        body.appendChild(spark);
      }
    }

    row.append(ringWrap, body);
    return row;
  }

  function groupModelsByFamily(models) {
    const byBase = new Map();
    for (const m of models) {
      const display = m.display || m.modelId || m.rawModel || 'Unknown';
      const match = display.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const base = match ? match[1].trim() : display;
      const tier = match ? match[2].trim() : null;
      const key = `${base}|${Boolean(m.disabled)}|${m.tagTitle || ''}`;
      let entry = byBase.get(key);
      if (!entry) {
        entry = {
          base,
          tiers: [],
          displays: [],
          disabled: Boolean(m.disabled),
          tagTitle: m.tagTitle || null,
          tagDescription: m.tagDescription || null,
        };
        byBase.set(key, entry);
      }
      if (tier && !entry.tiers.includes(tier)) entry.tiers.push(tier);
      entry.displays.push(display);
      if (!entry.tagDescription && m.tagDescription) entry.tagDescription = m.tagDescription;
    }
    return [...byBase.values()];
  }

  function buildQuotaModelChip(groupEntry, currentModelName) {
    const chip = document.createElement('span');
    const isCur = Boolean(
      currentModelName &&
      groupEntry.displays.some((d) => d.toLowerCase() === currentModelName.toLowerCase()),
    );
    const label = groupEntry.tiers.length > 1
      ? `${groupEntry.base} (${groupEntry.tiers.join(' / ')})`
      : groupEntry.displays[0];
    chip.className = `tl-quota-model-chip${groupEntry.disabled ? ' is-disabled' : ''}${isCur ? ' is-current' : ''}`;
    chip.textContent = groupEntry.disabled ? `🔒 ${label}` : label;

    const tagText = groupEntry.tagTitle || (groupEntry.disabled ? t('quotaDisabledTag') : null);
    if (tagText) {
      const tag = document.createElement('span');
      tag.className = 'tl-quota-tag';
      tag.textContent = tagText;
      chip.appendChild(tag);
    }
    if (groupEntry.tagDescription) {
      chip.title = groupEntry.tagDescription;
    }
    return chip;
  }

  function renderQuotaModelsSection(models, currentModelName, { titleText = null, includeDisabledNotices = false } = {}) {
    if (!Array.isArray(models) || models.length === 0) return null;
    const box = document.createElement('div');
    box.className = 'tl-quota-models';
    if (titleText) {
      const lbl = document.createElement('div');
      lbl.className = 'tl-quota-bucket-meta';
      lbl.textContent = titleText;
      box.appendChild(lbl);
    }

    const chips = document.createElement('div');
    chips.className = 'tl-quota-model-chips';
    const notices = new Set();

    for (const entry of groupModelsByFamily(models)) {
      chips.appendChild(buildQuotaModelChip(entry, currentModelName));
      if (entry.tagDescription && (/notice|leaving/i.test(entry.tagTitle || '') || (includeDisabledNotices && entry.disabled))) {
        notices.add(entry.tagDescription);
      }
    }
    box.appendChild(chips);

    for (const msg of notices) {
      const n = document.createElement('div');
      n.className = 'tl-quota-notice';
      n.textContent = `ℹ ${msg}`;
      box.appendChild(n);
    }
    return box;
  }

  function renderQuotaTab(container, quota, isOfflineTranscript) {
    container.replaceChildren();
    if (isOfflineTranscript || !quota || !quota.available) {
      const msg = document.createElement('div');
      msg.className = 'tl-muted';
      msg.textContent = t('quotaOffline');
      container.appendChild(msg);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'tl-quota-pane';

    const accountBar = renderQuotaAccountBar(quota);
    if (accountBar) wrap.appendChild(accountBar);

    const grid = document.createElement('div');
    grid.className = 'tl-quota-groups';
    const currentModelName = state.snapshot?.conversation?.model || '';

    for (const group of quota.groups || []) {
      const card = document.createElement('article');
      card.className = `tl-quota-group-card${group.isActive ? ' is-active-group' : ''}`;

      const head = document.createElement('div');
      head.className = 'tl-quota-group-head';
      const title = document.createElement('span');
      title.className = 'tl-quota-group-title';
      title.textContent = group.displayName;
      head.appendChild(title);

      if (group.isActive) {
        const tag = document.createElement('span');
        tag.className = 'tl-quota-tier-badge';
        tag.textContent = quota.activeMatchKind === 'model' ? t('quotaCurrentGroup') : t('quotaUrgentGroup');
        head.appendChild(tag);
      }
      card.appendChild(head);

      for (const b of group.buckets || []) {
        card.appendChild(renderQuotaBucketRow(b));
      }

      const modelsBox = renderQuotaModelsSection(group.models, currentModelName);
      if (modelsBox) card.appendChild(modelsBox);

      grid.appendChild(card);
    }
    wrap.appendChild(grid);

    const otherBox = renderQuotaModelsSection(quota.unmatchedModels, '', {
      titleText: t('quotaOtherModels'),
      includeDisabledNotices: true,
    });
    if (otherBox) wrap.appendChild(otherBox);

    const footnote = document.createElement('div');
    footnote.className = 'tl-quota-footnote';
    footnote.textContent = t('quotaScopeNote');
    wrap.appendChild(footnote);

    container.appendChild(wrap);
  }

  function renderQuotaUi() {
    const isOfflineTranscript = Boolean(state.snapshot && !state.snapshot.empty && !state.snapshot.notFound && state.snapshot.source === 'transcript');
    renderQuotaStrip(state.quota, isOfflineTranscript);
    renderQuotaTab($('tab-quota'), state.quota, isOfflineTranscript);

    const isEmptyView = !$('empty-state').classList.contains('hidden');
    const standalone = $('empty-quota-card');
    if (isEmptyView && state.emptyQuotaOpen && state.quota?.available) {
      standalone.classList.remove('hidden');
      renderQuotaTab(standalone, state.quota, false);
    } else {
      standalone.classList.add('hidden');
    }
  }

  function updateQuotaCountdowns() {
    const quota = state.quota;
    if (!quota || !quota.available || !Array.isArray(quota.groups)) return;
    let shouldAutoRefresh = false;
    const now = Date.now();

    for (const g of quota.groups) {
      for (const b of g.buckets || []) {
        if (b.isIdleFull || !b.resetTime) continue;
        const resetMs = Date.parse(b.resetTime);
        if (!Number.isFinite(resetMs)) continue;
        const sec = Math.max(0, (resetMs - now) / 1000);
        if (sec <= 0 && now - state.lastAutoResetRefreshAt > 10_000) {
          shouldAutoRefresh = true;
        }
        const stripEl = document.querySelector(`[data-quota-bucket-id="${CSS.escape(b.bucketId)}"]`);
        if (stripEl) stripEl.textContent = ` · ${formatCountdownShort(sec)}`;
        const detailEl = document.querySelector(`[data-quota-bucket-detail-id="${CSS.escape(b.bucketId)}"]`);
        if (detailEl) detailEl.textContent = `${formatCountdownShort(sec)} ${t('quotaResetsIn')}`;
      }
    }

    if (shouldAutoRefresh) {
      state.lastAutoResetRefreshAt = now;
      void refreshQuota(true);
    }
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

    const customKeys = new Set(['rules', 'skills', 'subagents', 'plugins', 'mcp']);
    const buckets = {
      system: { key: 'system', color: 'tl-seg-system', label: t('groupSystem'), tokens: 0, percent: 0, details: [] },
      custom: { key: 'custom', color: 'tl-seg-custom', label: t('groupCustomBase'), tokens: 0, percent: 0, details: [] },
      tools: { key: 'tools', color: 'tl-seg-tools', label: t('groupTools'), tokens: 0, percent: 0, details: [] },
      chat: { key: 'chat', color: 'tl-seg-chat', label: t('groupChat'), tokens: 0, percent: 0, details: [] },
      other: { key: 'other', color: 'tl-seg-other', label: t('groupOther'), tokens: 0, percent: 0, details: [] },
    };

    const detailNames = {
      rules: 'Rules',
      skills: 'Skills',
      subagents: 'Subagents',
      plugins: 'Plugins',
      mcp: 'MCP',
    };

    for (const g of breakdown.groups) {
      const targetKey = customKeys.has(g.key) ? 'custom' : buckets[g.key] ? g.key : 'other';
      const slot = buckets[targetKey];
      slot.tokens += g.tokens || 0;
      slot.percent += g.percent || 0;
      if (targetKey === 'custom' && (g.tokens || 0) > 0) {
        slot.details.push(`${detailNames[g.key] || g.name} ${fmtCompact(g.tokens)}`);
      }
    }

    for (const segInfo of [buckets.system, buckets.custom, buckets.tools, buckets.chat, buckets.other]) {
      if (segInfo.tokens <= 0) continue;
      const seg = document.createElement('div');
      seg.className = `tl-seg ${segInfo.color}`;
      seg.style.width = `${Math.max(0.5, segInfo.percent).toFixed(2)}%`;
      if (segInfo.details.length) seg.title = segInfo.details.join(' · ');
      segBar.appendChild(seg);

      const item = document.createElement('span');
      item.className = 'tl-legend-item';
      if (segInfo.details.length) item.title = segInfo.details.join(' · ');
      const dot = document.createElement('span');
      dot.className = `tl-legend-dot ${segInfo.color}`;
      const txt = document.createElement('span');
      txt.textContent = `${segInfo.label} ${fmtCompact(segInfo.tokens)} (${segInfo.percent.toFixed(0)}%)`;
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

    const labelKey = {
      system: 'groupSystem',
      rules: 'groupRules',
      skills: 'groupSkills',
      subagents: 'groupSubagents',
      plugins: 'groupPlugins',
      mcp: 'groupMcp',
      tools: 'groupTools',
      chat: 'groupChat',
      other: 'groupOther',
    };
    for (const g of breakdown.groups) {
      if (g.key === 'chat' && breakdown.topMessages?.length) continue;
      pane.appendChild(
        buildBreakdownGroupCard(
          g.key,
          t(labelKey[g.key] || 'groupOther') || g.name,
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
      const sanitizedSnap = { ...snap };
      if (sanitizedSnap.preferences && typeof sanitizedSnap.preferences === 'object') {
        const { watchdog: _omittedWatchdog, ...restPrefs } = sanitizedSnap.preferences;
        sanitizedSnap.preferences = restPrefs;
      }
      void copyText(JSON.stringify(sanitizedSnap, null, 2), btnJson);
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

  function fmtClockTime(ts) {
    if (!ts) return '--:--:--';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString(state.lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false });
  }

  function channelTypeLabel(type) {
    if (type === 'feishu') return t('wdChTypeFeishu');
    if (type === 'dingtalk') return t('wdChTypeDingtalk');
    if (type === 'wecom') return t('wdChTypeWecom');
    return t('wdChTypeWebhook');
  }

  function showWdFeedback(msg, isOk) {
    const el = $('wd-feedback');
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden', 'is-ok', 'is-err');
    el.classList.add(isOk ? 'is-ok' : 'is-err');
  }

  async function refreshWatchdogStatus() {
    try {
      const res = await apiFetch('/api/watchdog/status');
      if (!res.ok) return;
      state.watchdogStatus = await res.json();
      renderWatchdogPill();
      if (!$('settings-drawer').classList.contains('hidden')) {
        renderWatchdogStatusBox();
        renderWatchdogDeliveries();
      }
    } catch {
      // 巡检状态读取失败不阻塞主面板
    }
  }

  function renderWatchdogPill() {
    const pill = $('watchdog-badge');
    const wd = state.watchdogStatus;
    if (!wd) {
      pill.classList.add('hidden');
      return;
    }
    pill.classList.remove('hidden', 'is-ok', 'is-alert');
    pill.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'tl-dot';
    const txt = document.createElement('span');

    const incCount = Array.isArray(wd.activeIncidents) ? wd.activeIncidents.length : 0;
    if (!wd.enabled) {
      txt.textContent = t('wdPillPaused');
    } else if (incCount > 0 || !wd.lsHealthy) {
      pill.classList.add('is-alert');
      txt.textContent = incCount > 0 ? `${t('wdPillAlert')} (${incCount})` : t('wdLsDown');
    } else if (wd.enabledChannelCount > 0) {
      pill.classList.add('is-ok');
      txt.textContent = t('wdPillWatching');
    } else {
      txt.textContent = t('wdPillUnconfigured');
    }

    pill.append(dot, txt);
    pill.title = wd.lastPollAt
      ? t('wdStatusWatching').replace('{time}', fmtClockTime(wd.lastPollAt))
      : t('wdStatusUninit');
  }

  function renderWatchdogStatusBox() {
    const wd = state.watchdogStatus;
    const sumEl = $('wd-status-summary');
    const incEl = $('wd-active-incidents');
    if (!wd) {
      sumEl.textContent = t('wdStatusUninit');
      incEl.classList.add('hidden');
      return;
    }
    if (!wd.enabled) {
      sumEl.textContent = t('wdStatusPaused');
    } else if (wd.lastPollAt) {
      sumEl.textContent = t('wdStatusWatching').replace('{time}', fmtClockTime(wd.lastPollAt));
    } else {
      sumEl.textContent = t('wdStatusUninit');
    }

    const incCount = Array.isArray(wd.activeIncidents) ? wd.activeIncidents.length : 0;
    if (incCount > 0 || !wd.lsHealthy) {
      incEl.textContent = !wd.lsHealthy ? t('wdLsDown') : t('wdActiveIncidents').replace('{n}', String(incCount));
      incEl.classList.remove('hidden');
    } else {
      incEl.classList.add('hidden');
    }
  }

  function renderWatchdogChannels() {
    const list = $('wd-channel-list');
    list.replaceChildren();
    const channels = state.watchdogChannelsDraft;
    if (!channels.length) {
      const empty = document.createElement('div');
      empty.className = 'tl-muted';
      empty.style.fontSize = '11px';
      empty.textContent = t('wdNoChannels');
      list.appendChild(empty);
      return;
    }

    for (const ch of channels) {
      const row = document.createElement('div');
      row.className = 'tl-wd-ch-row';

      const main = document.createElement('div');
      main.className = 'tl-wd-ch-main';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = ch.enabled !== false;
      toggle.addEventListener('change', () => {
        ch.enabled = toggle.checked;
      });

      const info = document.createElement('div');
      info.className = 'tl-wd-ch-info';
      const title = document.createElement('span');
      title.className = 'tl-wd-ch-title';
      title.textContent = `[${channelTypeLabel(ch.type)}] ${ch.name}`;
      const mask = document.createElement('span');
      mask.className = 'tl-wd-ch-mask';
      const secSuffix = ch.hasSecret || (ch.secret && !ch.clearSecret) ? ' · HMAC' : '';
      mask.textContent = `${ch.urlMask || ch.url || ''}${secSuffix}`;
      info.append(title, mask);
      main.append(toggle, info);

      const actions = document.createElement('div');
      actions.className = 'tl-wd-ch-actions';

      const btnTest = document.createElement('button');
      btnTest.type = 'button';
      btnTest.className = 'tl-btn tl-btn-ghost';
      btnTest.textContent = t('wdChTest');
      btnTest.addEventListener('click', () => void testWatchdogTarget({ channel: ch }));

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'tl-btn tl-btn-ghost';
      btnEdit.textContent = t('wdChEdit');
      btnEdit.addEventListener('click', () => openChannelEditor(ch));

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'tl-btn tl-btn-ghost';
      btnDel.textContent = t('wdChDelete');
      btnDel.addEventListener('click', () => {
        state.watchdogChannelsDraft = state.watchdogChannelsDraft.filter((item) => item.id !== ch.id);
        if (state.editingChannelId === ch.id) closeChannelEditor();
        renderWatchdogChannels();
      });

      actions.append(btnTest, btnEdit, btnDel);
      row.append(main, actions);
      list.appendChild(row);
    }
  }

  function syncChannelEditorSecretVisibility() {
    const type = $('input-wd-ch-type').value;
    const supportsSecret = type === 'feishu' || type === 'dingtalk';
    $('wd-ch-secret-wrap').classList.toggle('hidden', !supportsSecret);
  }

  function openChannelEditor(ch = null) {
    state.editingChannelId = ch?.id || null;
    state.clearSecretDraft = false;
    $('input-wd-ch-type').value = ch?.type || 'feishu';
    $('input-wd-ch-name').value = ch?.name || '';
    $('input-wd-ch-url').value = ch?.url && !String(ch.url).includes('/...***') ? ch.url : '';
    $('input-wd-ch-url').placeholder = ch?.urlMask
      ? t('wdChUrlPlaceholderKeep')
      : 'https://open.feishu.cn/open-apis/bot/v2/hook/...';
    $('input-wd-ch-secret').value = '';
    const hasSecret = Boolean(ch?.hasSecret || (ch?.secret && !ch.clearSecret));
    $('input-wd-ch-secret').placeholder = hasSecret ? t('wdChSecretPlaceholderKeep') : t('wdChSecretPlaceholder');
    $('btn-wd-ch-clear-secret').classList.toggle('hidden', !hasSecret);
    syncChannelEditorSecretVisibility();
    $('wd-channel-editor').classList.remove('hidden');
  }

  function closeChannelEditor() {
    state.editingChannelId = null;
    state.clearSecretDraft = false;
    $('wd-channel-editor').classList.add('hidden');
  }

  function buildChannelFromEditor() {
    const existing = state.editingChannelId
      ? state.watchdogChannelsDraft.find((c) => c.id === state.editingChannelId) || null
      : null;
    const type = $('input-wd-ch-type').value;
    const name = $('input-wd-ch-name').value.trim() || channelTypeLabel(type);
    const rawUrl = $('input-wd-ch-url').value.trim();
    const rawSecret = $('input-wd-ch-secret').value.trim();

    if (!rawUrl && !existing?.urlMask && !existing?.url) {
      showWdFeedback(t('wdMsgInvalidUrl'), false);
      return null;
    }
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
      } catch {
        showWdFeedback(t('wdMsgInvalidUrl'), false);
        return null;
      }
    }

    const next = {
      id: existing?.id || `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      name,
      enabled: existing ? existing.enabled !== false : true,
      url: rawUrl || existing?.url || existing?.urlMask || '',
      urlMask: rawUrl || existing?.urlMask || '',
      hasSecret: state.clearSecretDraft ? false : Boolean(rawSecret || existing?.hasSecret),
      clearSecret: state.clearSecretDraft,
    };
    if (rawSecret) {
      next.secret = rawSecret;
      next.clearSecret = false;
    } else if (existing?.secret && !state.clearSecretDraft) {
      next.secret = existing.secret;
    }
    return next;
  }

  function applyChannelEditor() {
    const draft = buildChannelFromEditor();
    if (!draft) return;
    const idx = state.watchdogChannelsDraft.findIndex((c) => c.id === draft.id);
    if (idx >= 0) state.watchdogChannelsDraft[idx] = draft;
    else state.watchdogChannelsDraft.push(draft);
    closeChannelEditor();
    showWdFeedback('', true);
    renderWatchdogChannels();
  }

  function renderWatchdogDeliveries() {
    const list = $('wd-delivery-list');
    list.replaceChildren();
    const deliveries = state.watchdogStatus?.recentDeliveries || [];
    if (!deliveries.length) {
      const empty = document.createElement('div');
      empty.className = 'tl-muted';
      empty.style.fontSize = '11px';
      empty.textContent = t('wdNoDeliveries');
      list.appendChild(empty);
      return;
    }

    for (const d of deliveries) {
      const row = document.createElement('div');
      row.className = 'tl-wd-del-row';
      const head = document.createElement('div');
      head.className = 'tl-wd-del-head';
      const kindLbl = d.kind === 'recovery' ? t('wdKindRecovery') : d.kind === 'test' ? t('wdKindTest') : t('wdKindAlert');
      const left = document.createElement('span');
      left.textContent = `[${kindLbl}] ${d.title}`;
      const right = document.createElement('span');
      right.className = 'tl-wd-del-meta';
      right.textContent = fmtClockTime(d.ts);
      head.append(left, right);

      const meta = document.createElement('div');
      meta.className = 'tl-wd-del-meta';
      const resParts = (d.channelResults || []).map((r) => `${r.channelName} ${r.ok ? '✓' : `✗ ${r.error || ''}`}`);
      meta.textContent = resParts.length ? resParts.join(' | ') : d.summary;
      row.append(head, meta);
      list.appendChild(row);
    }
  }

  function switchSettingsTab(tab) {
    state.settingsTab = tab === 'watchdog' ? 'watchdog' : 'context';
    $('btn-settings-tab-context').classList.toggle('is-active', state.settingsTab === 'context');
    $('btn-settings-tab-watchdog').classList.toggle('is-active', state.settingsTab === 'watchdog');
    $('settings-pane-context').classList.toggle('hidden', state.settingsTab !== 'context');
    $('settings-pane-watchdog').classList.toggle('hidden', state.settingsTab !== 'watchdog');
  }

  function populateWatchdogForm(prefs) {
    const wd = prefs?.watchdog || {};
    $('input-wd-enabled').checked = wd.enabled !== false;
    $('input-wd-recovery').checked = wd.notifyRecovery !== false;
    $('input-wd-retry-count').value = String(wd.retryThreshold ?? 3);
    $('input-wd-retry-sec').value = String(wd.retryDurationSec ?? 60);
    $('input-wd-stall-sec').value = String(wd.silentStallSec ?? 180);
    $('input-wd-cooldown-min').value = String(wd.cooldownMin ?? 10);
    state.watchdogChannelsDraft = (Array.isArray(wd.channels) ? wd.channels : []).map((c) => ({ ...c }));
    closeChannelEditor();
    showWdFeedback('', true);
    renderWatchdogChannels();
    renderWatchdogStatusBox();
    renderWatchdogDeliveries();
  }

  async function openSettingsDrawer(targetTab = 'context') {
    if (!state.preferences) {
      try {
        const res = await apiFetch('/api/preferences');
        if (res.ok) state.preferences = await res.json();
      } catch {
        // 忽略偏好预拉取失败
      }
    }
    const snap = state.snapshot;
    const prefs = snap?.preferences || state.preferences || {};
    const c = snap?.conversation || {};
    const overrides = prefs.contextLimitOverrides || {};
    const currentLimit = overrides[c.id] ?? (c.modelKey ? overrides[c.modelKey] : undefined) ?? overrides[c.model] ?? '';
    $('input-max-tokens').value = currentLimit ? String(currentLimit) : '';
    $('input-warn-at').value = String(prefs.warnAt ?? 70);
    $('input-crit-at').value = String(prefs.criticalAt ?? 85);
    populateWatchdogForm(prefs);
    switchSettingsTab(targetTab);
    $('settings-drawer').classList.remove('hidden');
    void refreshWatchdogStatus();
  }

  async function saveWatchdogSettings() {
    const payload = {
      watchdog: {
        enabled: $('input-wd-enabled').checked,
        notifyRecovery: $('input-wd-recovery').checked,
        retryThreshold: Number($('input-wd-retry-count').value),
        retryDurationSec: Number($('input-wd-retry-sec').value),
        silentStallSec: Number($('input-wd-stall-sec').value),
        cooldownMin: Number($('input-wd-cooldown-min').value),
        channels: state.watchdogChannelsDraft.map((c) => ({
          id: c.id,
          type: c.type,
          name: c.name,
          enabled: c.enabled !== false,
          url: c.url || c.urlMask || '',
          secret: c.secret || undefined,
          clearSecret: Boolean(c.clearSecret),
        })),
      },
    };
    const res = await apiFetch('/api/preferences', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      showWdFeedback(t('wdMsgSaveFailed'), false);
      return;
    }
    state.preferences = await res.json();
    populateWatchdogForm(state.preferences);
    showWdFeedback(t('wdMsgSaved'), true);
    state.etag = null;
    await refreshWatchdogStatus();
  }

  async function testWatchdogTarget({ channel = null, channelId = null } = {}) {
    showWdFeedback(t('wdMsgTesting'), true);
    try {
      const res = await apiFetch('/api/watchdog/test', {
        method: 'POST',
        body: JSON.stringify({ channelId, channel }),
      });
      const data = await res.json();
      if (data.ok) {
        showWdFeedback(t('wdMsgTestOk'), true);
      } else if (data.error === 'no_channels') {
        showWdFeedback(t('wdMsgTestNoChannel'), false);
      } else {
        showWdFeedback(t('wdMsgTestFail').replace('{err}', data.error || 'Unknown error'), false);
      }
      await refreshWatchdogStatus();
    } catch (err) {
      showWdFeedback(t('wdMsgTestFail').replace('{err}', err?.message || 'Network error'), false);
    }
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
      void refreshQuota(true);
      void refreshConversations();
      if (state.activeTab === 'stats' || state.emptyStatsOpen) {
        void refreshStats(true);
      }
    });
    $('btn-conv-picker').addEventListener('click', () => {
      state.convDropdownOpen = !state.convDropdownOpen;
      $('conv-dropdown').classList.toggle('hidden', !state.convDropdownOpen);
      $('btn-conv-picker').setAttribute('aria-expanded', state.convDropdownOpen ? 'true' : 'false');
      if (state.convDropdownOpen) {
        $('input-conv-filter').focus();
        renderConversationsUi();
        void refreshConversations();
      }
    });
    $('input-conv-filter').addEventListener('input', (e) => {
      state.convFilter = e.target.value || '';
      renderConversationsUi();
    });
    $('concurrent-badge').addEventListener('click', () => {
      const running = state.conversations?.activeRunningOthers || [];
      if (running.length === 1) {
        switchConversation(running[0].id);
      } else if (running.length > 1) {
        state.convDropdownOpen = true;
        $('conv-dropdown').classList.remove('hidden');
        $('btn-conv-picker').setAttribute('aria-expanded', 'true');
        renderConversationsUi();
      }
    });
    document.addEventListener('click', (e) => {
      if (state.convDropdownOpen && !e.target.closest('.tl-conv-picker') && !e.target.closest('#concurrent-badge')) {
        closeConvDropdown();
      }
    });
    $('btn-empty-stats').addEventListener('click', () => {
      state.emptyStatsOpen = !state.emptyStatsOpen;
      if (state.emptyStatsOpen && !state.stats) void refreshStats(false);
      else renderStatsUi();
    });
    $('quota-strip').addEventListener('click', () => {
      const isEmptyView = !$('empty-state').classList.contains('hidden');
      if (isEmptyView) {
        state.emptyQuotaOpen = !state.emptyQuotaOpen;
        renderQuotaUi();
        return;
      }
      const quotaTab = document.querySelector('.tl-tab[data-tab="quota"]');
      if (quotaTab) {
        quotaTab.click();
        quotaTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
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
      if (drawer.classList.contains('hidden')) void openSettingsDrawer('context');
      else drawer.classList.add('hidden');
    });
    $('watchdog-badge').addEventListener('click', () => {
      const drawer = $('settings-drawer');
      if (drawer.classList.contains('hidden') || state.settingsTab !== 'watchdog') {
        void openSettingsDrawer('watchdog');
      } else {
        drawer.classList.add('hidden');
      }
    });
    $('btn-settings-tab-context').addEventListener('click', () => switchSettingsTab('context'));
    $('btn-settings-tab-watchdog').addEventListener('click', () => switchSettingsTab('watchdog'));
    $('btn-close-settings').addEventListener('click', () => $('settings-drawer').classList.add('hidden'));
    $('btn-reset-limit').addEventListener('click', () => {
      $('input-max-tokens').value = '';
    });
    $('btn-save-settings').addEventListener('click', () => void saveSettings());
    $('btn-wd-add-channel').addEventListener('click', () => openChannelEditor(null));
    $('input-wd-ch-type').addEventListener('change', () => syncChannelEditorSecretVisibility());
    $('btn-wd-ch-clear-secret').addEventListener('click', () => {
      state.clearSecretDraft = true;
      $('input-wd-ch-secret').value = '';
      $('input-wd-ch-secret').placeholder = t('wdChSecretPlaceholder');
      $('btn-wd-ch-clear-secret').classList.add('hidden');
    });
    $('btn-wd-ch-cancel').addEventListener('click', () => closeChannelEditor());
    $('btn-wd-ch-apply').addEventListener('click', () => applyChannelEditor());
    $('btn-wd-ch-test').addEventListener('click', () => {
      const draft = buildChannelFromEditor();
      if (draft) void testWatchdogTarget({ channel: draft });
    });
    $('btn-wd-test-all').addEventListener('click', () => void testWatchdogTarget());
    $('btn-wd-save').addEventListener('click', () => void saveWatchdogSettings());

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
        $('tab-quota').classList.toggle('hidden', state.activeTab !== 'quota');
        $('tab-stats').classList.toggle('hidden', state.activeTab !== 'stats');
        if (state.activeTab === 'stats') {
          void refreshStats(false);
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      scheduleNextPoll();
      scheduleNextQuotaPoll();
    });
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
    void refreshQuota(true);
    void refreshConversations();
    void refreshWatchdogStatus();
    state.clockTimer = setInterval(() => {
      if (state.snapshot?.conversation?.isRunning) updateRunningTimer();
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== state.lastClockTickSec) {
        state.lastClockTickSec = sec;
        updateQuotaCountdowns();
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
