/**
 * Token 数量多单位制共享格式化引擎，供 Node 服务端摘要与浏览器端看板共用。
 *
 * @author Ateng
 * @since 2026-11-26
 */

(function initTokenLensUnits(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TokenLensUnits = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const VALID_UNIT_SYSTEMS = new Set(['auto', 'zh', 'intl']);

  /**
   * 根据用户显式偏好与界面语言解析当前生效的展示单位制。
   *
   * @param {{ lang?: string, unitSystem?: string }} [opts] 解析选项
   * @return {'zh'|'intl'}
   */
  function resolveEffectiveUnitSystem(opts = {}) {
    const unitSystem = VALID_UNIT_SYSTEMS.has(opts?.unitSystem) ? opts.unitSystem : 'auto';
    if (unitSystem === 'zh' || unitSystem === 'intl') {
      return unitSystem;
    }
    return opts?.lang === 'en' ? 'intl' : 'zh';
  }

  /**
   * 将数字格式化为标准三位千分位整数字符串。
   *
   * @param {unknown} n 原始数值
   * @return {string}
   */
  function fmtInt(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    const rounded = Math.round(n);
    return (rounded === 0 ? 0 : rounded).toLocaleString('en-US');
  }

  /**
   * 将 Token 数值按指定展示单位制格式化为紧凑文本（中文万/亿 或 国际 K/M/B）。
   *
   * @param {unknown} n 原始数值
   * @param {{ lang?: string, unitSystem?: string }} [opts] 单位制选项
   * @return {string}
   */
  function fmtCompact(n, opts = {}) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs < 0.5) return '0';
    const prefix = n < 0 ? '-' : '';
    const system = resolveEffectiveUnitSystem(opts);

    if (system === 'intl') {
      if (abs >= 1e9) return `${prefix}${(abs / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${prefix}${(abs / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${prefix}${(abs / 1e3).toFixed(1)}K`;
      return `${prefix}${Math.round(abs)}`;
    }

    // 按四舍五入进位边界提前升档，避免出现 1000.0万、10,000万 或 10000.00亿 的跨档溢出
    if (abs >= 999_995_000_000) return `${prefix}${(abs / 1e12).toFixed(2)}万亿`;
    if (abs >= 99_995_000) return `${prefix}${(abs / 1e8).toFixed(2)}亿`;
    if (abs >= 9_999_500) return `${prefix}${Math.round(abs / 1e4).toLocaleString('en-US')}万`;
    if (abs >= 1e4) return `${prefix}${(abs / 1e4).toFixed(1)}万`;
    return `${prefix}${Math.round(abs).toLocaleString('en-US')}`;
  }

  /**
   * 生成悬停 title 提示文本，提供精确数值与另一套单位制的对照参考。
   *
   * @param {unknown} n 原始数值
   * @param {{ lang?: string, unitSystem?: string, unitLabel?: string, includeContrast?: boolean }} [opts] 单位制、后缀与对照选项
   * @return {string}
   */
  function fmtCompactTitle(n, opts = {}) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '';
    const abs = Math.abs(n);
    const label = opts?.unitLabel === undefined ? 'tok' : opts.unitLabel;
    const exact = label ? `${fmtInt(n)} ${label}` : fmtInt(n);
    if (opts?.includeContrast === false) return exact;
    const system = resolveEffectiveUnitSystem(opts);

    if (system === 'zh') {
      return abs >= 1e3 ? `${exact} · ${fmtCompact(n, { unitSystem: 'intl' })}` : exact;
    }
    if (opts?.lang !== 'en' && abs >= 1e4) {
      return `${exact} · ${fmtCompact(n, { unitSystem: 'zh' })}`;
    }
    return exact;
  }

  return {
    VALID_UNIT_SYSTEMS,
    resolveEffectiveUnitSystem,
    fmtInt,
    fmtCompact,
    fmtCompactTitle,
  };
});
