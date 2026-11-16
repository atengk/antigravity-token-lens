/**
 * Token Lens Sidecar 主入口，负责兼容加载 sidecar_sdk、编排双源快照服务与挂载 HTTP 路由。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LanguageServerClient, buildSummaryMark } from './ls-client.mjs';
import {
  computeMetricsFromProjection,
  computeMetricsFromTranscript,
  finalizeSnapshot,
} from './metrics.mjs';
import { PreferencesStore, readHostThemeMode, resolvePlatformPaths } from './store.mjs';
import {
  CONVERSATION_ID_RE,
  listLocalConversations,
  readLocalConversation,
} from './transcript.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_SUBAGENT_FANOUT = 16;

const STATIC_ASSETS = {
  '/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', contentType: 'application/javascript; charset=utf-8' },
};

/**
 * 兼容 Windows NODE_PATH 解析规则加载 sidecar_sdk。
 *
 * @return {Promise<{ SidecarApp: Function, Response: Function }>}
 */
export async function loadSidecarSdk() {
  try {
    return await import('sidecar_sdk');
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    const req = createRequire(import.meta.url);
    const resolved = req.resolve('sidecar_sdk');
    return import(pathToFileURL(resolved).href);
  }
}

/**
 * 面板核心数据编排服务，独立于 HTTP 容器便于单元测试与多源切换。
 */
export class PanelService {
  #lsClient;
  #prefs;
  #paths;
  #prefRevision = 1;

  /**
   * @param {object} deps 服务依赖
   * @param {LanguageServerClient} deps.lsClient LS 客户端实例
   * @param {PreferencesStore} deps.prefs 偏好存储实例
   * @param {object} deps.paths 解析后的路径配置
   */
  constructor({ lsClient, prefs, paths }) {
    this.#lsClient = lsClient;
    this.#prefs = prefs;
    this.#paths = paths;
  }

  /**
   * 读取偏好配置。
   *
   * @return {Promise<object>}
   */
  getPreferences() {
    return this.#prefs.load();
  }

  /**
   * 更新偏好配置并刷新 ETag 版本戳。
   *
   * @param {object} patch 待更新偏好字段
   * @return {Promise<object>}
   */
  async updatePreferences(patch) {
    const updated = await this.#prefs.update(patch);
    this.#prefRevision++;
    return updated;
  }

  /**
   * 获取可切换的历史与当前会话列表（主会话为主，附带子代理计数）。
   *
   * @param {string|null} currentId 当前焦点会话 ID
   * @return {Promise<{ currentId: string|null, source: string, items: object[] }>}
   */
  async getConversations(currentId) {
    try {
      const summaries = await this.#lsClient.getSummaries(false);
      const childCount = new Map();

      for (const [id, s] of Object.entries(summaries)) {
        const tm = s?.trajectoryMetadata || {};
        const parent = tm.parentConversationId;
        if (parent && id !== parent) {
          childCount.set(parent, (childCount.get(parent) || 0) + 1);
        }
      }

      const items = [];
      for (const [id, s] of Object.entries(summaries)) {
        const tm = s?.trajectoryMetadata || {};
        // 主列表隐藏派生子代理，除非它正好是当前正在查看的会话
        if (tm.parentConversationId && id !== currentId) continue;

        items.push({
          id,
          title: String(s?.summary || tm?.subagentSpec?.role || id.slice(0, 8)),
          status: String(s?.status || 'IDLE'),
          updatedAt: s?.lastModifiedTime || s?.createdTime || null,
          stepCount: Number(s?.stepCount) || 0,
          subagentCount: childCount.get(id) || 0,
          isSubagent: Boolean(tm.parentConversationId),
          source: 'rpc',
        });
      }

      items.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
      return { currentId: currentId || null, source: 'rpc', items: items.slice(0, 50) };
    } catch {
      const items = await listLocalConversations(this.#paths.appDataCandidates, 50);
      return { currentId: currentId || null, source: 'transcript', items };
    }
  }

  /**
   * 获取目标会话完整或增量 ETag 快照（优先 RPC，自动降级至 transcript.jsonl）。
   *
   * @param {{ conversationId: string|null, etag?: string|null, force?: boolean }} params 查询参数
   * @return {Promise<object>}
   */
  async getSnapshot({ conversationId, etag = null, force = false }) {
    const preferences = await this.#prefs.load();
    const hostTheme = await readHostThemeMode(this.#paths.configFile);

    if (!conversationId || !CONVERSATION_ID_RE.test(conversationId)) {
      return {
        empty: true,
        conversationId: conversationId || null,
        preferences,
        hostTheme,
      };
    }

    try {
      const snapshot = await this.#buildRpcSnapshot(conversationId, preferences, etag, force);
      return { ...snapshot, preferences, hostTheme };
    } catch {
      const local = await readLocalConversation(this.#paths.appDataCandidates, conversationId);
      if (!local) {
        return {
          notFound: true,
          conversationId,
          preferences,
          hostTheme,
        };
      }
      const nextEtag = `tr|${conversationId}|${local.mtimeMs}|${local.size}|${this.#prefRevision}|${hostTheme.mode}`;
      if (!force && etag && etag === nextEtag) {
        return { unchanged: true, etag: nextEtag, conversationId };
      }

      const primary = computeMetricsFromTranscript(conversationId, local, preferences);
      const subIds = this.#collectLocalSubagentIds(local, conversationId);
      const subagentSummaries = await this.#loadLocalSubagents(subIds, preferences);
      const snapshot = finalizeSnapshot(primary, subagentSummaries, { lang: preferences.lang });
      return { ...snapshot, etag: nextEtag, preferences, hostTheme };
    }
  }

  async #buildRpcSnapshot(conversationId, preferences, clientEtag, force) {
    const summaries = await this.#lsClient.getSummaries(force);
    const targetSummary = summaries[conversationId];
    if (!targetSummary) {
      throw new Error('Summary missing for conversation');
    }

    const childEntries = Object.entries(summaries)
      .filter(([id, s]) => {
        if (id === conversationId) return false;
        const tm = s?.trajectoryMetadata || {};
        return tm.parentConversationId === conversationId || tm.rootConversationId === conversationId;
      })
      .sort((a, b) => Date.parse(b[1]?.lastModifiedTime || 0) - Date.parse(a[1]?.lastModifiedTime || 0));

    const cappedChildren = childEntries.slice(0, MAX_SUBAGENT_FANOUT);
    const nextEtag = [
      'rpc',
      conversationId,
      buildSummaryMark(targetSummary),
      ...cappedChildren.map(([id, s]) => `${id}:${buildSummaryMark(s)}`),
      this.#prefRevision,
    ].join('|');

    if (!force && clientEtag && clientEtag === nextEtag) {
      return { unchanged: true, etag: nextEtag, conversationId };
    }

    const [primaryProj, ...childProjs] = await Promise.all([
      this.#lsClient.getProjection(conversationId, { summary: targetSummary, force }),
      ...cappedChildren.map(([id, s]) =>
        this.#lsClient.getProjection(id, { summary: s, force }).catch(() => null),
      ),
    ]);

    const primary = computeMetricsFromProjection(conversationId, primaryProj, preferences);
    const subagentSummaries = [];

    for (let i = 0; i < cappedChildren.length; i++) {
      const [subId, subSummary] = cappedChildren[i];
      const subProj = childProjs[i];
      const tm = subSummary?.trajectoryMetadata || {};
      const spec = tm.subagentSpec || {};
      const role = spec.role || subSummary?.summary || subId.slice(0, 8);
      const typeName = spec.typeName || tm?.agentScript?.name || 'subagent';

      if (subProj) {
        const m = computeMetricsFromProjection(subId, subProj, preferences);
        subagentSummaries.push({
          id: subId,
          parentId: tm.parentConversationId || conversationId,
          role,
          typeName,
          status: m.conversation.status,
          isRunning: m.conversation.isRunning,
          model: m.conversation.model,
          contextUsed: m.context.usedTokens,
          contextMax: m.context.maxTokens,
          contextPercent: m.context.usedPercent,
          totalTokens: m.mainTotals.totalTokens,
          uncachedInput: m.mainTotals.uncachedInput,
          cacheRead: m.mainTotals.cacheRead,
          output: m.mainTotals.output,
          cacheHitRate: m.cache.cumulativeHitRate,
          avgStreamingTps: m.throughput.avgStreamingTps,
          stepCount: m.conversation.stepCount,
          updatedAt: m.conversation.updatedAt,
          totals: m.mainTotals,
        });
      }
    }

    const tm = targetSummary?.trajectoryMetadata || {};
    const snapshot = finalizeSnapshot(primary, subagentSummaries, {
      parentId: tm.parentConversationId || null,
      rootId: tm.rootConversationId || null,
      lang: preferences.lang,
    });

    return { ...snapshot, etag: nextEtag };
  }

  #collectLocalSubagentIds(local, selfId) {
    const ids = new Map();
    for (const member of local.swarmMembers || []) {
      if (member.conversationId && member.conversationId !== selfId && CONVERSATION_ID_RE.test(member.conversationId)) {
        ids.set(member.conversationId, { role: member.role || member.name, typeName: 'swarm' });
      }
    }
    for (const call of local.subagentCalls || []) {
      if (call.conversationId && call.conversationId !== selfId && CONVERSATION_ID_RE.test(call.conversationId)) {
        ids.set(call.conversationId, { role: call.role || call.typeName || 'subagent', typeName: call.typeName || 'subagent' });
      }
    }
    return [...ids.entries()].slice(0, MAX_SUBAGENT_FANOUT);
  }

  async #loadLocalSubagents(subEntries, preferences) {
    const results = [];
    for (const [subId, meta] of subEntries) {
      const subLocal = await readLocalConversation(this.#paths.appDataCandidates, subId).catch(() => null);
      if (!subLocal) continue;
      const m = computeMetricsFromTranscript(subId, subLocal, preferences);
      results.push({
        id: subId,
        parentId: null,
        role: meta.role,
        typeName: meta.typeName,
        status: m.conversation.status,
        isRunning: false,
        model: m.conversation.model,
        contextUsed: m.context.usedTokens,
        contextMax: m.context.maxTokens,
        contextPercent: m.context.usedPercent,
        totalTokens: m.mainTotals.totalTokens,
        uncachedInput: m.mainTotals.uncachedInput,
        cacheRead: m.mainTotals.cacheRead,
        output: m.mainTotals.output,
        cacheHitRate: m.cache.cumulativeHitRate,
        avgStreamingTps: m.throughput.avgStreamingTps,
        stepCount: m.conversation.stepCount,
        updatedAt: m.conversation.updatedAt,
        totals: m.mainTotals,
      });
    }
    return results;
  }
}

/**
 * 启动 Sidecar Web Server 并挂载所有接口。
 *
 * @return {Promise<object>}
 */
async function startSidecar() {
  const { SidecarApp, Response } = await loadSidecarSdk();
  const app = new SidecarApp();
  const paths = resolvePlatformPaths();
  const prefs = new PreferencesStore(paths.dataDir);
  const lsClient = new LanguageServerClient({ productName: paths.productName });
  const service = new PanelService({ lsClient, prefs, paths });

  const indexHtml = readFileSync(join(__dirname, 'index.html'), 'utf8');
  app.page(
    '/',
    () =>
      new Response(indexHtml, {
        contentType: 'text/html; charset=utf-8',
        headers: { 'X-Content-Type-Options': 'nosniff' },
      }),
  );

  for (const [route, info] of Object.entries(STATIC_ASSETS)) {
    const content = readFileSync(join(__dirname, info.file), 'utf8');
    app.api(
      route,
      () =>
        new Response(content, {
          contentType: info.contentType,
          headers: { 'X-Content-Type-Options': 'nosniff' },
        }),
      'GET',
    );
  }

  app.api(
    '/api/snapshot',
    (data) => {
      const conv = data.conversationId || app.config.conversationId || null;
      return service.getSnapshot({
        conversationId: conv,
        etag: data.etag || null,
        force: data.force === '1' || data.force === true,
      });
    },
    'GET',
  );

  app.api(
    '/api/conversations',
    (data) => {
      const conv = data.conversationId || app.config.conversationId || null;
      return service.getConversations(conv);
    },
    'GET',
  );

  app.api('/api/preferences', () => service.getPreferences(), 'GET');
  app.api('/api/preferences', (data) => service.updatePreferences(data), 'POST');

  return app.run();
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();

if (isEntrypoint) {
  startSidecar().catch((err) => {
    console.error('[token-lens] Sidecar failed to start:', err.message);
    process.exitCode = 1;
  });
}
