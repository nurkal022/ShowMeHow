import OpenAI from 'openai';
import type { ProviderProfile, Role } from './types';
import { resolveRole } from './roles';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export function textPart(text: string): ContentPart {
  return { type: 'text', text };
}

export function imagePart(dataUrl: string): ContentPart {
  return { type: 'image_url', image_url: { url: dataUrl } };
}

export function makeClient(p: ProviderProfile): OpenAI {
  return new OpenAI({ baseURL: p.baseURL, apiKey: p.apiKey });
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

interface ChatOpts {
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Провайдер-специфичные поля тела запроса (enable_thinking, temperature, ...). */
  extraBody?: Record<string, unknown>;
  maxTokens?: number;
  /** Сколько раз добирать ответ, оборванный по лимиту токенов. */
  maxContinuations?: number;
  onUsage?: (u: UsageInfo) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422]);

/**
 * Client errors (4xx like bad request/auth/not-found/unprocessable) will
 * never succeed on retry, so we fail fast on those. Everything else
 * (429 rate-limit, 5xx, network errors with no status) is transient and
 * worth retrying.
 */
export function isRetryable(e: unknown): boolean {
  if (e && typeof e === 'object' && 'status' in e) {
    const status = (e as { status?: unknown }).status;
    if (typeof status === 'number' && NON_RETRYABLE_STATUSES.has(status)) {
      return false;
    }
  }
  return true;
}

const CONTINUE_PROMPT =
  'Ответ оборвался по лимиту длины. Продолжи РОВНО с места обрыва, ' +
  'не повторяя уже выданное и не начиная заново. Не добавляй пояснений.';

/**
 * Один вызов модели с ретраями. Ответ, оборванный провайдером по лимиту токенов
 * (finish_reason: 'length'), добирается продолжениями и склеивается: без этого
 * HTML на 6-9k токенов у провайдеров с дефолтом 4096 приходит без </html>
 * и кандидат гибнет на разборе.
 */
export async function chatWithClient(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  {
    retries = 3, sleep = defaultSleep, extraBody, maxTokens,
    maxContinuations = 2, onUsage,
  }: ChatOpts = {},
): Promise<string> {
  const convo: ChatMessage[] = [...messages];
  let combined = '';

  for (let round = 0; round <= maxContinuations; round++) {
    const { text, truncated } = await once(
      client, model, convo, { retries, sleep, extraBody, maxTokens, onUsage });
    combined += text;
    if (!truncated) return combined;
    if (round === maxContinuations) return combined;
    convo.push({ role: 'assistant', content: text });
    convo.push({ role: 'user', content: CONTINUE_PROMPT });
  }
  return combined;
}

async function once(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  { retries, sleep, extraBody, maxTokens, onUsage }: Required<Pick<ChatOpts, 'retries' | 'sleep'>>
    & Pick<ChatOpts, 'extraBody' | 'maxTokens' | 'onUsage'>,
): Promise<{ text: string; truncated: boolean }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const started = Date.now();
    try {
      const res = await client.chat.completions.create({
        model,
        messages: messages as never,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...extraBody,
      });
      const choice = res.choices[0];
      const text = choice?.message?.content;
      if (!text) throw new Error('empty response from provider');
      onUsage?.({
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
        ms: Date.now() - started,
      });
      return { text, truncated: choice?.finish_reason === 'length' };
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
      if (attempt < retries - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export function bindChat(
  p: ProviderProfile,
  role: Role,
  onUsage?: (u: UsageInfo & { role: Role; model: string }) => void,
): ChatFn {
  const client = makeClient(p);
  const { model, maxTokens, extraBody } = resolveRole(p, role);
  return (messages) => chatWithClient(client, model, messages, {
    extraBody, maxTokens,
    onUsage: onUsage ? (u) => onUsage({ ...u, role, model }) : undefined,
  });
}
