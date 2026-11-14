import type React from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bookmark,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Droplet,
  Factory,
  Flame,
  Gem,
  Landmark,
  Pickaxe,
  Plane,
  Play,
  PlusCircle,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Stethoscope,
  Trees,
  Utensils,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  screeningApi,
  type ScreeningCandidate,
  type ScreeningExplanationItem,
  type ScreeningHotspotDetail,
  type ScreeningHotspot,
  type ScreeningHotspotsResponse,
  type ScreeningRunSummary,
  type ScreeningScreenResponse,
  type ScreeningScreenTaskStatus,
  type ScreeningStrategy,
} from '../api/screening';
import { formatParsedApiError, getParsedApiError, toApiErrorMessage, type ParsedApiError } from '../api/error';
import { AppPage, Button, InlineAlert, Select } from '../components/common';
import { useUiLanguage } from '../contexts/UiLanguageContext';
import type { UiLanguage } from '../i18n/uiText';

const MARKETS: Array<{ id: string; label: [string, string] }> = [{ id: 'cn', label: ['A 股', 'A-shares'] }];
const SCREEN_TASK_STORAGE_KEY = 'dsa.screening.activeScreenTask.v1';
const SCREEN_TASK_POLL_INTERVAL_MS = 2000;
const CUSTOM_STRATEGY_OPTION_VALUE = '__custom_strategy__';
const STRATEGY_CATEGORY_LABELS: Record<string, [string, string]> = {
  framework: ['综合', 'Composite'],
  income: ['收益', 'Income'],
  momentum: ['动量', 'Momentum'],
  quality: ['质量', 'Quality'],
  reversal: ['反转', 'Reversal'],
  trend: ['趋势', 'Trend'],
  value: ['价值', 'Value'],
};

const formatStrategyCategory = (value: string | undefined, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const normalized = value?.trim();
  if (!normalized) {
    return L('自定义', 'Custom');
  }
  const label = STRATEGY_CATEGORY_LABELS[normalized.toLowerCase()];
  return label ? (language === 'en' ? label[1] : label[0]) : normalized;
};

type PersistedScreenTask = {
  taskId: string;
  runId?: string;
  market: string;
  strategy: string;
  maxResults: number;
};

const formatRunCreatedAt = (value: string | null | undefined, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (!value) {
    return L('时间未知', 'Time unknown');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// 历史条目里展示筛选条件：策略 ID → 中文名（找不到时回退到原始 ID）
const formatHistoryStrategyName = (strategyId: string, strategies: ScreeningStrategy[], language: UiLanguage): string => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const matched = strategies.find((item) => item.id === strategyId);
  return matched?.name || matched?.title || strategyId || L('未知策略', 'Unknown strategy');
};

// 历史条目里展示筛选条件：市场 ID → 中文标签
const getMarketLabel = (marketId: string | null | undefined, language: UiLanguage): string => {
  const matched = MARKETS.find((item) => item.id === marketId);
  if (!matched) {
    return marketId || 'cn';
  }
  return language === 'en' ? matched.label[1] : matched.label[0];
};

const readPersistedScreenTask = (): PersistedScreenTask | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(SCREEN_TASK_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedScreenTask>;
    if (typeof parsed.taskId !== 'string' || !parsed.taskId.trim()) {
      return null;
    }
    const restoredMaxResults = Number(parsed.maxResults);
    return {
      taskId: parsed.taskId,
      runId: typeof parsed.runId === 'string' && parsed.runId.trim() ? parsed.runId : undefined,
      market: typeof parsed.market === 'string' && parsed.market.trim() ? parsed.market : 'cn',
      strategy: typeof parsed.strategy === 'string' && parsed.strategy.trim() ? parsed.strategy : 'dual_low',
      maxResults: Number.isFinite(restoredMaxResults) ? Math.min(100, Math.max(1, restoredMaxResults)) : 3,
    };
  } catch {
    return null;
  }
};

const persistScreenTask = (task: PersistedScreenTask) => {
  try {
    window.sessionStorage.setItem(SCREEN_TASK_STORAGE_KEY, JSON.stringify(task));
  } catch {
    // Session storage is best-effort; polling still works while the page stays mounted.
  }
};

const clearPersistedScreenTask = () => {
  try {
    window.sessionStorage.removeItem(SCREEN_TASK_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const isUnrecoverableScreenTaskError = (error: ParsedApiError) =>
  error.title === '选股任务不可恢复';

const formatRecoverableScreenTaskPollingError = (error: ParsedApiError, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (error.category === 'upstream_timeout') {
    return L('选股任务仍在后台运行，状态轮询暂时超时，将自动重试。', 'The screening task is still running in the background; status polling timed out and will retry automatically.');
  }
  if (error.category === 'upstream_network' || error.category === 'local_connection_failed') {
    return L('选股任务仍在后台运行，暂时无法连接本地服务获取状态，将自动重试。', 'The screening task is still running in the background; the local service is unreachable for status updates and will retry automatically.');
  }
  return formatParsedApiError(error) || L('暂时无法获取选股任务状态，稍后将自动重试。', 'Unable to fetch the screening task status right now; retrying shortly.');
};

const formatScore = (score: ScreeningCandidate['score']) => {
  if (score == null || Number.isNaN(Number(score))) {
    return '-';
  }
  return Number(score).toFixed(2);
};

const formatNumber = (value: unknown, digits = 2) => {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toFixed(digits);
};

const formatAmount = (value: unknown, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '-';
  }
  const amount = Number(value);
  if (Math.abs(amount) >= 100_000_000) {
    return L(`${(amount / 100_000_000).toFixed(2)} 亿`, `${(amount / 1_000_000).toFixed(2)}M`);
  }
  if (Math.abs(amount) >= 10_000) {
    return L(`${(amount / 10_000).toFixed(2)} 万`, `${(amount / 1_000).toFixed(2)}K`);
  }
  return amount.toFixed(2);
};

const formatPercent = (value: unknown) => {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '-';
  }
  return `${(Number(value) * 100).toFixed(0)}%`;
};

const FACTOR_LABELS: Record<string, [string, string]> = {
  value: ['估值', 'Valuation'],
  liquidity: ['流动性', 'Liquidity'],
  momentum: ['动量', 'Momentum'],
  reversal: ['反转', 'Reversal'],
  activity: ['活跃度', 'Activity'],
  stability: ['稳定性', 'Stability'],
  size: ['规模', 'Size'],
  theme_heat: ['题材热度', 'Theme heat'],
  topic_alignment: ['题材匹配', 'Theme alignment'],
};

const getFactorLabel = (key: string, language: UiLanguage): string => {
  const label = FACTOR_LABELS[key];
  if (!label) {
    return key;
  }
  return language === 'en' ? label[1] : label[0];
};

const HOTSPOT_QUALITY_LABELS: Record<string, [string, string]> = {
  available: ['可用', 'Available'],
  failed: ['不可用', 'Unavailable'],
  partial: ['部分可用', 'Partially available'],
  stale: ['缓存', 'Cached'],
};

const HOTSPOT_STAGE_LABELS: Record<string, [string, string]> = {
  accelerating: ['加速主升', 'Accelerating breakout'],
  cooling: ['降温退潮', 'Cooling off'],
  diverging: ['分歧放量', 'Diverging on volume'],
  initial: ['初次异动', 'Initial move'],
  persistent_hot: ['确认扩散', 'Confirmed broadening'],
  warming: ['确认扩散', 'Confirmed broadening'],
  weakening: ['降温退潮', 'Cooling off'],
};

const HOTSPOT_ROLE_LABELS: Record<string, [string, string]> = {
  core_leader: ['核心龙头', 'Core leader'],
  follower: ['助攻', 'Supporting'],
  laggard: ['掉队', 'Laggard'],
  leader: ['核心龙头', 'Core leader'],
  secondary: ['补涨', 'Catch-up'],
};

const HOTSPOT_MISSING_FIELD_LABELS: Record<string, [string, string]> = {
  canonical_topic: ['标准题材', 'Canonical topic'],
  hotspot_constituents: ['概念股列表', 'Constituent list'],
  leader_stocks: ['核心股', 'Leader stocks'],
  live_stocks: ['实时概念股行情', 'Live constituent quotes'],
  route: ['发酵路径', 'Fermentation path'],
  source: ['数据来源', 'Data source'],
  stocks: ['概念股列表', 'Constituent list'],
  timeline: ['发酵时间线', 'Fermentation timeline'],
};

const getHotspotStageLabel = (value: unknown, language: UiLanguage) => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  const label = HOTSPOT_STAGE_LABELS[text.toLowerCase()];
  return label ? (language === 'en' ? label[1] : label[0]) : text;
};

const getHotspotRoleLabel = (value: unknown, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const text = String(value || '').trim();
  if (!text) {
    return L('概念股', 'Constituent');
  }
  const label = HOTSPOT_ROLE_LABELS[text.toLowerCase()];
  return label ? (language === 'en' ? label[1] : label[0]) : text;
};

const getHotspotQualityLabel = (value: unknown, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const text = String(value || '').trim();
  const label = HOTSPOT_QUALITY_LABELS[text.toLowerCase()];
  return label ? (language === 'en' ? label[1] : label[0]) : L('待确认', 'Unconfirmed');
};

const getCandidateReason = (item: ScreeningCandidate, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (item.llmThesis || item.llmScore != null) {
    return item.reason || item.llmThesis || L('LLM 已完成相对排序。', 'The LLM completed the relative ranking.');
  }
  if (item.reason) {
    return item.reason;
  }
  const summaries = item.postAnalysisSummaries || {};
  const summary = Object.values(summaries).find((value) => typeof value === 'string' && value.trim());
  if (typeof summary === 'string') {
    return summary;
  }
  return L('暂无摘要，请查看因子和风险信息。', 'No summary available; see the factor and risk details.');
};

const getSignal = (item: ScreeningCandidate, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const rawSignal = item.raw.action ?? item.raw.signal ?? item.raw.recommendation;
  return typeof rawSignal === 'string' && rawSignal.trim() ? rawSignal : L('观察', 'Watch');
};

const getFactorEntries = (item: ScreeningCandidate) =>
  Object.entries(item.factorScores || {})
    .filter(([, value]) => typeof value === 'number')
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 6);

const getSelectionExplanations = (item: ScreeningCandidate, language: UiLanguage): ScreeningExplanationItem[] => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (item.whySelected?.length) return item.whySelected;
  // Legacy runs lack provenance. Retain every stored summary as unknown rather
  // than re-scoring historical factors or asserting it was observed.
  const summaries = Array.from(new Set(
    [item.reason, item.llmThesis, ...Object.values(item.postAnalysisSummaries || {})]
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim()),
  ));
  return summaries.map((summary) => ({
    code: 'legacy_summary',
    text: L(`历史摘要（来源未记录）：${summary}`, `Historical summary (source not recorded): ${summary}`),
    source: 'legacy_result',
    quality: 'unknown',
  }));
};

const ExplanationItems = ({
  items,
  emptyText,
  language,
}: {
  items?: ScreeningExplanationItem[];
  emptyText: string;
  language: UiLanguage;
}) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  return items?.length ? (
    <ul className="mt-2 space-y-2">
      {items.map((item, index) => (
        <li key={`${item.code}-${item.source}-${index}`} className="rounded-lg border border-border/50 bg-background/30 p-2">
          <p className="text-sm leading-6 text-foreground">{item.text}</p>
          <p className="mt-1 text-xs text-secondary-text">
            {L('来源：', 'Source: ')}{item.source || 'unknown'}
            {' · '}
            {L('质量：', 'Quality: ')}{item.quality || 'unknown'}
          </p>
        </li>
      ))}
    </ul>
  ) : <p className="mt-1 text-sm leading-6 text-foreground">{emptyText}</p>;
};

const toMessageList = (values: string[] | undefined) =>
  Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean) : [];

const KNOWN_SNAPSHOT_SOURCES = new Set(['tushare', 'sina', 'efinance', 'akshare_em', 'em_datacenter', 'baostock']);
const MAX_MESSAGE_DETAIL_LENGTH = 96;

const truncateMessageDetail = (value: string, maxLength = MAX_MESSAGE_DETAIL_LENGTH) => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
};

const summarizeScreeningDiagnostic = (detail: string, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (/no_json_found|invalid_response|coverage below threshold/i.test(detail)) {
    return L('模型未返回可用的结构化排序结果', 'The model returned no usable structured ranking');
  }
  if (/call_failed/i.test(detail)) {
    return L('模型调用失败', 'The model call failed');
  }
  if (/trade_cal returned no open trading days/i.test(detail)) {
    return L('交易日历暂无可用开市日', 'The trading calendar has no open trading days');
  }
  if (/too many requests|rate limit|http\s*429/i.test(detail)) {
    return L('请求过于频繁', 'Too many requests');
  }
  if (/403 forbidden|forbidden|access denied/i.test(detail)) {
    return L('访问被拒绝', 'Access denied');
  }
  if (/timeout|timed out/i.test(detail)) {
    return L('请求超时', 'Request timed out');
  }
  if (/RemoteDisconnected|Connection aborted|ProtocolError|ConnectionPool|Max retries exceeded|ProxyError|NameResolutionError/i.test(detail)) {
    return L('网络连接中断', 'The network connection dropped');
  }
  if (/missing .*api key|GEMINI_API_KEY|GOOGLE_API_KEY|gemini_api_key/i.test(detail)) {
    return L('缺少可用 LLM API Key', 'No usable LLM API key');
  }
  if (/returned no data|empty/i.test(detail)) {
    return L('未返回可用数据', 'No usable data returned');
  }

  const withoutUrl = detail
    .replace(/https?:\/\/\S+/gi, 'URL')
    .replace(/\bwith url:\s*\S+/gi, 'with url: URL')
    .replace(/\burl:\s*\S+/gi, 'url: URL');
  return truncateMessageDetail(withoutUrl);
};

const parseSourceDiagnostic = (value: string) => {
  const match = value.match(/^([a-zA-Z0-9_-]+)\s*[:：]\s*(.+)$/);
  if (!match) {
    return null;
  }
  return {
    source: match[1],
    detail: match[2],
  };
};

const normalizeScreenMessageKey = (value: string, language: UiLanguage) => {
  const formatted = formatScreenMessage(value, language);
  return formatted ? formatted.trim().toLowerCase() : value.trim().toLowerCase();
};

const formatEnrichmentSummary = (value: string) =>
  value
    .replace(/DSA行情\s*[:：]\s*/gi, '行情：')
    .replace(/DSA新闻\s*[:：]\s*/gi, '新闻：')
    .replace(/DSA事件\s*[:：]\s*/gi, '事件：');

const formatScreenMessage = (value: string, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (/^DSA provider context applied \d+ of \d+ candidates/i.test(value)) {
    return '';
  }
  if (/^LLM ranking skipped:\s*no LLM config/i.test(value)) {
    return L('未配置智能重排模型，当前使用确定性因子排序。', 'No LLM re-ranking model is configured; using deterministic factor ranking.');
  }
  if (/^LLM ranking failed/i.test(value)) {
    return L(
      `未完成智能重排：${summarizeScreeningDiagnostic(value, language)}；当前结果继续使用确定性因子评分。`,
      `LLM re-ranking did not complete: ${summarizeScreeningDiagnostic(value, language)}; results still use deterministic factor scoring.`,
    );
  }
  if (/no_json_found|invalid_response|coverage below threshold|call_failed/i.test(value)) {
    return L(
      `未完成智能重排：${summarizeScreeningDiagnostic(value, language)}；当前结果继续使用确定性因子评分。`,
      `LLM re-ranking did not complete: ${summarizeScreeningDiagnostic(value, language)}; results still use deterministic factor scoring.`,
    );
  }
  if (/^(?:LLM ranking prompt|LLM context) truncated:/i.test(value)) {
    return '';
  }
  if (/^(?:Remote post-analysis cap|Risk veto excluded|Snapshot hard-filter waterfall|Daily hard-filter waterfall|Daily hard-filter rejections|Candidate context collected rows=)/i.test(value)) {
    return '';
  }
  if (/^Daily K-line (?:enrichment attempted|sources|quality flags|source ordering|source health):?/i.test(value)) {
    return '';
  }
  if (/^Daily K-line enrichment row errors:/i.test(value)) {
    return L('部分候选的日线数据未能补齐，结果已按可用数据生成。', 'Daily K-line data could not be completed for some candidates; results use the available data.');
  }
  if (/^Daily K-line enrichment skipped:/i.test(value)) {
    return L('可选日线数据补充未完成，结果已按快照数据生成。', 'Optional daily K-line enrichment was skipped; results use snapshot data.');
  }
  if (/^Candidate context row errors:/i.test(value)) {
    return L('部分候选的辅助数据未能补齐。', 'Supporting data could not be completed for some candidates.');
  }
  if (/^Industry\/concepts enrichment:/i.test(value)) {
    return L('部分行业或题材信息未能补齐。', 'Industry or theme details could not be completed for some candidates.');
  }
  if (/^DSA deep analysis failed for /i.test(value)) {
    return L('部分候选的深度分析未完成。', 'Deep analysis did not complete for some candidates.');
  }

  const snapshotFallback = value.match(/^Snapshot source fallback:\s*(.+)$/i);
  if (snapshotFallback) {
    const parsed = parseSourceDiagnostic(snapshotFallback[1]);
    if (parsed) {
      return L(
        `数据源降级：${parsed.source}（${summarizeScreeningDiagnostic(parsed.detail, language)}）`,
        `Data source degraded: ${parsed.source} (${summarizeScreeningDiagnostic(parsed.detail, language)})`,
      );
    }
    return L(
      `数据源降级：${summarizeScreeningDiagnostic(snapshotFallback[1], language)}`,
      `Data source degraded: ${summarizeScreeningDiagnostic(snapshotFallback[1], language)}`,
    );
  }

  const parsed = parseSourceDiagnostic(value);
  if (parsed && KNOWN_SNAPSHOT_SOURCES.has(parsed.source.toLowerCase())) {
    return L(
      `数据源降级：${parsed.source}（${summarizeScreeningDiagnostic(parsed.detail, language)}）`,
      `Data source degraded: ${parsed.source} (${summarizeScreeningDiagnostic(parsed.detail, language)})`,
    );
  }
  return truncateMessageDetail(value);
};

const getScreenMessages = (meta: ScreeningScreenResponse | null, language: UiLanguage) => {
  if (!meta) {
    return [];
  }
  const messages: string[] = [];
  const seen = new Set<string>();
  [...toMessageList(meta.warnings), ...toMessageList(meta.sourceErrors), ...toMessageList(meta.llmParseErrors)].forEach(
    (value) => {
      const key = normalizeScreenMessageKey(value, language);
      if (seen.has(key)) {
        return;
      }
      const message = formatScreenMessage(value, language);
      if (!message) {
        return;
      }
      seen.add(key);
      messages.push(message);
    },
  );
  return messages;
};

const isRunningScreenTask = (status: string | undefined | null) => status === 'pending' || status === 'processing';

const formatScreenTaskFailure = (value: string | null | undefined, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const text = String(value || '').trim();
  if (!text) {
    return L('选股任务失败，请稍后重试。', 'The screening task failed; try again later.');
  }
  return L(
    `选股任务失败：${summarizeScreeningDiagnostic(text, language)}`,
    `Screening task failed: ${summarizeScreeningDiagnostic(text, language)}`,
  );
};

const SCREENING_HOTSPOT_NO_CACHE_HINT = 'No cached Screening hotspot snapshot. Click refresh to fetch live hotspots.';
const SCREENING_HOTSPOT_UNAVAILABLE_CODE = 'eastmoney_hotspot_unavailable';

const formatHotspotEmptyMessage = (result: ScreeningHotspotsResponse, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const message = String(result.message || '').trim();
  const sourceErrors = result.sourceErrors || [];
  if (message && sourceErrors.includes(SCREENING_HOTSPOT_UNAVAILABLE_CODE)) {
    return message;
  }
  if (message === SCREENING_HOTSPOT_NO_CACHE_HINT) {
    return L('暂无热点缓存', 'No cached hotspots');
  }
  const sourceError = sourceErrors[0];
  if (sourceError) {
    return L(
      `热点题材暂未返回数据：${summarizeScreeningDiagnostic(sourceError, language)}`,
      `Hotspot themes returned no data: ${summarizeScreeningDiagnostic(sourceError, language)}`,
    );
  }
  return L('热点题材暂未返回数据', 'Hotspot themes returned no data');
};

const ScreenAlertMessage: React.FC<{ messages: string[] }> = ({ messages }) => {
  if (messages.length <= 1) {
    return <span>{messages[0]}</span>;
  }
  return (
    <ul className="list-disc space-y-1 pl-4">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
};

const hasLlmInsight = (item: ScreeningCandidate) =>
  Boolean(
    item.llmThesis ||
      item.llmSector ||
      item.llmTheme ||
      item.llmConfidence != null ||
      item.llmWatchItems?.length ||
      item.llmCatalysts?.length,
  );

const getRiskClassName = (riskLevel: string | undefined) => {
  if (riskLevel === 'high') {
    return 'bg-danger/10 text-danger';
  }
  if (riskLevel === 'medium') {
    return 'bg-warning/10 text-warning';
  }
  if (riskLevel === 'low') {
    return 'bg-success/10 text-success';
  }
  return 'bg-surface text-secondary-text';
};

const getRiskLabel = (riskLevel: string | undefined, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (riskLevel === 'high') return L('高', 'High');
  if (riskLevel === 'medium') return L('中', 'Medium');
  if (riskLevel === 'low') return L('低', 'Low');
  return L('待评估', 'Not assessed');
};

const getRouteTimeLabel = (item: ScreeningHotspotDetail['route'][number], language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const rawTime = item.publishedAt || item.date || item.time || '';
  if (!rawTime) {
    return L('时间待确认', 'Time unconfirmed');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawTime)) {
    return rawTime;
  }
  const parsed = new Date(rawTime);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return rawTime;
};

const formatHotspotRouteTitle = (value: string, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const text = String(value || '').trim();
  const normalized = text.toLowerCase();
  if (normalized === 'current fermentation') {
    return L('当前发酵', 'Current fermentation');
  }
  if (normalized === 'news catalyst') {
    return L('消息催化', 'News catalyst');
  }
  return text || L('热点变化', 'Hotspot change');
};

const formatHotspotRouteDescription = (value: string, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const text = String(value || '').trim();
  if (!text) {
    return L('暂无更多说明。', 'No further details.');
  }
  const parts = text.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => /\b(?:heat|stage|leaders?)\b/i.test(part))) {
    const localized = parts.map((part) => {
      const heat = part.match(/^(.*?)\s+heat\s+(-?\d+(?:\.\d+)?)$/i);
      if (heat) {
        return L(`${heat[1]}热度 ${formatNumber(heat[2], 1)}`, `${heat[1]} heat ${formatNumber(heat[2], 1)}`);
      }
      const stage = part.match(/^stage\s+(.+)$/i);
      if (stage) {
        return L(`阶段 ${getHotspotStageLabel(stage[1], language)}`, `Stage ${getHotspotStageLabel(stage[1], language)}`);
      }
      const leaders = part.match(/^leaders?\s+(.+)$/i);
      if (leaders) {
        return L(
          `核心股 ${leaders[1].split(/\s*,\s*/).filter(Boolean).join('、')}`,
          `Leaders ${leaders[1].split(/\s*,\s*/).filter(Boolean).join(', ')}`,
        );
      }
      return part;
    });
    return L(`${localized.join('，')}。`, `${localized.join('; ')}.`);
  }
  if (/Dsa[A-Z]|Provider\b|stock_board_|concept_constituents|leader_stocks|last_good_cache/i.test(text)) {
    return L('热点数据出现新变化。', 'The hotspot data changed.');
  }
  return text;
};

const getHotspotMissingFieldLabels = (values: string[] | undefined, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const labels = (values || []).map((value) => {
    const label = HOTSPOT_MISSING_FIELD_LABELS[String(value).trim().toLowerCase()];
    if (label) {
      return language === 'en' ? label[1] : label[0];
    }
    return L('部分明细', 'Some details');
  });
  return [...new Set(labels)];
};

const formatHotspotDiagnostic = (value: string, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const text = String(value || '').trim();
  const timeoutSeconds = text.match(/timed out after\s*(\d+(?:\.\d+)?)s/i);
  if (timeoutSeconds) {
    return L(
      `热点明细请求超时（${timeoutSeconds[1]} 秒）`,
      `Hotspot detail request timed out (${timeoutSeconds[1]}s)`,
    );
  }
  if (/timeout|timed out/i.test(text)) {
    return L('热点明细请求超时', 'Hotspot detail request timed out');
  }
  if (/RemoteDisconnected|Connection aborted|ProtocolError|ConnectionPool|Max retries exceeded|ProxyError|NameResolutionError/i.test(text)) {
    return L('热点数据源连接中断', 'The hotspot data source connection dropped');
  }
  if (/eastmoney_hotspot_unavailable|returned no data|no live hotspot rows|\bempty\b/i.test(text)) {
    return L('热点数据源暂未返回数据', 'The hotspot data source returned no data');
  }
  if (/rate limit|too many requests|http\s*429/i.test(text)) {
    return L('热点数据请求过于频繁', 'Too many hotspot data requests');
  }
  if (/Dsa[A-Z]|Provider\b|stock_board_|concept_constituents|leader_stocks|last_good_cache|^[a-z0-9_.:-]+$/i.test(text)) {
    return L('部分热点数据暂不可用', 'Some hotspot data is temporarily unavailable');
  }
  if (/[\u0080-\uFFFF]/.test(text)) {
    return truncateMessageDetail(text);
  }
  return L('部分热点数据暂不可用', 'Some hotspot data is temporarily unavailable');
};

const getHotspotDiagnosticMessages = (values: string[] | undefined, language: UiLanguage) =>
  [...new Set((values || []).map((value) => formatHotspotDiagnostic(value, language)).filter(Boolean))].slice(0, 4);

const hasHotspotDetailDegradation = (detail: ScreeningHotspotDetail) => {
  if ((detail.missingFields || []).length > 0) {
    return true;
  }
  const qualityStatus = String(detail.qualityStatus || '').trim().toLowerCase();
  if (qualityStatus) {
    return qualityStatus !== 'available';
  }
  return (detail.sourceErrors || []).length > 0;
};

const getHotspotFallbackLabel = (detail: ScreeningHotspotDetail, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (detail.stale || detail.cacheUsed) {
    return detail.staleAgeHours != null
      ? L(`缓存回退 ${formatNumber(detail.staleAgeHours, 1)}h`, `Cache fallback ${formatNumber(detail.staleAgeHours, 1)}h`)
      : L('缓存回退', 'Cache fallback');
  }
  return L('备用数据源', 'Fallback data source');
};

const getHotspotSummaryText = (detail: ScreeningHotspotDetail, hotspot: ScreeningHotspot | undefined, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const summaryDetail = detail.summaryDetail || {};
  const heatScore = summaryDetail.heatScore ?? summaryDetail.heat_score ?? hotspot?.heatScore;
  const stage = summaryDetail.stage ?? hotspot?.stage ?? hotspot?.state;
  const rawLeaders = summaryDetail.leaders ?? hotspot?.leaders;
  const leaders = Array.isArray(rawLeaders)
    ? rawLeaders.map((value) => String(value).trim()).filter(Boolean).slice(0, 3)
    : [];
  const parts: string[] = [];
  if (heatScore != null && !Number.isNaN(Number(heatScore))) {
    parts.push(L(`热度 ${formatNumber(heatScore, 1)}`, `Heat ${formatNumber(heatScore, 1)}`));
  }
  if (stage) {
    parts.push(L(`阶段 ${getHotspotStageLabel(stage, language)}`, `Stage ${getHotspotStageLabel(stage, language)}`));
  }
  if (leaders.length > 0) {
    parts.push(L(`核心股 ${leaders.join('、')}`, `Leaders ${leaders.join(', ')}`));
  }
  if (parts.length > 0) {
    return L(
      `${detail.name || detail.canonicalTopic || detail.topic}：${parts.join('，')}。`,
      `${detail.name || detail.canonicalTopic || detail.topic}: ${parts.join('; ')}.`,
    );
  }
  const summary = String(detail.summary || '').trim();
  if (summary && !/\b(?:heat|stage|leaders?|quality status|available|partial|stale|failed)\b|Dsa[A-Z]|Provider\b|stock_board_/i.test(summary)) {
    return summary;
  }
  return L('已加载热点详情。', 'Hotspot details loaded.');
};

const buildHotspotPreviewDetail = (hotspot: ScreeningHotspot, language: UiLanguage): ScreeningHotspotDetail => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const leaders = (hotspot.leaders || []).map((value) => String(value).trim()).filter(Boolean);
  const stage = getHotspotStageLabel(hotspot.stage || hotspot.state, language);
  const descriptionParts = [
    L(
      `${hotspot.name || hotspot.topic}热度 ${formatHotspotMetric(hotspot.heatScore, language)}`,
      `${hotspot.name || hotspot.topic} heat ${formatHotspotMetric(hotspot.heatScore, language)}`,
    ),
  ];
  if (stage) {
    descriptionParts.push(L(`阶段 ${stage}`, `Stage ${stage}`));
  }
  if (leaders.length > 0) {
    descriptionParts.push(L(`核心股 ${leaders.slice(0, 3).join('、')}`, `Leaders ${leaders.slice(0, 3).join(', ')}`));
  }
  const stocks = (hotspot.leaderStocks || []).slice(0, 10);
  return {
    enabled: true,
    provider: 'akshare',
    topic: hotspot.topic,
    name: hotspot.name || hotspot.topic,
    canonicalTopic: hotspot.topic,
    summaryDetail: {
      heatScore: hotspot.heatScore,
      stage: hotspot.stage || hotspot.state,
      leaders,
    },
    route: [{
      title: L('当前发酵', 'Current fermentation'),
      description: L(`${descriptionParts.join('，')}。`, `${descriptionParts.join('; ')}.`),
    }],
    stocks,
    stockCount: hotspot.sampleStockCount ?? stocks.length,
    sourceErrors: hotspot.sourceErrors,
    qualityStatus: hotspot.qualityStatus,
    missingFields: hotspot.missingFields,
    fallbackUsed: hotspot.fallbackUsed,
    stale: hotspot.stale,
    staleAgeHours: hotspot.staleAgeHours,
    cacheUsed: hotspot.cacheUsed,
    cachedAt: hotspot.cachedAt,
  };
};

const stripHotspotSearchAugmentation = (detail: ScreeningHotspotDetail): ScreeningHotspotDetail => {
  const baseDetail: ScreeningHotspotDetail = {
    ...detail,
    route: (detail.route || []).filter((item) => !item.searchResult),
    ...(detail.timeline
      ? { timeline: detail.timeline.filter((item) => !item.searchResult) }
      : {}),
  };
  delete baseDetail.newsSearchRequested;
  delete baseDetail.newsSearchStatus;
  return baseDetail;
};

const stripHotspotSearchAugmentationByTopic = (
  details: Record<string, ScreeningHotspotDetail>,
) => Object.fromEntries(
  Object.entries(details).map(([topic, detail]) => [topic, stripHotspotSearchAugmentation(detail)]),
) as Record<string, ScreeningHotspotDetail>;

const getHotspotRouteItems = (detail: ScreeningHotspotDetail) => {
  const route = detail.route || [];
  if (route.length > 0) {
    return route;
  }
  return detail.timeline || [];
};

const formatHotspotMetric = (value: unknown, language: UiLanguage, digits = 1) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const formatted = formatNumber(value, digits);
  return formatted === '-' ? L('观察中', 'Watching') : formatted;
};

const getHotspotLeadersText = (item: ScreeningHotspot, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const leaders = (item.leaders || []).map((value) => String(value).trim()).filter(Boolean);
  if (leaders.length > 0) {
    return leaders.slice(0, 2).join(L('、', ', '));
  }
  return L('观察中', 'Watching');
};

const getHotspotSampleText = (item: ScreeningHotspot, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (item.sampleStockCount == null || Number.isNaN(Number(item.sampleStockCount))) {
    return L('活跃股观察中', 'Watching active stocks');
  }
  return L(`覆盖 ${item.sampleStockCount} 股`, `Covering ${item.sampleStockCount} stocks`);
};

const formatStockChangeText = (value: unknown, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const formatted = formatNumber(value);
  return formatted === '-' ? L('暂无行情', 'No quote') : `${formatted}%`;
};

const formatHotspotUpdatedAt = (value: string | null, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  if (!value) {
    return L('待刷新', 'Pending refresh');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getHotspotStrength = (item: ScreeningHotspot, index: number, language: UiLanguage) => {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const heat = Number(item.heatScore ?? 0);
  const changePct = Number(item.changePct ?? 0);
  if (index === 0 || heat >= 90 || changePct >= 8) {
    return { label: L('强势领先', 'Leading strength'), className: 'bg-red-500/10 text-red-500' };
  }
  if (heat >= 80 || changePct >= 5) {
    return { label: L('强势', 'Strong'), className: 'bg-blue-500/10 text-blue-500' };
  }
  return { label: L('较强', 'Firm'), className: 'bg-cyan/10 text-cyan' };
};

const HOTSPOT_ICON_RULES: Array<{
  pattern: RegExp;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = [
  { pattern: /金|银|铜|铝|铅|锌|钼|钴|镍|贵金属|矿|有色/, icon: Pickaxe, className: 'bg-orange-500/10 text-orange-500' },
  { pattern: /黄金|珠宝/, icon: Gem, className: 'bg-amber-500/10 text-amber-500' },
  { pattern: /油|气|能源|煤/, icon: Droplet, className: 'bg-yellow-700/10 text-yellow-700' },
  { pattern: /金融|券商|银行|保险|资本/, icon: Landmark, className: 'bg-orange-500/10 text-orange-500' },
  { pattern: /航空|机场|航天|运输/, icon: Plane, className: 'bg-blue-500/10 text-blue-500' },
  { pattern: /林业|农业|种植/, icon: Trees, className: 'bg-emerald-500/10 text-emerald-500' },
  { pattern: /医疗|诊断|卫生|医药/, icon: Stethoscope, className: 'bg-teal-500/10 text-teal-500' },
  { pattern: /食品|餐饮|酒/, icon: Utensils, className: 'bg-violet-500/10 text-violet-500' },
  { pattern: /工业|制造|修理|机械|设备/, icon: Wrench, className: 'bg-blue-500/10 text-blue-500' },
  { pattern: /租赁|地产|建筑/, icon: Building2, className: 'bg-emerald-500/10 text-emerald-500' },
  { pattern: /电|芯片|算力|AI|机器人/, icon: Factory, className: 'bg-indigo-500/10 text-indigo-500' },
  { pattern: /保险|安全/, icon: Shield, className: 'bg-blue-500/10 text-blue-500' },
];

const getHotspotIcon = (topic: string) => {
  const match = HOTSPOT_ICON_RULES.find((rule) => rule.pattern.test(topic));
  return match || { icon: Activity, className: 'bg-cyan/10 text-cyan' };
};

const MiniSparkline: React.FC<{ score?: number | null; selected?: boolean }> = ({ score, selected }) => {
  const normalizedScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 65;
  const lift = Math.max(0, Math.min(16, normalizedScore / 7));
  const path = `M2 35 C12 ${32 - lift / 4}, 16 ${34 - lift / 2}, 24 ${28 - lift / 3} S38 ${29 - lift}, 46 ${23 - lift / 2} S62 ${24 - lift}, 72 ${16 - lift / 3} S86 ${15 - lift}, 94 ${7}`;
  return (
    <svg className="h-8 w-20" viewBox="0 0 96 40" aria-hidden="true">
      <path d={`${path} L94 40 L2 40 Z`} fill={selected ? 'rgba(249,115,22,0.14)' : 'rgba(59,130,246,0.12)'} />
      <path d={path} fill="none" stroke={selected ? '#f97316' : '#3b82f6'} strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
};

const StockScreeningPage: React.FC = () => {
  const { language } = useUiLanguage();
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const navigate = useNavigate();
  const [restoredTask] = useState<PersistedScreenTask | null>(() => readPersistedScreenTask());
  const [statusState, setStatusState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [statusError, setStatusError] = useState('');
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [market, setMarket] = useState(restoredTask?.market || 'cn');
  const [strategy, setStrategy] = useState(restoredTask?.strategy || 'dual_low');
  const [strategies, setStrategies] = useState<ScreeningStrategy[]>([]);
  const [maxResults, setMaxResults] = useState(restoredTask?.maxResults || 3);
  const [candidates, setCandidates] = useState<ScreeningCandidate[]>([]);
  const [hotspots, setHotspots] = useState<ScreeningHotspot[]>([]);
  const [hotspotsUpdatedAt, setHotspotsUpdatedAt] = useState<string | null>(null);
  const [hotspotsExpanded, setHotspotsExpanded] = useState(false);
  const [selectedHotspotTopic, setSelectedHotspotTopic] = useState<string | null>(null);
  const selectedHotspotTopicRef = useRef<string | null>(null);
  const hotspotDetailRequestIdRef = useRef(0);
  const hotspotDetailsByTopicRef = useRef<Record<string, ScreeningHotspotDetail>>({});
  const historyRunRequestIdRef = useRef(0);
  const [hotspotDetail, setHotspotDetail] = useState<ScreeningHotspotDetail | null>(null);
  const [loadingHotspotDetail, setLoadingHotspotDetail] = useState(false);
  const [searchingHotspotNews, setSearchingHotspotNews] = useState(false);
  const [hotspotDetailError, setHotspotDetailError] = useState('');
  const [loadingHotspots, setLoadingHotspots] = useState(false);
  const [hotspotError, setHotspotError] = useState('');
  const [screenMeta, setScreenMeta] = useState<ScreeningScreenResponse | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(restoredTask?.taskId));
  const [enabling, setEnabling] = useState(false);
  const [historyRuns, setHistoryRuns] = useState<ScreeningRunSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [restoreResolved, setRestoreResolved] = useState(() => !restoredTask?.runId);
  // 标记当前 strategy 是否来自历史 run（刷新自动恢复或手动历史选择）的上下文同步。
  // 为 true 时 loadStrategies 跳过“不在列表则回退第一项”的归一化，
  // 防止迟到的 /strategies 响应把历史上下文改写回默认策略。
  const historyContextStrategyRef = useRef(false);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [error, setError] = useState('');
  const [strategyLoadError, setStrategyLoadError] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(restoredTask?.taskId ?? null);
  const [taskProgress, setTaskProgress] = useState(restoredTask?.taskId ? 10 : 0);
  const [taskMessage, setTaskMessage] = useState(
    restoredTask?.taskId ? L('正在恢复选股任务状态...', 'Restoring screening task status...') : '',
  );

  const selectedStrategy = useMemo(() => strategies.find((item) => item.id === strategy), [strategies, strategy]);
  const selectedStrategyTitle = selectedStrategy?.name || selectedStrategy?.title || L('自定义策略', 'Custom strategy');
  const selectedStrategyTag = formatStrategyCategory(
    selectedStrategy?.category || selectedStrategy?.tag || selectedStrategy?.tags?.[0],
    language,
  );
  const displayedStrategy = selectedStrategy
    ? selectedStrategyTitle
    : L(`自定义策略 (${strategy})`, `Custom strategy (${strategy})`);
  const screenMessages = useMemo(() => getScreenMessages(screenMeta, language), [screenMeta, language]);
  const selectedHotspot = useMemo(
    () => hotspots.find((item) => item.topic === selectedHotspotTopic),
    [hotspots, selectedHotspotTopic],
  );
  const factorRanking = Boolean(screenMeta && (screenMeta.rankingMode === 'factor' || screenMeta.llmRanked === false));
  const llmFailed = Boolean(factorRanking && screenMeta?.llmFailureReason);
  const alertMessages = llmFailed
    ? screenMessages.length > 0
      ? screenMessages
      : [L('智能重排未完成，当前候选继续使用确定性因子评分。', 'LLM re-ranking did not complete; candidates still use deterministic factor scoring.')]
    : screenMessages;
  const isScreeningEnabled = statusState === 'ready' && enabled && available;
  const statusText = statusState === 'loading'
    ? L('正在检查选股状态', 'Checking screening status')
    : statusState === 'error'
      ? L('选股状态未知', 'Screening status unknown')
      : !enabled
        ? L('选股未开启', 'Screening is off')
        : available ? L('选股已开启', 'Screening is on') : L('选股功能不可用', 'Screening is unavailable');

  const applyScreenResult = useCallback((result: ScreeningScreenResponse) => {
    const nextCandidates = result.candidates || [];
    setScreenMeta(result);
    setCandidates(nextCandidates);
    setExpandedCode(nextCandidates[0]?.code ?? null);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const result = await screeningApi.getHistory({ limit: 10 });
      setHistoryRuns(result.runs || []);
    } catch (err) {
      setHistoryError(toApiErrorMessage(err, L('历史记录加载失败', 'Failed to load history')));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleHistoryRunSelect = useCallback(async (runId: string) => {
    // 竞态防护：快速切换历史条目时，只应用最新一次请求的响应
    const requestId = historyRunRequestIdRef.current + 1;
    historyRunRequestIdRef.current = requestId;
    const isCurrentRequest = () => historyRunRequestIdRef.current === requestId;
    // 与运行中的选股任务互斥：手动选择历史记录后，暂停/取消后台任务轮询，
    // 避免任务完成后把当前任务的候选结果回写到历史上下文中。
    setActiveTaskId(null);
    setHistoryError('');
    setLoading(true);
    try {
      const detail = await screeningApi.getRun(runId);
      if (!isCurrentRequest()) {
        return;
      }
      if (detail?.result) {
        applyScreenResult(detail.result);
        historyContextStrategyRef.current = true;
        // 同步持久化恢复指针：刷新后应恢复用户刚选中的历史 run，
        // 而不是停留在更早的 task/run。历史详情不携带 taskId，以 runId
        // 作为占位——正常路径刷新走 getRun(runId) 恢复、不会触发轮询；
        // 若该 run 恢复失败，占位轮询会命中不可恢复错误并清理过期指针。
        persistScreenTask({
          taskId: runId,
          runId,
          market: detail.market || market,
          strategy: detail.strategy || strategy,
          maxResults,
        });
        // 同步历史 run 的策略与市场上下文，确保结果区文案和后续深度分析
        // 使用该历史 run 对应的 strategy/market，而不是当前表单的选择
        if (detail.strategy) {
          setStrategy(detail.strategy);
        }
        if (detail.market) {
          setMarket(detail.market);
        }
        setError('');
        setTaskProgress(100);
        setTaskMessage(L('已加载历史选股结果', 'Loaded historical screening results'));
      } else {
        setError(L('历史记录中未找到该次运行的结果。', 'No results found for that run in the history.'));
      }
    } catch (err) {
      if (!isCurrentRequest()) {
        return;
      }
      setError(toApiErrorMessage(err, L('历史结果加载失败', 'Failed to load historical results')));
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [applyScreenResult, market, maxResults, strategy]);

  const clearScreeningResults = () => {
    setCandidates([]);
    setScreenMeta(null);
    setExpandedCode(null);
  };

  const loadHotspotDetail = useCallback(async (
    topic: string,
    options: { refresh?: boolean; includeSearch?: boolean } = {},
  ) => {
    if (!topic) {
      return;
    }
    const cachedDetail = !options.refresh && !options.includeSearch
      ? hotspotDetailsByTopicRef.current[topic]
      : null;
    if (cachedDetail) {
      setHotspotDetail(cachedDetail);
      setHotspotDetailError('');
      setLoadingHotspotDetail(false);
      return;
    }
    const requestId = hotspotDetailRequestIdRef.current + 1;
    hotspotDetailRequestIdRef.current = requestId;
    const isCurrentRequest = () => hotspotDetailRequestIdRef.current === requestId;
    const canApplyRequest = () => isCurrentRequest() && selectedHotspotTopicRef.current === topic;
    setLoadingHotspotDetail(!options.includeSearch);
    setSearchingHotspotNews(Boolean(options.includeSearch));
    setHotspotDetail((currentDetail) => (currentDetail?.topic === topic ? currentDetail : null));
    setHotspotDetailError('');
    try {
      const detail = await screeningApi.getHotspotDetail({
        topic,
        provider: 'akshare',
        refresh: options.refresh ?? false,
        ...(options.includeSearch ? { includeSearch: true } : {}),
      });
      if (!canApplyRequest()) {
        return;
      }
      const cacheableDetail = options.includeSearch
        ? hotspotDetailsByTopicRef.current[topic] || stripHotspotSearchAugmentation(detail)
        : stripHotspotSearchAugmentation(detail);
      hotspotDetailsByTopicRef.current = {
        ...hotspotDetailsByTopicRef.current,
        [topic]: cacheableDetail,
      };
      setHotspotDetail(options.includeSearch ? detail : cacheableDetail);
      if (options.includeSearch && detail.newsSearchStatus === 'no_results') {
        setHotspotDetailError(L('暂未搜到该题材近期的有效消息。', 'No recent relevant news found for this theme.'));
      } else if (options.includeSearch && detail.newsSearchStatus !== 'available') {
        setHotspotDetailError(L('消息搜索失败，请稍后重试。', 'News search failed; try again later.'));
      }
    } catch (err) {
      if (!canApplyRequest()) {
        return;
      }
      if (!options.includeSearch) {
        setHotspotDetail(null);
      }
      setHotspotDetailError(toApiErrorMessage(
        err,
        options.includeSearch
          ? L('消息搜索失败，请稍后重试。', 'News search failed; try again later.')
          : L('热点题材详情加载失败，请稍后重试。', 'Failed to load hotspot theme details; try again later.'),
      ));
    } finally {
      if (isCurrentRequest()) {
        setLoadingHotspotDetail(false);
        setSearchingHotspotNews(false);
      }
    }
  }, []);

  const loadStrategies = useCallback(async () => {
    setLoadingStrategies(true);
    try {
      setStrategyLoadError('');
      const result = await screeningApi.getStrategies();
      const loadedStrategies = result.strategies || [];
      setStrategies(loadedStrategies);
      // 历史 run 的自定义/下线策略不在当前列表属预期行为，不做“回退第一项”的归一化，
      // 否则迟到的策略列表会把刚恢复好的上下文改写回默认策略。
      if (loadedStrategies.length > 0 && !historyContextStrategyRef.current) {
        setStrategy((currentStrategy) =>
          loadedStrategies.some((item) => item.id === currentStrategy) ? currentStrategy : loadedStrategies[0].id,
        );
      }
    } catch (err) {
      setStrategies([]);
      setStrategyLoadError(err instanceof Error ? err.message : L('策略列表加载失败', 'Failed to load the strategy list'));
    } finally {
      setLoadingStrategies(false);
    }
  }, []);

  const loadHotspots = useCallback(async (refresh = false) => {
    setLoadingHotspots(true);
    setHotspotError('');
    try {
      const result = await screeningApi.getHotspots({ provider: 'akshare', top: 12, refresh });
      const nextHotspots = result.hotspots || [];
      const nextDetails = stripHotspotSearchAugmentationByTopic(result.details || {});
      hotspotDetailsByTopicRef.current = {
        ...hotspotDetailsByTopicRef.current,
        ...nextDetails,
      };
      const currentTopic = selectedHotspotTopicRef.current;
      const retainedTopic = Boolean(currentTopic && nextHotspots.some((item) => item.topic === currentTopic));
      const nextTopic = retainedTopic ? currentTopic : null;
      setHotspots(nextHotspots);
      setHotspotsUpdatedAt(result.cachedAt || (nextHotspots.length > 0 ? new Date().toISOString() : null));
      setSelectedHotspotTopic(nextTopic);
      selectedHotspotTopicRef.current = nextTopic;
      setHotspotDetailError('');
      if (nextTopic && nextDetails[nextTopic]) {
        setHotspotDetail(nextDetails[nextTopic]);
        setLoadingHotspotDetail(false);
      } else if (!retainedTopic) {
        setHotspotDetail(null);
      } else if (refresh && nextTopic) {
        // A refreshed list and a retained detail must describe the same source
        // snapshot. The list endpoint intentionally omits details by default,
        // so explicitly bypass the detail cache for the retained topic.
        await loadHotspotDetail(nextTopic, { refresh: true });
      }
      if (nextHotspots.length === 0) {
        setHotspotError(formatHotspotEmptyMessage(result, language));
      }
    } catch (err) {
      setHotspotError(toApiErrorMessage(err, L('热点题材加载失败，请稍后重试。', 'Failed to load hotspot themes; try again later.')));
    } finally {
      setLoadingHotspots(false);
    }
  }, [loadHotspotDetail]);

  const handleHotspotSelect = useCallback((topic: string) => {
    selectedHotspotTopicRef.current = topic;
    setSelectedHotspotTopic(topic);
    const cachedDetail = hotspotDetailsByTopicRef.current[topic];
    if (cachedDetail) {
      setHotspotDetail(cachedDetail);
      setHotspotDetailError('');
      setLoadingHotspotDetail(false);
    } else {
      const preview = hotspots.find((item) => item.topic === topic);
      setHotspotDetail((currentDetail) => (
        currentDetail?.topic === topic ? currentDetail : preview ? buildHotspotPreviewDetail(preview, language) : null
      ));
    }
  }, [hotspots, language]);

  const toggleHotspotsExpanded = useCallback(() => {
    setHotspotsExpanded((expanded) => {
      const nextExpanded = !expanded;
      if (!nextExpanded) {
        selectedHotspotTopicRef.current = null;
        setSelectedHotspotTopic(null);
        setHotspotDetail(null);
        setHotspotDetailError('');
      }
      return nextExpanded;
    });
  }, []);

  const handleAnalyzeHotspotStock = useCallback((stock: ScreeningHotspotDetail['stocks'][number]) => {
    const stockCode = String(stock.code || '').trim();
    if (!stockCode) {
      return;
    }
    const stockName = String(stock.name || stockCode).trim();
    navigate('/', {
      state: {
        stockCode,
        stockName,
        autoAnalyze: true,
        selectionSource: 'screening_hotspot',
        skills: ['hot_theme'],
      },
    });
  }, [navigate]);

  const handleAnalyzeCandidate = useCallback((candidate: ScreeningCandidate) => {
    const stockCode = String(candidate.code || '').trim();
    if (!stockCode) {
      return;
    }
    const stockName = String(candidate.name || stockCode).trim();
    const analysisSkills = (selectedStrategy?.analysisSkills || []).filter(Boolean);
    navigate('/', {
      state: {
        stockCode,
        stockName,
        autoAnalyze: true,
        selectionSource: 'screening_result',
        ...(analysisSkills.length > 0 ? { skills: analysisSkills } : {}),
      },
    });
  }, [navigate, selectedStrategy]);

  useEffect(() => {
    selectedHotspotTopicRef.current = selectedHotspotTopic;
  }, [selectedHotspotTopic]);

  useEffect(() => {
    if (!selectedHotspotTopic) {
      return;
    }
    void loadHotspotDetail(selectedHotspotTopic);
  }, [loadHotspotDetail, selectedHotspotTopic]);

  useEffect(() => {
    let active = true;
    screeningApi
      .getStatus()
      .then((status) => {
        if (!active) {
          return;
        }
        setEnabled(status.enabled);
        setAvailable(status.available);
        setStatusState('ready');
        if (status.enabled && status.available) {
          void loadStrategies();
          void loadHotspots(false);
          void loadHistory();
        }
      })
      .catch((err) => {
        if (active) {
          setStatusError(toApiErrorMessage(err, L('无法确认选股状态，请重试。', 'Unable to confirm screening status; try again.')));
          setStatusState('error');
        }
      });
    return () => {
      active = false;
    };
  }, [loadHistory, loadHotspots, loadStrategies, statusAttempt]);

  // 刷新后优先从 history API 按 run_id 恢复结果；恢复失败再回退到 task 轮询
  useEffect(() => {
    const runId = restoredTask?.runId;
    if (!runId) {
      setRestoreResolved(true);
      return undefined;
    }
    let active = true;
    setLoading(true);
    // 记录自动恢复的请求基准：若在自动恢复返回前用户手动点开了历史记录
    // （historyRunRequestIdRef 被 handleHistoryRunSelect 递增），则放弃本次自动恢复响应，
    // 避免较晚返回的自动恢复把页面切回旧 run，覆盖用户最新一次的历史选择。
    const restoreRequestBase = historyRunRequestIdRef.current;
    screeningApi
      .getRun(runId)
      .then((detail) => {
        if (!active || historyRunRequestIdRef.current !== restoreRequestBase) {
          return;
        }
        if (detail?.result) {
          applyScreenResult(detail.result);
          historyContextStrategyRef.current = true;
          // 同步恢复该历史 run 的策略与市场上下文，避免结果区展示和
          // 深度分析沿用当前表单策略（与 handleHistoryRunSelect 一致）
          if (detail.strategy) {
            setStrategy(detail.strategy);
          }
          if (detail.market) {
            setMarket(detail.market);
          }
          setError('');
          setTaskProgress(100);
          setTaskMessage(L('已从历史记录恢复上次选股结果', 'Restored the previous screening results from history'));
          setActiveTaskId(null);
        }
      })
      .catch(() => {
        // 历史记录恢复失败（run 不存在或服务重启），回退到 task 轮询；
        // 若用户已手动选择了历史记录，则不再回退，保持用户的选择。
        if (active && historyRunRequestIdRef.current === restoreRequestBase) {
          setActiveTaskId(restoredTask?.taskId ?? null);
        }
      })
      .finally(() => {
        // 无论结果是否过期都要解除自动恢复门闩，否则新任务的轮询会被阻塞到旧请求超时。
        if (active) {
          setRestoreResolved(true);
        }
        // 过期的自动恢复不得触碰共享 loading：用户手动选择的历史详情请求可能仍在飞行，
        // 提前清掉会重新放开“运行选股”入口，随后迟到的历史响应会覆盖新任务状态。
        if (active && historyRunRequestIdRef.current === restoreRequestBase) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [applyScreenResult, restoredTask]);

  useEffect(() => {
    if (!activeTaskId || !restoreResolved) {
      return undefined;
    }

    const pollingTaskId = activeTaskId;
    let active = true;
    let timer: ReturnType<typeof window.setTimeout> | undefined;

    function finishTask() {
      setActiveTaskId(null);
      setLoading(false);
    }

    function applyTaskStatus(task: ScreeningScreenTaskStatus) {
      const nextProgress = Number(task.progress ?? 0);
      setTaskProgress(Number.isFinite(nextProgress) ? nextProgress : 0);
      setTaskMessage(task.message || '');

      if (task.status === 'completed') {
        if (task.result) {
          applyScreenResult(task.result);
          setError('');
          // 持久化 runId：刷新后优先从 history API 恢复结果，而非依赖内存 task
          const completedRunId = task.result.runId || screenMeta?.runId;
          if (completedRunId) {
            persistScreenTask({
              taskId: pollingTaskId,
              runId: completedRunId,
              market,
              strategy,
              maxResults,
            });
          }
        } else {
          setError(L('选股任务已完成，但服务端未返回候选结果。', 'The screening task completed but the server returned no candidates.'));
          setCandidates([]);
          setScreenMeta(null);
        }
        finishTask();
        return;
      }

      if (task.status === 'failed') {
        setCandidates([]);
        setScreenMeta(null);
        setExpandedCode(null);
        setError(formatScreenTaskFailure(task.error || task.message, language));
        clearPersistedScreenTask();
        finishTask();
        return;
      }

      if (isRunningScreenTask(task.status)) {
        setLoading(true);
        timer = window.setTimeout(pollTask, SCREEN_TASK_POLL_INTERVAL_MS);
        return;
      }

      setError(L(
        `选股任务返回未知状态：${task.status || 'unknown'}`,
        `The screening task returned an unknown status: ${task.status || 'unknown'}`,
      ));
      clearPersistedScreenTask();
      finishTask();
    }

    async function pollTask() {
      try {
        const task = await screeningApi.getScreenTask(pollingTaskId);
        if (!active) {
          return;
        }
        applyTaskStatus(task);
      } catch (err) {
        if (!active) {
          return;
        }
        const parsedError = getParsedApiError(err);
        if (isUnrecoverableScreenTaskError(parsedError)) {
          setError(formatParsedApiError(parsedError) || L('选股任务不可恢复，请重新提交。', 'The screening task cannot be recovered; please submit it again.'));
          setCandidates([]);
          setScreenMeta(null);
          clearPersistedScreenTask();
          finishTask();
          return;
        }
        setError(formatRecoverableScreenTaskPollingError(parsedError, language));
        setLoading(true);
        timer = window.setTimeout(pollTask, SCREEN_TASK_POLL_INTERVAL_MS);
      }
    }

    void pollTask();

    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [activeTaskId, applyScreenResult, restoreResolved]);

  const handleEnable = async () => {
    setEnabling(true);
    setError('');
    try {
      await screeningApi.enable();
      setEnabled(true);
      setAvailable(true);
      await loadStrategies();
    } catch (err) {
      try {
        const status = await screeningApi.getStatus();
        setEnabled(status.enabled);
        setAvailable(status.available);
        setStatusState('ready');
      } catch (statusErr) {
        setStatusError(toApiErrorMessage(statusErr, L('无法确认选股状态，请重试。', 'Unable to confirm screening status; try again.')));
        setStatusState('error');
      }
      setError(err instanceof Error ? err.message : L('开启选股失败', 'Failed to enable screening'));
    } finally {
      setEnabling(false);
    }
  };

  const handleStrategyChange = (nextStrategy: string) => {
    if (nextStrategy !== strategy) {
      clearScreeningResults();
    }
    setStrategy(nextStrategy);
  };

  const handleMarketChange = (nextMarket: string) => {
    if (nextMarket !== market) {
      clearScreeningResults();
    }
    setMarket(nextMarket);
  };

  const handleMaxResultsChange = (nextMaxResults: number) => {
    if (nextMaxResults !== maxResults) {
      clearScreeningResults();
    }
    setMaxResults(nextMaxResults);
  };

  const handleSubmit = async () => {
    // 新任务提交即代表用户放弃当前历史/恢复上下文：
    // 递增请求代号作废飞行中的历史详情与自动恢复响应；
    // 解除自动恢复门闩，保证刚提交的任务轮询立即可启动。
    historyRunRequestIdRef.current += 1;
    setRestoreResolved(true);
    setLoading(true);
    setError('');
    setScreenMeta(null);
    setTaskProgress(0);
    setTaskMessage(L('正在提交选股任务...', 'Submitting the screening task...'));
    try {
      const task = await screeningApi.startScreen({ market, strategy, maxResults });
      persistScreenTask({
        taskId: task.taskId,
        market,
        strategy,
        maxResults,
      });
      setActiveTaskId(task.taskId);
      setTaskProgress(0);
      setTaskMessage(task.message || L('选股任务已提交', 'Screening task submitted'));
    } catch (err) {
      setCandidates([]);
      setLoading(false);
      setError(toApiErrorMessage(err, L('选股任务提交失败，请稍后重试。', 'Failed to submit the screening task; try again later.')));
    }
  };

  return (
    <AppPage className="max-w-6xl space-y-6 pb-12 pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-cyan text-cyan shadow-[0_0_24px_hsl(var(--primary)/0.18)]">
            <PlusCircle className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold tracking-normal text-foreground">{L('选股', 'Screening')}</h1>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-border/70 bg-card/80 px-4 py-2 text-sm shadow-soft-card">
          <span className={`h-2.5 w-2.5 rounded-full ${isScreeningEnabled ? 'bg-success' : 'bg-warning'}`} />
          <span className="font-medium text-secondary-text">{statusText}</span>
        </div>
      </div>

      {statusState === 'loading' ? (
        <InlineAlert variant="info" message={L('正在读取选股配置，请稍候。', 'Loading the screening configuration, please wait.')} />
      ) : null}

      {statusState === 'error' ? (
        <InlineAlert
          variant="warning"
          title={L('选股状态加载失败', 'Failed to load screening status')}
          message={statusError}
          action={
            <Button size="sm" onClick={() => {
              setStatusState('loading');
              setStatusError('');
              setStatusAttempt((attempt) => attempt + 1);
            }}>
              {L('重试', 'Retry')}
            </Button>
          }
        />
      ) : null}

      {statusState === 'ready' && !enabled ? (
        <InlineAlert
          variant="info"
          title={L('选股未开启', 'Screening is off')}
          message={L('开启后即可运行选股策略。', 'Enable it to run screening strategies.')}
          action={
            <Button
              size="sm"
              isLoading={enabling}
              loadingText={L('开启中...', 'Enabling...')}
              onClick={() => void handleEnable()}
            >
              {L('开启选股', 'Enable screening')}
            </Button>
          }
        />
      ) : null}

      {statusState === 'ready' && enabled && !available ? (
        <InlineAlert
          variant="warning"
          title={L('选股功能不可用', 'Screening is unavailable')}
          message={L('请检查后端日志、策略文件和基础数据依赖后重启服务。', 'Check the backend logs, strategy files and base data dependencies, then restart the service.')}
        />
      ) : null}

      {error ? <InlineAlert variant="danger" title={L('调用失败', 'Request failed')} message={error} /> : null}

      <section className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-soft-card">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-500/10 text-orange-500 shadow-[0_10px_30px_rgba(249,115,22,0.16)]">
              <Flame className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold tracking-normal text-foreground">{L('热点题材', 'Hotspot themes')}</h2>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!isScreeningEnabled}
                onClick={toggleHotspotsExpanded}
              >
                <Bookmark className="h-4 w-4" />
                {hotspotsExpanded
                  ? L('收起热点题材', 'Collapse hotspot themes')
                  : L(
                    `展开热点题材${hotspots.length ? `（${hotspots.length}）` : ''}`,
                    `Expand hotspot themes${hotspots.length ? ` (${hotspots.length})` : ''}`,
                  )}
                <ChevronDown className={`h-4 w-4 transition-transform ${hotspotsExpanded ? 'rotate-180' : ''}`} />
              </Button>
              {hotspotsExpanded ? (
              <Button
                size="sm"
                variant="secondary"
                isLoading={loadingHotspots}
                loadingText={L('刷新中...', 'Refreshing...')}
                disabled={!isScreeningEnabled || loadingHotspots}
                onClick={() => void loadHotspots(true)}
              >
                <RefreshCw className="h-4 w-4" />
                {L('刷新热点题材', 'Refresh hotspot themes')}
              </Button>
              ) : null}
            </div>
            {hotspotsUpdatedAt ? (
              <p className="text-xs text-secondary-text">
                {L('更新于', 'Updated')} {formatHotspotUpdatedAt(hotspotsUpdatedAt, language)}
              </p>
            ) : null}
          </div>
        </div>

        {hotspotsExpanded && hotspotError ? (
          <p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            {hotspotError}
          </p>
        ) : null}

        {!hotspotsExpanded ? null : hotspots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/70 px-4 py-6 text-sm text-secondary-text">
            {L('暂无热点数据，点击“刷新热点题材”获取。', 'No hotspot data yet. Click "Refresh hotspot themes" to fetch it.')}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {hotspots.map((item, index) => {
              const selected = selectedHotspotTopic === item.topic;
              const strength = getHotspotStrength(item, index, language);
              const iconMeta = getHotspotIcon(item.name || item.topic);
              const Icon = iconMeta.icon;
              return (
              <button
                key={`${item.topic}-${item.rank ?? ''}`}
                className={`group relative min-h-[116px] overflow-hidden rounded-xl border px-3 py-3 text-left transition-all ${
                  selected
                    ? 'border-orange-400 bg-gradient-to-br from-orange-500/10 via-card to-card shadow-[0_0_0_1px_rgba(249,115,22,0.16),0_18px_44px_rgba(249,115,22,0.14)]'
                    : 'border-border/80 bg-card hover:-translate-y-0.5 hover:border-orange-300/70 hover:shadow-soft-card'
                }`}
                type="button"
                onClick={() => handleHotspotSelect(item.topic)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        index < 3 ? 'bg-orange-500 text-white shadow-[0_8px_24px_rgba(249,115,22,0.24)]' : 'bg-surface text-secondary-text'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${iconMeta.className}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{item.name || item.topic}</p>
                      <span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${strength.className}`}>
                        {strength.label}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-2xl font-black leading-none text-orange-500">
                    {formatNumber(item.heatScore, 0)}
                  </span>
                </div>
                <div className="mt-4 grid max-w-[72%] gap-1 text-[11px] text-secondary-text">
                  <span>
                    {L('涨跌幅', 'Change')} <strong className="font-semibold text-foreground">{formatHotspotMetric(item.changePct, language)}%</strong>
                  </span>
                  <span>
                    {L('趋势', 'Trend')} <strong className="font-semibold text-foreground">{formatHotspotMetric(item.trendScore, language)}</strong>
                    {' · '}
                    {L('持续', 'Persistence')} <strong className="font-semibold text-foreground">{formatHotspotMetric(item.persistenceScore, language)}</strong>
                  </span>
                  <span>
                    {getHotspotSampleText(item, language)}
                    {' · '}
                    {L('龙头', 'Leaders')} {getHotspotLeadersText(item, language)}
                  </span>
                </div>
                <div className="absolute bottom-3 right-3 opacity-95 transition-transform group-hover:scale-105">
                  <MiniSparkline score={item.heatScore} selected={selected} />
                </div>
              </button>
              );
            })}
          </div>
        )}

        {hotspotsExpanded && selectedHotspotTopic ? (
          <div className="mt-4 rounded-xl border border-border/80 bg-surface/80 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {hotspotDetail?.name || selectedHotspotTopic}
                </h3>
                <p className="mt-1 text-xs leading-5 text-secondary-text">
                  {hotspotDetail
                    ? getHotspotSummaryText(hotspotDetail, selectedHotspot, language)
                    : loadingHotspotDetail
                      ? L('正在读取发酵路线与概念股...', 'Loading the fermentation path and constituents...')
                      : L('点击题材查看发酵路线与概念股。', 'Select a theme to view its fermentation path and constituents.')}
                </p>
                {hotspotDetail?.canonicalTopic && hotspotDetail.canonicalTopic !== selectedHotspotTopic ? (
                  <p className="mt-1 text-[11px] text-secondary-text">
                    {L('标准题材：', 'Canonical topic: ')}{hotspotDetail.canonicalTopic}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={searchingHotspotNews}
                  loadingText={L('搜索中...', 'Searching...')}
                  disabled={loadingHotspotDetail || searchingHotspotNews}
                  onClick={() => void loadHotspotDetail(selectedHotspotTopic, { includeSearch: true })}
                >
                  <Search className="h-3.5 w-3.5" />
                  {L('搜索最新消息', 'Search latest news')}
                </Button>
                {loadingHotspotDetail ? (
                  <span className="w-fit rounded-full bg-cyan/10 px-3 py-1 text-xs font-semibold text-cyan">
                    {L('正在补充详情', 'Loading details')}
                  </span>
                ) : null}
                {hotspotDetail?.qualityStatus ? (
                  <span className="w-fit rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                    {L('质量', 'Quality')} {getHotspotQualityLabel(hotspotDetail.qualityStatus, language)}
                  </span>
                ) : null}
                {hotspotDetail?.fallbackUsed || hotspotDetail?.stale ? (
                  <span className="w-fit rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                    {getHotspotFallbackLabel(hotspotDetail, language)}
                  </span>
                ) : null}
                {hotspotDetail?.stockCount != null ? (
                  <span className="w-fit rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-500">
                    {L('概念股', 'Constituents')} {hotspotDetail.stockCount}
                  </span>
                ) : null}
              </div>
            </div>

            {hotspotDetailError ? (
              <p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                {hotspotDetailError}
              </p>
            ) : null}

            {hotspotDetail && hasHotspotDetailDegradation(hotspotDetail) ? (
              <details className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <summary className="cursor-pointer font-semibold">
                  {L('详情数据已降级，展开查看原因', 'Detail data is degraded; expand to see why')}
                </summary>
                <div className="mt-2 space-y-1 leading-5">
                  {(hotspotDetail.missingFields || []).length > 0 ? (
                    <p>
                      {L('暂缺：', 'Missing: ')}
                      {getHotspotMissingFieldLabels(hotspotDetail.missingFields, language).join(language === 'en' ? ', ' : '、')}
                    </p>
                  ) : null}
                  {getHotspotDiagnosticMessages(hotspotDetail.sourceErrors, language).map((message, index) => (
                    <p key={`${message}-${index}`}>{message}</p>
                  ))}
                </div>
              </details>
            ) : null}

            {hotspotDetail ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
                <div>
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-secondary-text">
                    <Clock3 className="h-3.5 w-3.5 text-orange-500" />
                    {L('发酵时间线', 'Fermentation timeline')}
                  </p>
                  <div className="relative space-y-0 pl-4 before:absolute before:bottom-3 before:left-[5px] before:top-2 before:w-px before:bg-border">
                    {getHotspotRouteItems(hotspotDetail).map((item, index) => (
                      <div key={`${item.title}-${index}`} className="relative pb-4 last:pb-0">
                        <span className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border border-orange-400 bg-card" />
                        <div className="rounded-lg border border-border/70 bg-card/80 p-3">
                          <p className="text-[11px] font-semibold text-orange-500">{getRouteTimeLabel(item, language)}</p>
                          <p className="mt-1 text-xs font-semibold text-foreground">{formatHotspotRouteTitle(item.title, language)}</p>
                          <p className="mt-1 text-xs leading-5 text-secondary-text">{formatHotspotRouteDescription(item.description, language)}</p>
                          {item.url ? (
                            <a
                              className="mt-2 inline-flex text-[11px] font-semibold text-cyan hover:text-foreground"
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {L('查看消息', 'View news')}
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-secondary-text">{L('概念股', 'Constituents')}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(hotspotDetail.stocks || []).slice(0, 10).map((stock) => (
                      <div key={`${stock.code || stock.name}`} className="rounded-lg border border-border/70 bg-card/80 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground">{stock.name || stock.code || '-'}</p>
                            <p className="mt-1 text-[11px] text-secondary-text">{stock.code || '-'}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="rounded-full bg-cyan/10 px-2 py-1 text-[11px] font-semibold text-cyan">
                              {getHotspotRoleLabel(stock.role, language)}
                            </span>
                            {stock.code ? (
                              <button
                                type="button"
                                aria-label={L(`分析 ${stock.name || stock.code}`, `Analyze ${stock.name || stock.code}`)}
                                className="inline-flex h-7 items-center gap-1 rounded-full border border-cyan/30 bg-cyan/10 px-2 text-[11px] font-semibold text-cyan transition-colors hover:border-cyan hover:bg-cyan/15 hover:text-foreground"
                                onClick={() => handleAnalyzeHotspotStock(stock)}
                              >
                                <Play className="h-3 w-3" />
                                {L('分析', 'Analyze')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] text-secondary-text">
                          {L('涨跌幅', 'Change')} {formatStockChangeText(stock.changePct, language)}
                          {' · '}
                          {L('热度', 'Heat')} {formatNumber(stock.hotStockScore, 0)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-cyan/35 bg-card/95 p-4 shadow-soft-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SlidersHorizontal className="h-4 w-4 text-cyan" />
            {L('运行选股', 'Run screening')}
          </div>
          <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-semibold text-cyan">
            {selectedStrategyTag}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr_180px_auto] lg:items-end">
          <label className="space-y-2 text-xs font-medium text-secondary-text">
            {L('市场', 'Market')}
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-cyan"
              value={market}
              disabled={loading}
              onChange={(event) => handleMarketChange(event.target.value)}
            >
              {MARKETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {language === 'en' ? item.label[1] : item.label[0]}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 text-xs font-medium text-secondary-text">
            <label htmlFor="screening-strategy">{L('策略', 'Strategy')}</label>
            <Select
              id="screening-strategy"
              value={selectedStrategy ? strategy : CUSTOM_STRATEGY_OPTION_VALUE}
              disabled={loading || loadingStrategies}
              placeholder=""
              options={[
                ...strategies.map((item) => ({
                  value: item.id,
                  label: item.name || item.title || item.id,
                })),
                { value: CUSTOM_STRATEGY_OPTION_VALUE, label: L('自定义策略…', 'Custom strategy…') },
              ]}
              onChange={(value) =>
                handleStrategyChange(
                  value === CUSTOM_STRATEGY_OPTION_VALUE ? '' : value,
                )
              }
            />
          </div>

          {!selectedStrategy && !loadingStrategies ? (
            <label className="space-y-2 text-xs font-medium text-secondary-text lg:col-start-2">
              {L('自定义策略 ID', 'Custom strategy ID')}
              <input
                aria-label={L('自定义策略 ID', 'Custom strategy ID')}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-cyan"
                value={strategy}
                disabled={loading}
                placeholder={L('输入策略 ID', 'Enter a strategy ID')}
                onChange={(event) => handleStrategyChange(event.target.value)}
              />
            </label>
          ) : null}

          <label className="space-y-2 text-xs font-medium text-secondary-text">
            {L('返回数量', 'Result count')}
            <input
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-cyan"
              type="number"
              min={1}
              max={100}
              value={maxResults}
              disabled={loading}
              onChange={(event) => handleMaxResultsChange(Number(event.target.value))}
            />
          </label>

          <Button
            className="h-11 min-w-40"
            isLoading={loading}
            loadingText={L('筛选中...', 'Screening...')}
            disabled={!isScreeningEnabled || loading || !strategy.trim()}
            onClick={() => void handleSubmit()}
          >
            <Play className="h-4 w-4" />
            {L('运行选股', 'Run screening')}
          </Button>
        </div>

        <div className="mt-3 rounded-xl border border-border/75 bg-surface/55 px-3 py-2 text-xs leading-5 text-secondary-text">
          {strategyLoadError
            ? strategyLoadError
            : selectedStrategy?.description
              || L('策略会先执行硬过滤和因子评分，再进行风险与组合约束。', 'The strategy applies hard filters and factor scoring first, then risk and portfolio constraints.')}
        </div>
      </section>

      {loading || screenMeta ? (
        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-soft-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <span className={`grid h-7 w-7 place-items-center rounded-full ${loading ? 'text-cyan' : 'text-success'}`}>
                {loading ? <CircleAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {loading ? L('选股运行中', 'Screening in progress') : L('选股完成', 'Screening complete')}
                </h2>
                <p className="mt-1 text-xs text-secondary-text">
                  {loading
                    ? `${taskMessage || L('正在执行选股', 'Running screening')} · ${taskProgress}%`
                    : `${displayedStrategy} · ${getMarketLabel(market, language)}`}
                </p>
              </div>
            </div>
          </div>

          <details className="mt-3 border-t border-border/70 pt-3 text-xs text-secondary-text">
            <summary className="w-fit cursor-pointer font-medium text-secondary-text">
              {L('运行详情', 'Run details')}
            </summary>
            <div className="mt-2 grid gap-1">
              <span>{L('任务：', 'Task: ')}{activeTaskId ? activeTaskId.slice(0, 12) : '-'}</span>
              <span>Run ID: {screenMeta?.runId || '-'}</span>
              <span>
                {L('快照', 'Snapshot')} {screenMeta?.snapshotCount ?? '-'}
                {' · '}
                {L('过滤后', 'After filter')} {screenMeta?.afterFilterCount ?? '-'}
                {' · '}
                {L('候选', 'Candidates')} {screenMeta?.candidateCount ?? candidates.length}
              </span>
              <span>
                {L('排序：', 'Ranking: ')}
                {screenMeta?.llmRanked
                  ? L('智能重排', 'LLM re-ranking')
                  : screenMeta ? L('确定性因子', 'Deterministic factors') : '-'}
                {screenMeta?.llmModelUsed ? ` · ${screenMeta.llmModelUsed}` : ''}
                {screenMeta?.llmCoverage != null
                  ? ` · ${L('覆盖', 'Coverage')} ${formatPercent(screenMeta.llmCoverage)}`
                  : ''}
              </span>
              {screenMeta?.resultVariantPoolSize ? (
                <span>
                  {L('候选差异：近分池', 'Candidate variation: near-score pool')} {screenMeta.resultVariantPoolSize} ·{' '}
                  {screenMeta.resultVariantApplied
                    ? L(
                      `本次替换 ${screenMeta.resultVariantRotatedSlots ?? 0} 位`,
                      `${screenMeta.resultVariantRotatedSlots ?? 0} slots rotated this run`,
                    )
                    : L('本次保持基准', 'Baseline kept this run')}
                </span>
              ) : null}
              <span>
                {L('深度补充：', 'Deep enrichment: ')}
                {screenMeta?.dsaEnrichment?.enrichedCount ?? '-'} / {screenMeta?.dsaEnrichment?.requestedCount ?? '-'}
              </span>
            </div>
          </details>
        </section>
      ) : null}

      {screenMeta && alertMessages.length > 0 ? (
        <InlineAlert
          variant={llmFailed ? 'warning' : 'info'}
          title={llmFailed ? L('当前使用因子排序', 'Using factor ranking') : L('选股提示', 'Screening notices')}
          message={<ScreenAlertMessage messages={alertMessages} />}
        />
      ) : null}

      {screenMeta ? (
        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-soft-card">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-base font-semibold text-foreground">{L('选股结果', 'Screening results')}</h2>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs text-secondary-text">
            <Search className="h-4 w-4 text-cyan" />
            {L(`${candidates.length} 条候选`, `${candidates.length} candidates`)}
          </div>
          </div>

        {candidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/70 px-5 py-10 text-center">
            <p className="text-sm font-medium text-foreground">{L('暂无符合条件的候选', 'No candidates matched the criteria')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="bg-surface text-left text-xs text-secondary-text">
                <tr>
                  <th className="w-14 px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">{L('代码', 'Code')}</th>
                  <th className="px-4 py-3 font-semibold">{L('名称', 'Name')}</th>
                  <th className="px-4 py-3 font-semibold">{L('行业', 'Industry')}</th>
                  <th className="px-4 py-3 font-semibold">{L('价格', 'Price')}</th>
                  <th className="px-4 py-3 font-semibold">{L('涨跌幅', 'Change')}</th>
                  <th className="px-4 py-3 font-semibold">{L('评分', 'Score')}</th>
                  <th className="px-4 py-3 font-semibold">{L('排序依据', 'Ranked by')}</th>
                  <th className="px-4 py-3 font-semibold">{L('风险', 'Risk')}</th>
                  <th className="px-4 py-3 font-semibold">{L('详情', 'Details')}</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((item) => {
                  const expanded = expandedCode === item.code;
                  const factors = getFactorEntries(item);
                  const selectionExplanations = getSelectionExplanations(item, language);
                  const selectionQuality = item.whySelected?.length
                    ? item.explanationQuality?.whySelected || 'unknown'
                    : 'unknown';
                  const llmInsightAvailable = hasLlmInsight(item);
                  const dsaWarnings = item.dsaContext?.warnings || [];
                  const dsaNews = item.dsaNews || [];
                  const dsaEvents = item.dsaEvents || [];
                  return (
                    <Fragment key={`${item.rank}-${item.code}`}>
                      <tr className="border-t border-border align-top transition-colors hover:bg-hover/50">
                        <td className="px-4 py-3 text-secondary-text">{item.rank}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-foreground">{item.code}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{item.name || '-'}</td>
                        <td className="px-4 py-3 text-secondary-text">{item.industry || '-'}</td>
                        <td className="px-4 py-3 text-secondary-text">{formatNumber(item.price)}</td>
                        <td className="px-4 py-3 text-secondary-text">{formatNumber(item.changePct)}%</td>
                        <td className="px-4 py-3 font-bold text-cyan">{formatScore(item.score)}</td>
                        <td className="px-4 py-3 text-secondary-text">
                          {factorRanking ? L('因子排序', 'Factor ranking') : formatScore(item.llmScore)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${getRiskClassName(item.riskLevel)}`}>
                            {getRiskLabel(item.riskLevel, language)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="text-sm font-semibold text-cyan transition-colors hover:text-foreground"
                            type="button"
                            onClick={() => setExpandedCode(expanded ? null : item.code)}
                          >
                            {expanded ? L('收起', 'Collapse') : L('展开查看', 'Expand')}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-t border-border bg-surface/45">
                          <td colSpan={10} className="px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                              <div className="space-y-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="rounded-xl border border-cyan/25 bg-cyan/5 px-3 py-2.5">
                                    <p className="text-xs font-semibold text-cyan">{L('为什么入选', 'Why it was selected')}</p>
                                    <ExplanationItems
                                      items={selectionExplanations}
                                      emptyText={L('暂无可验证的入选解释', 'No verifiable selection explanation yet')}
                                      language={language}
                                    />
                                    {selectionExplanations.length > 0 ? (
                                      <p className="mt-2 text-xs text-secondary-text">
                                        {L('综合质量：', 'Overall quality: ')}{selectionQuality}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="rounded-xl border border-orange-400/25 bg-orange-500/5 px-3 py-2.5">
                                    <p className="text-xs font-semibold text-orange-500">{L('为什么现在', 'Why now')}</p>
                                    <ExplanationItems
                                      items={item.whyNow}
                                      emptyText={L('暂无带来源的价格、消息或事件证据', 'No sourced price, news or event evidence yet')}
                                      language={language}
                                    />
                                    {item.whyNow?.length ? (
                                      <p className="mt-2 text-xs text-secondary-text">
                                        {L('综合质量：', 'Overall quality: ')}{item.explanationQuality?.whyNow || 'unknown'}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-secondary-text">{L('摘要', 'Summary')}</p>
                                  <p className="mt-1 text-sm leading-6 text-foreground">{getCandidateReason(item, language)}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-secondary-text">{L('操作信号', 'Action signal')}</p>
                                  <p className="mt-1 text-sm text-foreground">{getSignal(item, language)}</p>
                                  <button
                                    className="mt-2 rounded-lg border border-cyan/40 px-3 py-1.5 text-xs font-semibold text-cyan transition-colors hover:bg-cyan/10"
                                    type="button"
                                    onClick={() => handleAnalyzeCandidate(item)}
                                  >
                                    {L('进一步深度分析', 'Run deeper analysis')}
                                  </button>
                                </div>
                                {item.dsaAnalysisSummary ? (
                                  <div>
                                    <p className="text-xs font-semibold text-secondary-text">{L('增强摘要', 'Enriched summary')}</p>
                                    <p className="mt-1 text-sm leading-6 text-foreground">
                                      {formatEnrichmentSummary(item.dsaAnalysisSummary)}
                                    </p>
                                  </div>
                                ) : null}
                                {llmInsightAvailable ? (
                                  <div>
                                    <p className="text-xs font-semibold text-secondary-text">{L('智能判断', 'LLM assessment')}</p>
                                    <p className="mt-1 text-sm leading-6 text-foreground">{item.llmThesis || item.reason}</p>
                                    <p className="mt-1 text-xs text-secondary-text">
                                      {L('板块', 'Sector')} {item.llmSector || '-'}
                                      {' · '}
                                      {L('主题', 'Theme')} {item.llmTheme || '-'}
                                      {' · '}
                                      {L('置信度', 'Confidence')} {formatPercent(item.llmConfidence)}
                                    </p>
                                  </div>
                                ) : null}
                                <div>
                                  <p className="text-xs font-semibold text-secondary-text">{L('风险标签', 'Risk tags')}</p>
                                  <p className="mt-1 text-sm text-foreground">
                                    {[...(item.riskFlags || []), ...(item.llmRisks || [])].length
                                      ? [...(item.riskFlags || []), ...(item.llmRisks || [])].join(language === 'en' ? ', ' : '，')
                                      : L('无', 'None')}
                                  </p>
                                </div>
                                {item.riskSummary ? (
                                  <div>
                                    <p className="text-xs font-semibold text-secondary-text">{L('风险摘要', 'Risk summary')}</p>
                                    <p className="mt-1 text-sm text-foreground">{item.riskSummary}</p>
                                  </div>
                                ) : null}
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-semibold text-secondary-text">{L('主要因子', 'Key factors')}</p>
                                  <div className="mt-2 grid grid-cols-2 gap-2">
                                    {factors.length > 0 ? (
                                      factors.map(([key, value]) => (
                                        <div key={key} className="rounded-lg border border-border bg-card px-3 py-2">
                                          <span className="block text-xs text-secondary-text">{getFactorLabel(key, language)}</span>
                                          <span className="text-sm font-semibold text-foreground">{formatNumber(value)}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <span className="text-sm text-secondary-text">{L('无因子明细', 'No factor details')}</span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-secondary-text">{L('成交额', 'Turnover')}</p>
                                  <p className="mt-1 text-sm text-foreground">{formatAmount(item.amount, language)}</p>
                                </div>
                                {item.llmWatchItems?.length ? (
                                  <div>
                                    <p className="text-xs font-semibold text-secondary-text">{L('智能关注项', 'LLM watch items')}</p>
                                    <p className="mt-1 text-sm text-foreground">
                                      {item.llmWatchItems.join(language === 'en' ? ', ' : '，')}
                                    </p>
                                  </div>
                                ) : null}
                                {item.llmCatalysts?.length ? (
                                  <div>
                                    <p className="text-xs font-semibold text-secondary-text">{L('催化因素', 'Catalysts')}</p>
                                    <p className="mt-1 text-sm text-foreground">
                                      {item.llmCatalysts.join(language === 'en' ? ', ' : '，')}
                                    </p>
                                  </div>
                                ) : null}
                                <div>
                                  <p className="text-xs font-semibold text-secondary-text">{L('相关新闻', 'Related news')}</p>
                                  {dsaNews.length > 0 ? (
                                    <ul className="mt-1 space-y-1 text-sm text-foreground">
                                      {dsaNews.slice(0, 3).map((newsItem, newsIndex) => (
                                        <li key={`${item.code}-dsa-news-${newsIndex}`}>
                                          {newsItem.title || newsItem.snippet || '-'}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-1 text-sm text-secondary-text">{L('无', 'None')}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-secondary-text">{L('公告与事件', 'Announcements and events')}</p>
                                  {dsaEvents.length > 0 ? (
                                    <ul className="mt-1 space-y-1 text-sm text-foreground">
                                      {dsaEvents.slice(0, 3).map((eventItem, eventIndex) => (
                                        <li key={`${item.code}-dsa-event-${eventIndex}`}>
                                          {eventItem.title || eventItem.snippet || '-'}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-1 text-sm text-secondary-text">{L('无', 'None')}</p>
                                  )}
                                </div>
                                {dsaWarnings.length > 0 ? (
                                  <div>
                                    <p className="text-xs font-semibold text-secondary-text">{L('数据补充提示', 'Data enrichment notices')}</p>
                                    <p className="mt-1 text-sm text-secondary-text">
                                      {dsaWarnings.join(language === 'en' ? ', ' : '，')}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-soft-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock3 className="h-4 w-4 text-cyan" />
            {L('历史记录', 'History')}
          </div>
          <button
            type="button"
            className="text-xs font-medium text-cyan transition-colors hover:text-foreground"
            onClick={() => void loadHistory()}
            disabled={historyLoading}
          >
            {historyLoading ? L('加载中...', 'Loading...') : L('刷新', 'Refresh')}
          </button>
        </div>
        {historyError ? (
          <p className="mb-3 text-xs text-danger">{historyError}</p>
        ) : null}
        {historyRuns.length === 0 ? (
          <p className="py-3 text-center text-xs text-secondary-text">
            {historyLoading
              ? L('正在加载历史记录...', 'Loading history...')
              : L('暂无历史选股记录', 'No screening history yet')}
          </p>
        ) : (
          <div className="divide-y divide-border/70">
            {historyRuns.map((run) => (
              <button
                key={run.runId}
                type="button"
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-hover/50"
                onClick={() => void handleHistoryRunSelect(run.runId)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {formatHistoryStrategyName(run.strategy, strategies, language)}
                    <span className="ml-2 text-xs font-normal text-secondary-text">
                      {getMarketLabel(run.market, language)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-secondary-text">
                    {L(`返回 ${run.candidateCount ?? 0} 只`, `${run.candidateCount ?? 0} results`)}
                    {run.snapshotCount != null ? L(` · 快照 ${run.snapshotCount}`, ` · snapshot ${run.snapshotCount}`) : ''}
                    {run.llmRanked ? L(' · 智能重排', ' · LLM re-ranked') : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-secondary-text">
                  {formatRunCreatedAt(run.createdAt, language)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </AppPage>
  );
};

export default StockScreeningPage;
