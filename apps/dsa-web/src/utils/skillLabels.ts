/**
 * Agent skill display names come from the backend strategy YAML files, which are
 * written in Chinese. These maps give the English UI readable labels without
 * touching the backend payloads.
 */

import type { UiLanguage } from '../i18n/uiText';

const SKILL_NAMES_BY_ID: Record<string, string> = {
  bottom_volume: 'Bottom Volume',
  box_oscillation: 'Box Oscillation',
  bull_trend: 'Default Bull Trend',
  chan_theory: 'Chan Theory',
  dragon_head: 'Dragon Head',
  emotion_cycle: 'Emotion Cycle',
  event_driven: 'Event Driven',
  expectation_repricing: 'Expectation Repricing',
  growth_quality: 'Growth Quality',
  hot_theme: 'Hot Theme',
  ma_golden_cross: 'MA Golden Cross',
  one_yang_three_yin: 'One Yang Three Yin',
  shrink_pullback: 'Shrinking Pullback',
  volume_breakout: 'Volume Breakout',
  wave_theory: 'Wave Theory',
};

const SKILL_NAMES_BY_LABEL: Record<string, string> = {
  底部放量: 'Bottom Volume',
  箱体震荡: 'Box Oscillation',
  默认多头趋势: 'Default Bull Trend',
  缠论: 'Chan Theory',
  龙头策略: 'Dragon Head',
  情绪周期: 'Emotion Cycle',
  事件驱动: 'Event Driven',
  预期重估: 'Expectation Repricing',
  成长质量: 'Growth Quality',
  热点题材: 'Hot Theme',
  均线金叉: 'MA Golden Cross',
  一阳夹三阴: 'One Yang Three Yin',
  缩量回踩: 'Shrinking Pullback',
  放量突破: 'Volume Breakout',
  波浪理论: 'Wave Theory',
  通用分析: 'General analysis',
  通用: 'General',
};

const SKILL_DESCRIPTIONS_BY_LABEL: Record<string, string> = {
  '检测长期下跌后底部放量信号，潜在趋势反转信号。':
    'Detects volume spikes at the bottom after a prolonged decline. A potential trend reversal.',
  '识别价格箱体区间，在箱底买入、箱顶减仓，适用于横盘震荡行情。':
    'Identifies price range boxes: buy at the floor, trim at the ceiling. Suited to sideways markets.',
  '默认个股分析优先策略，识别多头排列、趋势延续与回踩低吸机会。':
    'The default single-stock strategy. Spots bullish alignment, trend continuation, and pullback entries.',
  '基于缠论笔、线段、中枢结构，判断趋势级别、买卖点与背驰信号。':
    'Uses Chan Theory strokes, segments, and pivots to judge trend level, entry points, and divergence.',
  '板块轮动中识别龙头股。适用于板块启动或行业催化剂出现时。':
    'Finds the leading stock during sector rotation. Use when a sector ignites or a catalyst lands.',
  '基于市场情绪、换手率与量价结构，识别情绪低点（恐慌底）与情绪高点（狂热顶），逆情绪布局。':
    'Reads sentiment, turnover, and volume-price structure to find panic bottoms and euphoric tops, then positions against the crowd.',
  '围绕业绩、政策、并购、订单、产品发布等事件，评估催化强度、兑现概率和风险边界。':
    'Around earnings, policy, M&A, orders, and launches: weighs catalyst strength, delivery odds, and downside.',
  '分析业绩预期、政策预期和估值预期的变化，寻找预期差修复或预期过热后的回落风险。':
    'Tracks shifts in earnings, policy, and valuation expectations to find gaps to close or overheating to fade.',
  '结合收入利润增长、ROE、现金流和行业空间，识别高质量成长股与成长失速风险。':
    'Combines revenue and profit growth, ROE, cash flow, and industry headroom to separate quality growers from stalling ones.',
  '跟踪政策、产业和市场热点，判断题材强度、板块扩散和个股相对强弱。':
    'Follows policy, industry, and market themes to gauge theme strength, sector spread, and relative strength.',
  '检测均线金叉配合量能确认信号，经典的趋势反转/延续信号。':
    'Detects moving-average golden crosses confirmed by volume. A classic reversal or continuation signal.',
  '检测一阳夹三阴K线整理形态，趋势延续入场信号。':
    'Detects the one-bullish-three-bearish candle consolidation pattern. A trend-continuation entry.',
  '检测缩量回踩均线支撑信号，趋势延续的理想入场点。':
    'Detects low-volume pullbacks to moving-average support. An ideal continuation entry.',
  '检测放量突破阻力位信号。适用于股价接近已知阻力位时。':
    'Detects high-volume breakouts through resistance. Use when price approaches a known level.',
  '基于艾略特波浪理论的推动浪与调整浪结构，判断当前所处浪型与潜在目标价。':
    'Uses Elliott Wave impulse and corrective structure to place the current wave and project targets.',
};

/**
 * Resolve a skill description for the given UI language.
 * Falls back to the original description when no translation is known.
 */
export function localizeSkillDescription(
  description: string | null | undefined,
  language: UiLanguage,
): string {
  if (!description) return '';
  if (language !== 'en') return description;
  return SKILL_DESCRIPTIONS_BY_LABEL[description.trim()] ?? description;
}

/**
 * Resolve a skill display name for the given UI language.
 * Falls back to the original label when no translation is known.
 */
export function localizeSkillName(
  label: string | null | undefined,
  language: UiLanguage,
): string {
  if (!label) return '';
  if (language !== 'en') return label;
  return SKILL_NAMES_BY_LABEL[label.trim()] ?? label;
}

/**
 * Resolve a skill display name from its stable id, falling back to the label.
 */
export function localizeSkillId(
  id: string | null | undefined,
  label: string | null | undefined,
  language: UiLanguage,
): string {
  if (language === 'en' && id) {
    const byId = SKILL_NAMES_BY_ID[id.trim()];
    if (byId) return byId;
  }
  return localizeSkillName(label, language);
}
