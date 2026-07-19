import { describe, it, expect, vi } from 'vitest';
import { chatWithClient, textPart, imagePart, isRetryable } from '@/lib/provider';

function withStatus(err: Error, status: number): Error {
  return Object.assign(err, { status });
}

function fakeClient(responses: Array<string | Error>) {
  let i = 0;
  return {
    chat: { completions: { create: vi.fn(async () => {
      const r = responses[Math.min(i++, responses.length - 1)];
      if (r instanceof Error) throw r;
      return { choices: [{ message: { content: r } }] };
    }) } },
  };
}

describe('chatWithClient', () => {
  it('returns content on success', async () => {
    const c = fakeClient(['привет']);
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'hi' }]);
    expect(out).toBe('привет');
  });

  it('passes extraBody through to the create call', async () => {
    const c = fakeClient(['ok']);
    await chatWithClient(c as never, 'm', [{ role: 'user', content: 'hi' }],
      { extraBody: { enable_thinking: false, temperature: 0.2 } });
    expect(c.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ enable_thinking: false, temperature: 0.2, model: 'm' }));
  });

  it('retries with backoff then succeeds', async () => {
    const c = fakeClient([new Error('503'), new Error('503'), 'ok']);
    const sleeps: number[] = [];
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'hi' }],
      { sleep: async (ms) => { sleeps.push(ms); } });
    expect(out).toBe('ok');
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('throws after 3 failed attempts', async () => {
    const c = fakeClient([new Error('boom')]);
    await expect(chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { sleep: async () => {} })).rejects.toThrow('boom');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(3);
  });

  it('treats empty content as error', async () => {
    const c = fakeClient(['']);
    await expect(chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { sleep: async () => {} })).rejects.toThrow(/empty/i);
  });

  it('content part helpers', () => {
    expect(textPart('a')).toEqual({ type: 'text', text: 'a' });
    expect(imagePart('data:x')).toEqual({ type: 'image_url', image_url: { url: 'data:x' } });
  });

  it('does not retry on a 401 (non-retryable status): fails after exactly 1 attempt', async () => {
    const c = fakeClient([withStatus(new Error('unauthorized'), 401)]);
    await expect(chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { sleep: async () => {} })).rejects.toThrow('unauthorized');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('retries on a 429 (retryable status): 3 attempts', async () => {
    const c = fakeClient([withStatus(new Error('rate limited'), 429)]);
    await expect(chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { sleep: async () => {} })).rejects.toThrow('rate limited');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(3);
  });

  it('retries on an error without a status: 3 attempts', async () => {
    const c = fakeClient([new Error('boom')]);
    await expect(chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { sleep: async () => {} })).rejects.toThrow('boom');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(3);
  });
});

describe('isRetryable', () => {
  it('returns false for non-retryable 4xx statuses', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryable(withStatus(new Error('x'), status))).toBe(false);
    }
  });

  it('returns true for 429, 5xx, and statusless errors', () => {
    expect(isRetryable(withStatus(new Error('x'), 429))).toBe(true);
    expect(isRetryable(withStatus(new Error('x'), 500))).toBe(true);
    expect(isRetryable(withStatus(new Error('x'), 503))).toBe(true);
    expect(isRetryable(new Error('network fail'))).toBe(true);
    expect(isRetryable('not an object')).toBe(true);
    expect(isRetryable(null)).toBe(true);
  });
});
