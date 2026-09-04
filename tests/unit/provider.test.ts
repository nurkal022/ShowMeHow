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

function fakeClientWithFinish(
  chunks: Array<{ content: string; finish?: string }>,
) {
  let i = 0;
  return {
    chat: { completions: { create: vi.fn(async () => {
      const c = chunks[Math.min(i++, chunks.length - 1)];
      return {
        choices: [{ message: { content: c.content }, finish_reason: c.finish ?? 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };
    }) } },
  };
}

describe('обрыв по лимиту токенов', () => {
  it('склеивает продолжение при finish_reason=length', async () => {
    const c = fakeClientWithFinish([
      { content: '<html><body>нача', finish: 'length' },
      { content: 'ло и конец</body></html>', finish: 'stop' },
    ]);
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }]);
    expect(out).toBe('<html><body>начало и конец</body></html>');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('перестаёт продолжать после maxContinuations и отдаёт склеенное', async () => {
    const c = fakeClientWithFinish([{ content: 'кусок', finish: 'length' }]);
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { maxContinuations: 2 });
    expect(out).toBe('кусоккусоккусок');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(3);
  });

  it('передаёт max_tokens и сообщает usage', async () => {
    const c = fakeClientWithFinish([{ content: 'ок' }]);
    const seen: Array<{ promptTokens: number; completionTokens: number }> = [];
    await chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { maxTokens: 777, onUsage: (u) => seen.push(u) });
    expect(c.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 777 }));
    expect(seen[0].promptTokens).toBe(10);
    expect(seen[0].completionTokens).toBe(20);
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
