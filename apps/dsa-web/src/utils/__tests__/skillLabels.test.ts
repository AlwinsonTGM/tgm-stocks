import { describe, expect, it } from 'vitest';
import { localizeSkillDescription, localizeSkillId, localizeSkillName } from '../skillLabels';

describe('skillLabels', () => {
  it('translates known strategy names from the backend label', () => {
    expect(localizeSkillName('默认多头趋势', 'en')).toBe('Default Bull Trend');
    expect(localizeSkillName('均线金叉', 'en')).toBe('MA Golden Cross');
    expect(localizeSkillName('放量突破', 'en')).toBe('Volume Breakout');
  });

  it('translates known strategy names from the stable id', () => {
    expect(localizeSkillId('bull_trend', '默认多头趋势', 'en')).toBe('Default Bull Trend');
    expect(localizeSkillId('ma_golden_cross', '均线金叉', 'en')).toBe('MA Golden Cross');
  });

  it('keeps the original label in Chinese mode', () => {
    expect(localizeSkillName('默认多头趋势', 'zh')).toBe('默认多头趋势');
    expect(localizeSkillId('bull_trend', '默认多头趋势', 'zh')).toBe('默认多头趋势');
  });

  it('falls back to the original label when no translation is known', () => {
    expect(localizeSkillName('自定义策略', 'en')).toBe('自定义策略');
    expect(localizeSkillId('custom_strategy', '自定义策略', 'en')).toBe('自定义策略');
  });

  it('translates known strategy descriptions', () => {
    expect(localizeSkillDescription('默认个股分析优先策略，识别多头排列、趋势延续与回踩低吸机会。', 'en'))
      .toBe('The default single-stock strategy. Spots bullish alignment, trend continuation, and pullback entries.');
    expect(localizeSkillDescription('检测均线金叉配合量能确认信号，经典的趋势反转/延续信号。', 'en'))
      .toBe('Detects moving-average golden crosses confirmed by volume. A classic reversal or continuation signal.');
  });

  it('keeps the original description in Chinese mode', () => {
    const description = '默认个股分析优先策略，识别多头排列、趋势延续与回踩低吸机会。';
    expect(localizeSkillDescription(description, 'zh')).toBe(description);
  });

  it('falls back to the original description when no translation is known', () => {
    expect(localizeSkillDescription('自定义策略说明。', 'en')).toBe('自定义策略说明。');
  });

  it('handles empty and missing values', () => {
    expect(localizeSkillName(null, 'en')).toBe('');
    expect(localizeSkillName(undefined, 'en')).toBe('');
    expect(localizeSkillDescription(null, 'en')).toBe('');
    expect(localizeSkillDescription(undefined, 'en')).toBe('');
  });
});
