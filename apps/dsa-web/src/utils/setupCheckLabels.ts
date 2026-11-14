/**
 * First-run setup check titles, messages, and next steps come from the backend,
 * which writes them in Chinese. These maps give the English UI readable text
 * without touching the backend payloads.
 */

import type { UiLanguage } from '../i18n/uiText';
import type { SetupStatusCheck } from '../types/systemConfig';

type LocalizedSetupCheck = Pick<SetupStatusCheck, 'title' | 'message' | 'nextStep'>;

const TITLES_BY_KEY: Record<string, string> = {
  llm_primary: 'Primary LLM channel',
  llm_agent: 'Agent channel',
  stock_list: 'Watchlist',
  notification: 'Notification channels',
  news_search: 'News search channel',
  storage: 'Database / local storage',
};

const DETECTED_LABELS: Record<string, string> = {
  显式主模型: 'explicit primary model',
  'LLM 渠道': 'LLM channel',
};

function localizePrimaryMessage(message: string): string | null {
  let match = /^已启用 (.+) 本地生成 Backend（experimental\/limited）。$/.exec(message);
  if (match) {
    return `Local generation backend ${match[1]} is enabled (experimental/limited).`;
  }
  if (message === '已选择 codex_cli，但 DSA 后端进程当前 PATH 中找不到 codex 可执行文件。') {
    return 'codex_cli is selected, but the DSA backend process cannot find the codex executable on its PATH.';
  }
  match = /^已选择 (.+)，但未找到 (.+) 可执行文件。$/.exec(message);
  if (match) {
    return `${match[1]} is selected, but the ${match[2]} executable was not found.`;
  }
  match = /^已检测到 (.+): (.+)$/.exec(message);
  if (match) {
    return `Detected ${DETECTED_LABELS[match[1]] ?? match[1]}: ${match[2]}`;
  }
  if (message === '主模型未出现在当前 LiteLLM YAML model_list 中') {
    return 'The primary model is not listed in the current LiteLLM YAML model_list.';
  }
  if (message === '主模型未出现在当前启用渠道模型列表中') {
    return 'The primary model is not listed in the models of the currently enabled channels.';
  }
  if (message === '主模型缺少可用渠道或匹配的 API Key') {
    return 'The primary model has no usable channel or matching API key.';
  }
  if (message === '尚未检测到主模型配置') {
    return 'No primary model configuration detected yet.';
  }
  return null;
}

function localizeAgentMessage(message: string): string | null {
  let match = /^Agent 工具调用暂不支持 (.+) text-only backend。$/.exec(message);
  if (match) {
    return `Agent tool calling does not support the ${match[1]} text-only backend yet.`;
  }
  if (
    message ===
    '普通分析使用 Codex CLI；但当前 LiteLLM Agent 路径继承的是 Hermes-only 模型，Hermes Phase 3 不支持 Agent 工具调用。'
  ) {
    return 'Regular analysis uses Codex CLI, but the LiteLLM Agent route inherits a Hermes-only model, and Hermes Phase 3 does not support Agent tool calling.';
  }
  match = /^普通分析使用 Codex CLI；Agent 工具调用仍使用 LiteLLM 主模型: (.+)$/.exec(message);
  if (match) {
    return `Regular analysis uses Codex CLI; Agent tool calling still uses the LiteLLM primary model: ${match[1]}`;
  }
  if (message === 'AGENT_GENERATION_BACKEND 已选择 litellm，但未检测到可用 LiteLLM 模型配置。') {
    return 'AGENT_GENERATION_BACKEND is set to litellm, but no usable LiteLLM model configuration was detected.';
  }
  if (message === 'Agent 工具调用需要 LiteLLM 模型配置；local CLI 主生成方式不会被自动继承。') {
    return 'Agent tool calling needs a LiteLLM model configuration; the local CLI generation backend is not inherited automatically.';
  }
  if (message === 'Hermes Phase 3 不支持 Agent 工具调用，且当前继承的主模型没有非 Hermes deployment。') {
    return 'Hermes Phase 3 does not support Agent tool calling, and the inherited primary model has no non-Hermes deployment.';
  }
  if (message === '未单独配置 Agent 主模型，将继承 LLM 主渠道。') {
    return 'No separate Agent primary model is configured, so the primary LLM channel is inherited.';
  }
  if (message === 'Agent 未配置独立模型，且 LLM 主渠道尚不可用。') {
    return 'The Agent has no dedicated model, and the primary LLM channel is not usable yet.';
  }
  match = /^Agent 主模型 (.+) 只有 Hermes deployment，Phase 3 不支持 Agent 工具调用。$/.exec(message);
  if (match) {
    return `The Agent primary model ${match[1]} only has a Hermes deployment, and Phase 3 does not support Agent tool calling.`;
  }
  match = /^已配置 Agent 主模型: (.+)$/.exec(message);
  if (match) {
    return `Agent primary model configured: ${match[1]}`;
  }
  match = /^Agent 主模型 (.+) 缺少可用渠道或匹配的 API Key。$/.exec(message);
  if (match) {
    return `The Agent primary model ${match[1]} has no usable channel or matching API key.`;
  }
  return null;
}

function localizeStockListMessage(message: string): string | null {
  const match = /^已配置 (\d+) 只股票。$/.exec(message);
  if (match) {
    const count = Number(match[1]);
    return `${count} ${count === 1 ? 'stock' : 'stocks'} configured.`;
  }
  if (message === '当前 STOCK_LIST 为空。') {
    return 'STOCK_LIST is currently empty.';
  }
  return null;
}

function localizeNotificationMessage(message: string): string | null {
  if (message === '已检测到至少一个通知渠道配置。') {
    return 'At least one notification channel is configured.';
  }
  if (message === '通知为可选项，未配置也不影响首次跑通。') {
    return 'Notifications are optional; leaving them unconfigured does not block the first run.';
  }
  return null;
}

function localizeNewsSearchMessage(message: string): string | null {
  const match = /^已检测到新闻搜索渠道: (.+)。$/.exec(message);
  if (match) {
    return `News search channel detected: ${match[1]}.`;
  }
  if (message === '未配置新闻搜索渠道，分析报告将不包含新闻面证据。') {
    return 'No news search channel is configured, so analysis reports will not include news evidence.';
  }
  return null;
}

function localizeStorageMessage(message: string): string | null {
  let match = /^数据库路径父目录不可用: (.+)$/.exec(message);
  if (match) {
    return `The parent directory of the database path is unavailable: ${match[1]}`;
  }
  match = /^数据库路径可用: (.+)$/.exec(message);
  if (match) {
    return `Database path is writable: ${match[1]}`;
  }
  match = /^数据库上级目录可创建: (.+)$/.exec(message);
  if (match) {
    return `The parent directory of the database path can be created: ${match[1]}`;
  }
  match = /^数据库路径上级目录不可写: (.+)$/.exec(message);
  if (match) {
    return `The parent directory of the database path is not writable: ${match[1]}`;
  }
  return null;
}

const MESSAGE_TRANSLATORS_BY_KEY: Record<string, (message: string) => string | null> = {
  llm_primary: localizePrimaryMessage,
  llm_agent: localizeAgentMessage,
  stock_list: localizeStockListMessage,
  notification: localizeNotificationMessage,
  news_search: localizeNewsSearchMessage,
  storage: localizeStorageMessage,
};

const NEXT_STEPS_BY_TEXT: Record<string, string> = {
  '请确认 Codex CLI 已安装到后端 PATH 可见目录；桌面端请完全退出并重开。打开 Codex CLI 交互窗口不会改变已运行后端的 PATH；若找到后仍失败，再检查 Codex CLI 登录态，或将 GENERATION_BACKEND 设回 litellm。':
    'Confirm Codex CLI is installed in a directory visible on the backend PATH; on desktop, quit the app completely and reopen it. Opening a Codex CLI terminal does not change the PATH of an already running backend. If it is found and still fails, check the Codex CLI login state, or set GENERATION_BACKEND back to litellm.',
  '请先安装并登录对应 CLI，或将 GENERATION_BACKEND 设回 litellm。':
    'Install and sign in to the matching CLI first, or set GENERATION_BACKEND back to litellm.',
  '请配置 LITELLM_MODEL、LLM_CHANNELS、LITELLM_CONFIG 或 legacy provider API Key。':
    'Configure LITELLM_MODEL, LLM_CHANNELS, LITELLM_CONFIG, or a legacy provider API key.',
  '请将 AGENT_GENERATION_BACKEND 设为 auto 或 litellm，并配置 LiteLLM 工具调用渠道。':
    'Set AGENT_GENERATION_BACKEND to auto or litellm, and configure a LiteLLM channel that supports tool calling.',
  '如需使用 Ask-Stock Agent，请配置非 Hermes 的 AGENT_LITELLM_MODEL，或配置包含非 Hermes deployment 的 mixed Agent route。':
    'To use the Ask-Stock Agent, configure a non-Hermes AGENT_LITELLM_MODEL, or a mixed Agent route that includes a non-Hermes deployment.',
  '如需使用 Ask-Stock Agent，请配置 AGENT_LITELLM_MODEL、LITELLM_MODEL、LLM_CHANNELS 或 LITELLM_CONFIG。':
    'To use the Ask-Stock Agent, configure AGENT_LITELLM_MODEL, LITELLM_MODEL, LLM_CHANNELS, or LITELLM_CONFIG.',
  '如需使用 Ask-Stock Agent，请配置 LiteLLM 模型，或将 AGENT_GENERATION_BACKEND 固定为 litellm 后补齐模型配置。':
    'To use the Ask-Stock Agent, configure a LiteLLM model, or pin AGENT_GENERATION_BACKEND to litellm and fill in the model configuration.',
  '请选择非 Hermes Agent 模型，或配置包含非 Hermes deployment 的 mixed Agent route。':
    'Choose a non-Hermes Agent model, or configure a mixed Agent route that includes a non-Hermes deployment.',
  '请先补齐 LLM 主渠道配置。': 'Complete the primary LLM channel configuration first.',
  '请选择非 Hermes Agent 模型，或配置 mixed route 中的非 Hermes deployment。':
    'Choose a non-Hermes Agent model, or configure a non-Hermes deployment in the mixed route.',
  '请调整 AGENT_LITELLM_MODEL 或补齐对应渠道配置。':
    'Adjust AGENT_LITELLM_MODEL, or complete the matching channel configuration.',
  '请至少添加 1 只股票用于首次试跑。': 'Add at least one stock for the first trial run.',
  '需要推送时可稍后配置飞书、钉钉、Telegram、邮件或其他通知渠道。':
    'When you want push notifications, configure Feishu, DingTalk, Telegram, email, or another channel later.',
  '需要新闻面时可配置 Tavily 或 Brave 的 API Key，或填写自建 SearXNG 实例地址。':
    'For news evidence, add a Tavily or Brave API key, or enter the URL of a self-hosted SearXNG instance.',
  '请检查 DATABASE_PATH 或上级目录权限。':
    'Check DATABASE_PATH or the permissions of its parent directory.',
  '请调整 DATABASE_PATH 或目录权限。': 'Adjust DATABASE_PATH or the directory permissions.',
};

/**
 * Resolve a setup check for the given UI language.
 * Falls back to the backend text when no translation is known.
 */
export function localizeSetupCheck(
  check: SetupStatusCheck,
  language: UiLanguage,
): LocalizedSetupCheck {
  const nextStep = check.nextStep ?? null;
  if (language !== 'en') {
    return { title: check.title, message: check.message, nextStep };
  }
  const translateMessage = MESSAGE_TRANSLATORS_BY_KEY[check.key];
  return {
    title: TITLES_BY_KEY[check.key] ?? check.title,
    message: translateMessage?.(check.message) ?? check.message,
    nextStep: nextStep ? NEXT_STEPS_BY_TEXT[nextStep] ?? nextStep : null,
  };
}
