import type {
  PortfolioCashDirection,
  PortfolioCorporateActionType,
  PortfolioFxRefreshResponse,
  PortfolioImportCommitResponse,
  PortfolioImportParseResponse,
  PortfolioPositionItem,
  PortfolioSide,
} from '../types/portfolio';
import type { UiLanguage } from '../i18n/uiText';
import { toDateInputValue } from './format';
import { getCurrentUiLanguage } from './uiLanguage';

const pick = (language: UiLanguage, zh: string, en: string): string => (language === 'en' ? en : zh);

export type FxRefreshFeedback = {
  tone: 'neutral' | 'success' | 'warning';
  text: string;
};

export type PortfolioAlertVariant = 'info' | 'success' | 'warning' | 'danger';

export function getTodayIso(): string {
  return toDateInputValue(new Date());
}

export function formatMoney(value: number | undefined | null, currency = 'CNY'): string {
  if (value == null || Number.isNaN(value)) return '--';
  return `${currency} ${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPct(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  return `${value.toFixed(2)}%`;
}

export function formatSignedPct(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function hasPositionPrice(row: PortfolioPositionItem): boolean {
  return row.priceAvailable !== false && row.priceSource !== 'missing';
}

export function formatPositionPrice(row: PortfolioPositionItem): string {
  if (!hasPositionPrice(row)) return '--';
  return row.lastPrice.toFixed(4);
}

export function formatPositionMoney(value: number, row: PortfolioPositionItem): string {
  if (!hasPositionPrice(row)) return '--';
  return formatMoney(value, row.valuationCurrency);
}

export function getPositionPriceLabel(
  row: PortfolioPositionItem,
  language: UiLanguage = getCurrentUiLanguage(),
): string {
  if (!hasPositionPrice(row)) return pick(language, '缺价', 'No price');
  if (row.priceSource === 'realtime_quote') {
    const label = pick(language, '实时价', 'Live price');
    return row.priceProvider ? `${label} · ${row.priceProvider}` : label;
  }
  if (row.priceSource === 'history_close') {
    const label = pick(language, '收盘价', 'Close price');
    return row.priceStale && row.priceDate ? `${label} · ${row.priceDate}` : label;
  }
  return row.priceSource || pick(language, '未知来源', 'Unknown source');
}

export function formatSideLabel(value: PortfolioSide, language: UiLanguage = getCurrentUiLanguage()): string {
  return value === 'buy' ? pick(language, '买入', 'Buy') : pick(language, '卖出', 'Sell');
}

export function formatCashDirectionLabel(
  value: PortfolioCashDirection,
  language: UiLanguage = getCurrentUiLanguage(),
): string {
  return value === 'in' ? pick(language, '流入', 'Inflow') : pick(language, '流出', 'Outflow');
}

export function formatCorporateActionLabel(
  value: PortfolioCorporateActionType,
  language: UiLanguage = getCurrentUiLanguage(),
): string {
  return value === 'cash_dividend'
    ? pick(language, '现金分红', 'Cash dividend')
    : pick(language, '拆并股调整', 'Split / merger adjustment');
}

const BROKER_DISPLAY_NAMES: Record<string, string> = {
  华泰: 'Huatai',
  中信: 'CITIC',
  招商: 'CMB',
  国泰君安: 'Guotai Junan',
  广发: 'GF Securities',
  海通: 'Haitong',
  银河: 'Galaxy',
  东方财富: 'East Money',
};

export function formatBrokerLabel(
  value: string,
  displayName?: string,
  language: UiLanguage = getCurrentUiLanguage(),
): string {
  const open = language === 'en' ? ' (' : '（';
  const close = language === 'en' ? ')' : '）';
  const trimmed = displayName?.trim();
  if (trimmed) {
    const localized = language === 'en' ? BROKER_DISPLAY_NAMES[trimmed] ?? trimmed : trimmed;
    return `${value}${open}${localized}${close}`;
  }
  if (value === 'huatai') return `huatai${open}${pick(language, '华泰', 'Huatai')}${close}`;
  if (value === 'citic') return `citic${open}${pick(language, '中信', 'CITIC')}${close}`;
  if (value === 'cmb') return `cmb${open}${pick(language, '招商', 'CMB')}${close}`;
  return value;
}

export function buildFxRefreshFeedback(
  data: PortfolioFxRefreshResponse,
  language: UiLanguage = getCurrentUiLanguage(),
): FxRefreshFeedback {
  if (data.refreshEnabled === false) {
    return {
      tone: 'neutral',
      text: pick(language, '汇率在线刷新已被禁用。', 'Online FX refresh is disabled.'),
    };
  }

  if (data.pairCount === 0) {
    return {
      tone: 'neutral',
      text: pick(language, '当前范围无可刷新的汇率对。', 'No FX pairs to refresh in this range.'),
    };
  }

  if (data.updatedCount > 0 && data.staleCount === 0 && data.errorCount === 0) {
    return {
      tone: 'success',
      text: pick(
        language,
        `汇率已刷新，共更新 ${data.updatedCount} 对。`,
        `FX rates refreshed, ${data.updatedCount} pairs updated.`,
      ),
    };
  }

  const summary = pick(
    language,
    `更新 ${data.updatedCount} 对，仍过期 ${data.staleCount} 对，失败 ${data.errorCount} 对。`,
    `${data.updatedCount} updated, ${data.staleCount} still stale, ${data.errorCount} failed.`,
  );
  if (data.staleCount > 0) {
    return {
      tone: 'warning',
      text: pick(
        language,
        `已尝试刷新，但仍有部分货币对使用 stale/fallback 汇率。${summary}`,
        `Refresh attempted, but some pairs still use stale or fallback rates. ${summary}`,
      ),
    };
  }

  return {
    tone: 'warning',
    text: pick(language, '在线刷新未完全成功。', 'Online refresh did not fully succeed. ') + summary,
  };
}

export function getFxRefreshFeedbackVariant(tone: FxRefreshFeedback['tone']): PortfolioAlertVariant {
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  return 'info';
}

export function getCsvParseVariant(result: PortfolioImportParseResponse): PortfolioAlertVariant {
  return result.errorCount > 0 || result.skippedCount > 0 ? 'warning' : 'info';
}

export function getCsvCommitVariant(result: PortfolioImportCommitResponse, isDryRun: boolean): PortfolioAlertVariant {
  if (isDryRun) return 'info';
  return result.failedCount > 0 || result.duplicateCount > 0 ? 'warning' : 'success';
}
