import { describe, it, expect, vi } from 'vitest';
import { chatWithClient, textPart, imagePart } from '@/lib/provider';

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
});
