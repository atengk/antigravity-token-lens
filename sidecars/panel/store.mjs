/**
 * 持久化存储与宿主机主题配置读取模块，负责推导产品数据目录、原子保存用户偏好并读取白名单主题种子。
 *
 * @author Ateng
 * @since 2026-11-16
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEFAULT_PREFERENCES = Object.freeze({
  lang: 'zh-CN',
  warnAt: 70,
  criticalAt: 85,
  contextLimitOverrides: {},
});

const MAX_OVERRIDES = 100;
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const VALID_LANGS = new Set(['zh-CN', 'en']);

/**
 * 解析当前 Sidecar 所属的产品数据目录、应用数据根目录与用户全局配置目录。
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] 环境变量对象
 * @param {string} [home=homedir()] 用户主目录
 * @return {{ productName: string, appDataDir: string|null, appDataCandidates: string[], dataDir: string, configFile: string }}
 */
export function resolvePlatformPaths(env = process.env, home = homedir()) {
  const geminiRoot = join(home, '.gemini');
  const injectedDataDir = env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || '';
  let appDataDir = null;
  let productName = 'antigravity';

  if (injectedDataDir) {
    for (let cur = injectedDataDir; cur && cur !== dirname(cur); cur = dirname(cur)) {
      if (basename(cur) === 'sidecar_data') {
        const parent = dirname(cur);
        appDataDir = parent;
        productName = basename(parent) || 'antigravity';
        break;
      }
    }
  }

  const knownProducts = [productName, 'antigravity', 'antigravity-ide', 'antigravity-cli'];
  const appDataCandidates = [];
  const seen = new Set();
  for (const name of knownProducts) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const dir = join(geminiRoot, name);
    if (existsSync(join(dir, 'brain'))) {
      appDataCandidates.push(dir);
    }
  }
  if (appDataDir && !appDataCandidates.includes(appDataDir) && existsSync(join(appDataDir, 'brain'))) {
    appDataCandidates.unshift(appDataDir);
  }

  const dataDir = injectedDataDir || join(geminiRoot, productName, 'sidecar_data', 'token-lens', 'panel', 'data');
  return {
    productName,
    appDataDir,
    appDataCandidates,
    dataDir,
    configFile: join(geminiRoot, 'config', 'config.json'),
  };
}

/**
 * 校验并规范化用户偏好对象。
 *
 * @param {unknown} raw 原始偏好输入
 * @param {object} [base=DEFAULT_PREFERENCES] 基础默认值
 * @return {{ lang: string, warnAt: number, criticalAt: number, contextLimitOverrides: Record<string, number> }}
 */
export function normalizePreferences(raw, base = DEFAULT_PREFERENCES) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const lang = VALID_LANGS.has(src.lang) ? src.lang : base.lang;

  const warnRaw = Number(src.warnAt);
  const warnAt = Number.isInteger(warnRaw) && warnRaw >= 10 && warnRaw <= 95 ? warnRaw : base.warnAt;

  const critRaw = Number(src.criticalAt);
  const criticalAt =
    Number.isInteger(critRaw) && critRaw > warnAt && critRaw <= 99
      ? critRaw
      : Math.max(warnAt + 5, base.criticalAt <= 99 ? base.criticalAt : 95);

  const rawOverrides =
    src.contextLimitOverrides && typeof src.contextLimitOverrides === 'object' && !Array.isArray(src.contextLimitOverrides)
      ? src.contextLimitOverrides
      : base.contextLimitOverrides;

  const overrides = {};
  let count = 0;
  for (const [k, v] of Object.entries(rawOverrides)) {
    if (count >= MAX_OVERRIDES) break;
    const key = String(k).trim().slice(0, 160);
    const num = Number(v);
    if (!key || !Number.isSafeInteger(num) || num < 1024 || num > 100_000_000) continue;
    overrides[key] = num;
    count++;
  }

  return { lang, warnAt, criticalAt, contextLimitOverrides: overrides };
}

/**
 * 管理轻量单文件偏好配置，串行队列保证并发写入安全且绝不产生碎片账本。
 */
export class PreferencesStore {
  #filePath;
  #cached = null;
  #writeQueue = Promise.resolve();

  /**
   * @param {string} dataDir Sidecar 持久化目录
   */
  constructor(dataDir) {
    this.#filePath = join(dataDir, 'preferences.json');
  }

  /**
   * 读取当前偏好配置（不存在或损坏时回退默认值）。
   *
   * @return {Promise<{ lang: string, warnAt: number, criticalAt: number, contextLimitOverrides: Record<string, number> }>}
   */
  async load() {
    if (this.#cached) return structuredClone(this.#cached);
    try {
      const text = await readFile(this.#filePath, 'utf8');
      if (text.length > 512 * 1024) {
        this.#cached = normalizePreferences({});
        return structuredClone(this.#cached);
      }
      this.#cached = normalizePreferences(JSON.parse(text.replace(/^\uFEFF/, '')));
    } catch (err) {
      if (err?.code !== 'ENOENT' && !(err instanceof SyntaxError)) {
        throw err;
      }
      this.#cached = normalizePreferences({});
    }
    return structuredClone(this.#cached);
  }

  /**
   * 合并更新并原子写入偏好配置。
   *
   * @param {object} patch 待合并字段
   * @return {Promise<{ lang: string, warnAt: number, criticalAt: number, contextLimitOverrides: Record<string, number> }>}
   */
  async update(patch) {
    const task = this.#writeQueue.catch(() => {}).then(async () => {
      const current = await this.load();
      const input = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
      const mergedOverrides = { ...current.contextLimitOverrides };

      if (input.contextLimitOverrides && typeof input.contextLimitOverrides === 'object' && !Array.isArray(input.contextLimitOverrides)) {
        for (const [k, v] of Object.entries(input.contextLimitOverrides)) {
          if (v === null || v === 0 || v === '') {
            delete mergedOverrides[k];
          } else {
            mergedOverrides[k] = v;
          }
        }
      }

      const next = normalizePreferences(
        { ...current, ...input, contextLimitOverrides: mergedOverrides },
        current,
      );

      await mkdir(dirname(this.#filePath), { recursive: true });
      const tempPath = `${this.#filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(tempPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
        await rename(tempPath, this.#filePath);
        this.#cached = next;
      } catch (err) {
        await unlink(tempPath).catch(() => {});
        throw err;
      }
      return structuredClone(next);
    });
    this.#writeQueue = task;
    return task;
  }
}

/**
 * 仅从全局 config.json 读取白名单内的主题设置，绝不暴露凭据或其他配置。
 *
 * @param {string} configFile 全局配置文件路径
 * @return {Promise<{ mode: 'dark'|'light'|'system' }>}
 */
export async function readHostThemeMode(configFile) {
  try {
    const text = await readFile(configFile, 'utf8');
    if (text.length > MAX_CONFIG_BYTES) return { mode: 'system' };
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    const rawMode = parsed?.userSettings?.themeMode;
    const modeMap = {
      THEME_MODE_DARK: 'dark',
      THEME_MODE_LIGHT: 'light',
      THEME_MODE_SYSTEM: 'system',
      dark: 'dark',
      light: 'light',
      system: 'system',
    };
    return { mode: modeMap[rawMode] || 'system' };
  } catch {
    return { mode: 'system' };
  }
}
