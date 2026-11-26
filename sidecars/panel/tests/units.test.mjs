/**
 * units.cjs 单元测试：验证中/英展示单位制切换、中式万/亿分档精度、千分位整数与悬停对照提示。
 *
 * @author Ateng
 * @since 2026-11-26
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  fmtCompact,
  fmtCompactTitle,
  fmtInt,
  resolveEffectiveUnitSystem,
} = require('../units.cjs');

test('resolveEffectiveUnitSystem 正确解析跟随语言与显式单位制覆盖', () => {
  assert.equal(resolveEffectiveUnitSystem({ lang: 'zh-CN', unitSystem: 'auto' }), 'zh');
  assert.equal(resolveEffectiveUnitSystem({ lang: 'en', unitSystem: 'auto' }), 'intl');
  assert.equal(resolveEffectiveUnitSystem({ lang: 'en', unitSystem: 'zh' }), 'zh');
  assert.equal(resolveEffectiveUnitSystem({ lang: 'zh-CN', unitSystem: 'intl' }), 'intl');
  assert.equal(resolveEffectiveUnitSystem(), 'zh');
});

test('fmtCompact 在中文单位制下按 <1万/万/千万/亿/万亿 规则精确格式化', () => {
  const zh = { unitSystem: 'zh', lang: 'zh-CN' };

  assert.equal(fmtCompact(0, zh), '0');
  assert.equal(fmtCompact(850, zh), '850');
  assert.equal(fmtCompact(4520, zh), '4,520');
  assert.equal(fmtCompact(9999, zh), '9,999');

  assert.equal(fmtCompact(10000, zh), '1.0万');
  assert.equal(fmtCompact(440000, zh), '44.0万');
  assert.equal(fmtCompact(512000, zh), '51.2万');
  assert.equal(fmtCompact(1048576, zh), '104.9万');
  assert.equal(fmtCompact(3852000, zh), '385.2万');

  assert.equal(fmtCompact(9999500, zh), '1,000万');
  assert.equal(fmtCompact(10000000, zh), '1,000万');
  assert.equal(fmtCompact(35420000, zh), '3,542万');
  assert.equal(fmtCompact(99999999, zh), '1.00亿');

  assert.equal(fmtCompact(125400000, zh), '1.25亿');
  assert.equal(fmtCompact(999995000000, zh), '1.00万亿');
  assert.equal(fmtCompact(1250000000000, zh), '1.25万亿');

  assert.equal(fmtCompact(-8284, zh), '-8,284');
  assert.equal(fmtCompact(-12300, zh), '-1.2万');
  assert.equal(fmtCompact(-0.2, zh), '0');
  assert.equal(fmtCompact(null, zh), '—');
  assert.equal(fmtCompact(Number.NaN, zh), '—');
});

test('fmtCompact 在国际单位制下保持 K / M / B 格式化且支持 fmtInt 三位千分位', () => {
  const intl = { unitSystem: 'intl', lang: 'en' };

  assert.equal(fmtCompact(850, intl), '850');
  assert.equal(fmtCompact(4520, intl), '4.5K');
  assert.equal(fmtCompact(512000, intl), '512.0K');
  assert.equal(fmtCompact(35420000, intl), '35.42M');
  assert.equal(fmtCompact(1250000000, intl), '1.25B');
  assert.equal(fmtCompact(-1500, intl), '-1.5K');

  assert.equal(fmtInt(4520), '4,520');
  assert.equal(fmtInt(35420000), '35,420,000');
  assert.equal(fmtInt(-0.2), '0');
  assert.equal(fmtInt(undefined), '—');
});

test('fmtCompactTitle 为悬停提示提供精确整数与对照单位', () => {
  assert.equal(fmtCompactTitle(35420000, { unitSystem: 'zh', lang: 'zh-CN' }), '35,420,000 tok · 35.42M');
  assert.equal(fmtCompactTitle(512000, { unitSystem: 'zh', lang: 'zh-CN' }), '512,000 tok · 512.0K');
  assert.equal(fmtCompactTitle(850, { unitSystem: 'zh', lang: 'zh-CN' }), '850 tok');
  assert.equal(fmtCompactTitle(35420000, { unitSystem: 'intl', lang: 'zh-CN' }), '35,420,000 tok · 3,542万');
  assert.equal(fmtCompactTitle(35420000, { unitSystem: 'intl', lang: 'zh-CN', includeContrast: false }), '35,420,000 tok');
  assert.equal(fmtCompactTitle(35420000, { unitSystem: 'intl', lang: 'en' }), '35,420,000 tok');
  assert.equal(fmtCompactTitle(50000, { unitSystem: 'zh', lang: 'zh-CN', unitLabel: '' }), '50,000 · 50.0K');
  assert.equal(fmtCompactTitle(null, { unitSystem: 'zh', lang: 'zh-CN' }), '');
});
