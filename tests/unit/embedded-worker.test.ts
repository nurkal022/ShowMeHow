import { describe, it, expect, beforeEach, vi } from 'vitest';

const boot = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/worker/boot', () => ({
  bootWorker: vi.fn(() => {
    boot.calls++;
    return { id: `w${boot.calls}` };
  }),
}));

import { startEmbeddedWorker, __resetEmbeddedForTests } from '@/lib/worker/embedded';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

beforeEach(() => {
  boot.calls = 0;
  __resetEmbeddedForTests();
});

describe('встроенный воркер', () => {
  it('в dev запускается один раз на процесс', () => {
    const first = startEmbeddedWorker(env({ NODE_ENV: 'development' }));
    const second = startEmbeddedWorker(env({ NODE_ENV: 'development' }));
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(boot.calls).toBe(1);
  });

  it('выключенный не запускается', () => {
    expect(startEmbeddedWorker(env({ NODE_ENV: 'development', SHOWMEHOW_EMBEDDED_WORKER: '0' }))).toBeNull();
    expect(startEmbeddedWorker(env({ NODE_ENV: 'production' }))).toBeNull();
    expect(boot.calls).toBe(0);
  });
});
