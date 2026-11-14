import { describe, expect, it } from 'vitest';
import { localizeSetupCheck } from '../setupCheckLabels';
import type { SetupStatusCheck } from '../../types/systemConfig';

function makeCheck(overrides: Partial<SetupStatusCheck>): SetupStatusCheck {
  return {
    key: 'llm_primary',
    title: 'LLM 主渠道',
    category: 'ai_model',
    required: true,
    status: 'needs_action',
    message: '尚未检测到主模型配置',
    nextStep: null,
    ...overrides,
  };
}

describe('setupCheckLabels', () => {
  it('translates known setup check titles from the stable key', () => {
    expect(localizeSetupCheck(makeCheck({ key: 'llm_primary' }), 'en').title)
      .toBe('Primary LLM channel');
    expect(localizeSetupCheck(makeCheck({ key: 'llm_agent', title: 'Agent 渠道' }), 'en').title)
      .toBe('Agent channel');
    expect(localizeSetupCheck(makeCheck({ key: 'stock_list', title: '自选股' }), 'en').title)
      .toBe('Watchlist');
    expect(localizeSetupCheck(makeCheck({ key: 'notification', title: '通知渠道' }), 'en').title)
      .toBe('Notification channels');
    expect(localizeSetupCheck(makeCheck({ key: 'storage', title: '数据库 / 本地存储' }), 'en').title)
      .toBe('Database / local storage');
    expect(localizeSetupCheck(makeCheck({ key: 'news_search', title: '新闻搜索渠道' }), 'en').title)
      .toBe('News search channel');
  });

  it('translates the news search check messages and next step', () => {
    const configured = makeCheck({
      key: 'news_search',
      required: false,
      status: 'configured',
      message: '已检测到新闻搜索渠道: Tavily、Brave。',
    });
    expect(localizeSetupCheck(configured, 'en').message)
      .toBe('News search channel detected: Tavily、Brave.');

    const missing = makeCheck({
      key: 'news_search',
      required: false,
      status: 'optional',
      message: '未配置新闻搜索渠道，分析报告将不包含新闻面证据。',
      nextStep: '需要新闻面时可配置 Tavily 或 Brave 的 API Key，或填写自建 SearXNG 实例地址。',
    });
    const localized = localizeSetupCheck(missing, 'en');
    expect(localized.message)
      .toBe('No news search channel is configured, so analysis reports will not include news evidence.');
    expect(localized.nextStep)
      .toBe('For news evidence, add a Tavily or Brave API key, or enter the URL of a self-hosted SearXNG instance.');
  });

  it('translates known setup check messages', () => {
    expect(localizeSetupCheck(makeCheck({ message: '尚未检测到主模型配置' }), 'en').message)
      .toBe('No primary model configuration detected yet.');
    expect(localizeSetupCheck(makeCheck({ key: 'stock_list', message: '已配置 3 只股票。' }), 'en').message)
      .toBe('3 stocks configured.');
    expect(localizeSetupCheck(makeCheck({ key: 'stock_list', message: '已配置 1 只股票。' }), 'en').message)
      .toBe('1 stock configured.');
    expect(localizeSetupCheck(makeCheck({ key: 'stock_list', message: '当前 STOCK_LIST 为空。' }), 'en').message)
      .toBe('STOCK_LIST is currently empty.');
  });

  it('translates known next steps', () => {
    const check = makeCheck({ nextStep: '请先补齐 LLM 主渠道配置。' });
    expect(localizeSetupCheck(check, 'en').nextStep)
      .toBe('Complete the primary LLM channel configuration first.');
  });

  it('keeps the backend text in Chinese mode', () => {
    const check = makeCheck({ nextStep: '请先补齐 LLM 主渠道配置。' });
    const localized = localizeSetupCheck(check, 'zh');
    expect(localized.title).toBe('LLM 主渠道');
    expect(localized.message).toBe('尚未检测到主模型配置');
    expect(localized.nextStep).toBe('请先补齐 LLM 主渠道配置。');
  });

  it('falls back to the backend text when nothing is known', () => {
    const check = makeCheck({
      key: 'custom_check',
      title: '自定义检查',
      message: '自定义说明',
      nextStep: '自定义下一步',
    });
    const localized = localizeSetupCheck(check, 'en');
    expect(localized.title).toBe('自定义检查');
    expect(localized.message).toBe('自定义说明');
    expect(localized.nextStep).toBe('自定义下一步');
  });

  it('normalizes a missing next step to null', () => {
    expect(localizeSetupCheck(makeCheck({ nextStep: undefined }), 'en').nextStep).toBeNull();
    expect(localizeSetupCheck(makeCheck({ nextStep: null }), 'en').nextStep).toBeNull();
  });
});
