import axios from 'axios';
import { getCurrentUiLanguage } from '../utils/uiLanguage';

const pick = (zh: string, en: string): string => (getCurrentUiLanguage() === 'en' ? en : zh);

export type ApiErrorCategory =
  | 'agent_disabled'
  | 'missing_params'
  | 'llm_not_configured'
  | 'model_tool_incompatible'
  | 'invalid_tool_call'
  | 'portfolio_oversell'
  | 'portfolio_busy'
  | 'upstream_llm_400'
  | 'upstream_timeout'
  | 'upstream_network'
  | 'local_connection_failed'
  | 'http_error'
  | 'unknown';

export interface ParsedApiError {
  title: string;
  message: string;
  rawMessage: string;
  status?: number;
  category: ApiErrorCategory;
  code?: string;
}

type ResponseLike = {
  status?: number;
  data?: unknown;
  statusText?: string;
};

type ErrorCarrier = {
  response?: ResponseLike;
  code?: string;
  message?: string;
  parsedError?: ParsedApiError;
  cause?: unknown;
};

type CreateParsedApiErrorOptions = {
  title: string;
  message: string;
  rawMessage?: string;
  status?: number;
  category?: ApiErrorCategory;
  code?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getResponse(error: unknown): ResponseLike | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const response = (error as ErrorCarrier).response;
  return response && typeof response === 'object' ? response : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof (error as ErrorCarrier).code === 'string'
    ? (error as ErrorCarrier).code
    : undefined;
}

function getErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') {
    return error.trim() || null;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (isRecord(error) && typeof (error as ErrorCarrier).message === 'string') {
    const message = (error as ErrorCarrier).message?.trim();
    return message || null;
  }

  return null;
}

function getCauseMessage(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  return getErrorMessage((error as ErrorCarrier).cause);
}

function buildMatchText(parts: Array<string | undefined | null>): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' | ')
    .toLowerCase();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function extractValidationDetail(detail: unknown): string | null {
  if (!Array.isArray(detail)) {
    return null;
  }

  const parts = detail
    .map((item) => {
      if (!isRecord(item)) {
        return stringifyValue(item);
      }

      const location = Array.isArray(item.loc)
        ? item.loc.map((segment) => String(segment)).join('.')
        : null;
      const message = pickString(item.msg, item.message, item.error);
      if (!location && !message) {
        return stringifyValue(item);
      }
      return [location, message].filter(Boolean).join(': ');
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join('; ') : null;
}

function extractErrorCode(data: unknown): string | null {
  if (!isRecord(data)) {
    return null;
  }

  const detail = data.detail;
  if (isRecord(detail)) {
    return pickString(detail.error, detail.code, data.error, data.code);
  }

  return pickString(data.error, data.code);
}

function extractConfigValidationIssues(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const payload = isRecord(data.detail) ? data.detail : data;
  if (!Array.isArray(payload.issues)) return null;
  const messages = payload.issues.filter(isRecord).map((issue) => {
    const key = pickString(issue.key);
    let message = pickString(issue.message);
    if (issue.code === 'missing_api_key') message = pick('请填写此渠道的 API Key。', 'Enter an API key for this channel.');
    if (issue.code === 'missing_models') message = pick('请填写账号可用的模型。', 'Enter a model this account can use.');
    if (issue.code === 'unknown_model') {
      message = pick(
        '请选择当前启用渠道中的模型，或清空无效的模型选项。',
        'Pick a model from an enabled channel, or clear the invalid model option.',
      );
    }
    return message ? [key, message].filter(Boolean).join(pick('：', ': ')) : null;
  }).filter((message): message is string => Boolean(message));
  return messages.length ? messages.join('\n') : null;
}

export function extractErrorPayloadText(data: unknown): string | null {
  if (typeof data === 'string') {
    return data.trim() || null;
  }

  if (Array.isArray(data)) {
    return extractValidationDetail(data) ?? stringifyValue(data);
  }

  if (!isRecord(data)) {
    return stringifyValue(data);
  }

  const detail = data.detail;
  if (isRecord(detail)) {
    return (
      pickString(detail.message, detail.error)
      ?? extractValidationDetail(detail.detail)
      ?? stringifyValue(detail)
    );
  }

  return (
    pickString(
      detail,
      data.message,
      data.error,
      data.title,
      data.reason,
      data.description,
      data.msg,
    )
    ?? extractValidationDetail(detail)
    ?? stringifyValue(data)
  );
}

export function createParsedApiError(options: CreateParsedApiErrorOptions): ParsedApiError {
  return {
    title: options.title,
    message: options.message,
    rawMessage: options.rawMessage?.trim() || options.message,
    status: options.status,
    category: options.category ?? 'unknown',
    ...(options.code ? { code: options.code } : {}),
  };
}

export function isParsedApiError(value: unknown): value is ParsedApiError {
  return isRecord(value)
    && typeof value.title === 'string'
    && typeof value.message === 'string'
    && typeof value.rawMessage === 'string'
    && typeof value.category === 'string';
}

export function isApiRequestError(
  value: unknown,
): value is Error & ErrorCarrier & { parsedError: ParsedApiError } {
  return value instanceof Error
    && isRecord(value)
    && isParsedApiError((value as ErrorCarrier).parsedError);
}

export function formatParsedApiError(parsed: ParsedApiError): string {
  if (!parsed.title.trim()) {
    return parsed.message;
  }
  if (parsed.title === parsed.message) {
    return parsed.title;
  }
  return `${parsed.title}：${parsed.message}`;
}

export function getParsedApiError(error: unknown): ParsedApiError {
  if (isParsedApiError(error)) {
    return error;
  }
  if (isRecord(error) && isParsedApiError((error as ErrorCarrier).parsedError)) {
    return (error as ErrorCarrier).parsedError as ParsedApiError;
  }
  return parseApiError(error);
}

export function createApiError(
  parsed: ParsedApiError,
  extra: { response?: ResponseLike; code?: string; cause?: unknown } = {},
): Error & ErrorCarrier & { status?: number; category: ApiErrorCategory; rawMessage: string } {
  const apiError = new Error(formatParsedApiError(parsed)) as Error & ErrorCarrier & {
    status?: number;
    category: ApiErrorCategory;
    rawMessage: string;
  };
  apiError.name = 'ApiRequestError';
  apiError.parsedError = parsed;
  apiError.response = extra.response;
  apiError.code = extra.code ?? parsed.code;
  apiError.status = parsed.status;
  apiError.category = parsed.category;
  apiError.rawMessage = parsed.rawMessage;
  if (extra.cause !== undefined) {
    apiError.cause = extra.cause;
  }
  return apiError;
}

export function attachParsedApiError(error: unknown): ParsedApiError {
  const parsed = parseApiError(error);
  if (isRecord(error)) {
    const carrier = error as ErrorCarrier;
    carrier.parsedError = parsed;
  }
  if (error instanceof Error) {
    error.name = 'ApiRequestError';
    error.message = formatParsedApiError(parsed);
  }
  return parsed;
}

export function isLocalConnectionFailure(error: unknown): boolean {
  return parseApiError(error).category === 'local_connection_failed';
}

export function parseApiError(error: unknown): ParsedApiError {
  const response = getResponse(error);
  const status = response?.status;
  const payloadText = extractErrorPayloadText(response?.data);
  const errorCode = extractErrorCode(response?.data);
  const errorMessage = getErrorMessage(error);
  const causeMessage = getCauseMessage(error);
  const code = getErrorCode(error);
  const rawMessage = pickString(payloadText, response?.statusText, errorMessage, causeMessage, code)
    ?? pick('请求未成功完成，请稍后重试。', 'The request did not complete. Try again shortly.');
  const matchText = buildMatchText([rawMessage, errorMessage, causeMessage, code, errorCode, response?.statusText]);

  if (errorCode === 'validation_failed') {
    const issues = extractConfigValidationIssues(response?.data);
    const message = issues
      ? pick(`请修正以下配置后重试：\n${issues}`, `Fix the following settings and try again:\n${issues}`)
      : pick(
        '请检查渠道的 API Key、模型和运行参数后重试。',
        'Check the channel API key, model, and runtime settings, then try again.',
      );
    return createParsedApiError({
      title: pick('配置需要调整', 'Settings need attention'),
      message,
      rawMessage: message,
      status,
      category: 'http_error',
      code: errorCode,
    });
  }

  if (errorCode === 'backend_removed') {
    return createParsedApiError({
      title: pick('问股后端已移除', 'Ask backend removed'), message: rawMessage,
      rawMessage, status, code: 'backend_removed', category: 'http_error',
    });
  }

  if (errorCode === 'session_state_conflict' || code === 'session_state_conflict') {
    return createParsedApiError({
      title: pick('会话已更新', 'Session updated'),
      message: pick(
        '请刷新会话后重试。当前输入尚未被接受，请保留问题与选择。',
        'Refresh the session and try again. Your input was not accepted, so keep your question and selections.',
      ),
      rawMessage, status, code: 'session_state_conflict', category: 'http_error',
    });
  }

  if (includesAny(matchText, ['agent mode is not enabled', 'agent_mode'])) {
    return createParsedApiError({
      title: pick('Agent 模式未开启', 'Agent mode is off'),
      message: pick(
        '当前功能依赖 Agent 模式，请先开启后再重试。',
        'This feature needs Agent mode. Turn it on, then try again.',
      ),
      rawMessage,
      status,
      category: 'agent_disabled',
    });
  }

  const hasStockCodeField = includesAny(matchText, ['stock_code', 'stock_codes']);
  const hasMissingParamText = includesAny(matchText, ['必须提供 stock_code 或 stock_codes', 'missing', 'required']);
  if (hasStockCodeField && hasMissingParamText) {
    return createParsedApiError({
      title: pick('请求缺少必要参数', 'Missing required parameters'),
      message: pick('请先补充股票代码或必要输入后再试。', 'Add a stock code or the required input, then try again.'),
      rawMessage,
      status,
      category: 'missing_params',
    });
  }

  if (errorCode === 'portfolio_oversell' || includesAny(matchText, ['oversell detected'])) {
    return createParsedApiError({
      title: pick('卖出数量超过可用持仓', 'Sell quantity exceeds available holdings'),
      message: pick(
        '卖出数量超过当前可用持仓，请删除或修正对应卖出流水后重试。',
        'The sell quantity exceeds your available holdings. Delete or correct that sell entry, then try again.',
      ),
      rawMessage,
      status,
      category: 'portfolio_oversell',
    });
  }

  if (errorCode === 'portfolio_busy' || includesAny(matchText, ['portfolio ledger is busy'])) {
    return createParsedApiError({
      title: pick('持仓账本正忙', 'Portfolio ledger is busy'),
      message: pick('持仓账本正在处理另一笔变更，请稍后重试。', 'The portfolio ledger is applying another change. Try again shortly.'),
      rawMessage,
      status,
      category: 'portfolio_busy',
    });
  }

  if (errorCode === 'screening_unavailable' || includesAny(matchText, ['内建选股引擎初始化失败', '选股功能初始化失败'])) {
    return createParsedApiError({
      title: pick('选股功能未就绪', 'Screening is not ready'),
      message: pick(
        '选股功能暂不可用，请检查策略配置、数据依赖和服务日志。',
        'Screening is unavailable. Check the strategy settings, data dependencies, and service logs.',
      ),
      rawMessage,
      status,
      category: 'http_error',
    });
  }

  if (errorCode === 'screening_screen_task_not_found') {
    return createParsedApiError({
      title: pick('选股任务不可恢复', 'Screening run cannot be resumed'),
      message: pick(
        '服务端没有找到这次选股任务，可能后端已重启或任务记录已清理，请重新运行选股。',
        'The server could not find this screening run. The backend may have restarted or the record was cleared. Run screening again.',
      ),
      rawMessage,
      status,
      category: 'http_error',
    });
  }

  if (errorCode === 'screening_screen_failed') {
    return createParsedApiError({
      title: pick('选股失败', 'Screening failed'),
      message: pick(
        '选股访问行情、快照或模型服务失败，请稍后重试，或检查网络与代理设置。',
        'Screening could not reach the quote, snapshot, or model service. Try again shortly, or check your network and proxy settings.',
      ),
      rawMessage,
      status,
      category: 'upstream_network',
    });
  }

  const noConfiguredLlm = (
    includesAny(matchText, ['all llm models failed']) && includesAny(matchText, ['last error: none'])
  ) || includesAny(matchText, [
    'no llm configured',
    'no effective primary model configured',
    'litellm_model not configured',
    'ai analysis will be unavailable',
  ]);
  if (noConfiguredLlm) {
    return createParsedApiError({
      title: pick('系统没有配置可用的 LLM 模型', 'No LLM model is configured'),
      message: pick(
        '请先在系统设置中配置主模型、可用渠道或相关 API Key 后再重试。',
        'Configure a primary model, an enabled channel, or the related API key in Settings, then try again.',
      ),
      rawMessage,
      status,
      category: 'llm_not_configured',
    });
  }

  if (includesAny(matchText, [
    'tool call',
    'function call',
    'does not support tools',
    'tools is not supported',
    'reasoning',
  ])) {
    return createParsedApiError({
      title: pick('当前模型不兼容工具调用', 'This model does not support tool calls'),
      message: pick(
        '当前模型不适合 Agent / 工具调用场景，请更换支持工具调用的模型后重试。',
        'This model is not suited to Agent or tool-calling use. Switch to a model that supports tool calls, then try again.',
      ),
      rawMessage,
      status,
      category: 'model_tool_incompatible',
    });
  }

  if (includesAny(matchText, [
    'thought_signature',
    'missing function',
    'missing tool',
    'invalid tool call',
    'invalid function call',
  ])) {
    return createParsedApiError({
      title: pick('上游模型返回的数据结构不完整', 'Upstream model returned an incomplete structure'),
      message: pick(
        '上游模型返回的工具调用结构不符合要求，请更换模型或关闭相关推理模式后重试。',
        'The upstream model returned a tool-call structure that does not meet the requirements. Switch models or turn off the related reasoning mode, then try again.',
      ),
      rawMessage,
      status,
      category: 'invalid_tool_call',
    });
  }

  if (includesAny(matchText, ['timeout', 'timed out', 'read timeout', 'connect timeout']) || code === 'ECONNABORTED') {
    return createParsedApiError({
      title: pick('连接上游服务超时', 'Upstream service timed out'),
      message: pick(
        '服务端访问外部依赖时超时，请稍后重试，或检查当前网络与代理设置。',
        'The server timed out reaching an external dependency. Try again shortly, or check your network and proxy settings.',
      ),
      rawMessage,
      status,
      category: 'upstream_timeout',
    });
  }

  if (
    status === 502
    || status === 503
    || includesAny(matchText, [
      'dns',
      'enotfound',
      'name or service not known',
      'temporary failure in name resolution',
      'proxy',
      'tunnel',
      '502',
      '503',
    ])
  ) {
    return createParsedApiError({
      title: pick('服务端无法访问外部依赖', 'Server cannot reach external dependencies'),
      message: pick(
        '页面已连接到本地服务，但本地服务访问外部模型或数据接口失败，请检查代理、DNS 或出网配置。',
        'The page reached the local service, but the local service could not reach the external model or data API. Check the proxy, DNS, or outbound network settings.',
      ),
      rawMessage,
      status,
      category: 'upstream_network',
    });
  }

  const hasLlmProviderHint = includesAny(matchText, [
    'chat/completions',
    'generativelanguage',
    'openai',
    'gemini',
  ]);
  if (status === 400 && hasLlmProviderHint) {
    return createParsedApiError({
      title: pick('上游模型接口拒绝了当前请求', 'Upstream model API rejected the request'),
      message: pick(
        '本地服务正常，但上游模型接口拒绝了请求，请检查模型名称、参数格式或工具调用兼容性。',
        'The local service is fine, but the upstream model API rejected the request. Check the model name, parameter format, or tool-call compatibility.',
      ),
      rawMessage,
      status,
      category: 'upstream_llm_400',
    });
  }

  const localConnectionFailed = !response && (
    includesAny(matchText, ['fetch failed', 'failed to fetch', 'network error', 'connection refused', 'econnrefused'])
    || code === 'ERR_NETWORK'
    || code === 'ECONNREFUSED'
  );
  if (localConnectionFailed) {
    return createParsedApiError({
      title: pick('无法连接到本地服务', 'Cannot reach the local service'),
      message: pick(
        '浏览器当前无法连接到本地 Web 服务，请检查服务是否启动、监听地址是否正确、端口是否开放。',
        'The browser cannot reach the local web service. Check that it is running, that the listen address is correct, and that the port is open.',
      ),
      rawMessage,
      status,
      category: 'local_connection_failed',
    });
  }

  if (payloadText || status) {
    return createParsedApiError({
      title: pick('请求失败', 'Request failed'),
      message: payloadText ?? pick(`请求未成功完成（HTTP ${status}）。`, `The request did not complete (HTTP ${status}).`),
      rawMessage,
      status,
      category: 'http_error',
    });
  }

  return createParsedApiError({
    title: pick('请求失败', 'Request failed'),
    message: rawMessage,
    rawMessage,
    status,
    category: 'unknown',
  });
}

export function toApiErrorMessage(
  error: unknown,
  fallback = pick('请求未成功完成，请稍后重试。', 'The request did not complete. Try again shortly.'),
): string {
  const parsed = getParsedApiError(error);
  const message = formatParsedApiError(parsed);
  return message.trim() || fallback;
}

export function isAxiosApiError(error: unknown): boolean {
  return axios.isAxiosError(error);
}
