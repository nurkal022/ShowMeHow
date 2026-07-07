import OpenAI from 'openai';
import type { ProviderProfile } from './types';

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

interface ChatOpts {
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
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

export async function chatWithClient(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  { retries = 3, sleep = defaultSleep }: ChatOpts = {},
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: messages as never,
      });
      const text = res.choices[0]?.message?.content;
      if (!text) throw new Error('empty response from provider');
      return text;
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
      if (attempt < retries - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export function bindChat(p: ProviderProfile, model: string): ChatFn {
  const client = makeClient(p);
  return (messages) => chatWithClient(client, model, messages);
}
