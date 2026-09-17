import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  __resetOpenStreamsForTests, closeAllStreams, closeStreamsOnSigterm, openStreamCount, registerStream,
} from '@/lib/jobs/open-streams';

beforeEach(() => __resetOpenStreamsForTests());
afterEach(() => __resetOpenStreamsForTests());

describe('реестр открытых потоков', () => {
  it('закрывает все зарегистрированные потоки, снятые с учёта не трогает', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerStream(a);
    const unregisterB = registerStream(b)!;
    expect(openStreamCount()).toBe(2);
    unregisterB();
    expect(openStreamCount()).toBe(1);
    expect(closeAllStreams()).toBe(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(openStreamCount()).toBe(0);
  });

  it('после остановки новые потоки не принимаются', () => {
    closeAllStreams();
    const c = vi.fn();
    expect(registerStream(c)).toBeNull();
    expect(openStreamCount()).toBe(0);
  });

  it('сбой одного закрытия не мешает остальным', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    registerStream(() => { throw new Error('сломан'); });
    registerStream(ok);
    expect(closeAllStreams()).toBe(2);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('реестр общий для разных экземпляров модуля', async () => {
    const close = vi.fn();
    registerStream(close);
    vi.resetModules();
    const fresh = await import('@/lib/jobs/open-streams');
    expect(fresh.closeAllStreams()).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('SIGTERM закрывает потоки; обработчик ставится один раз', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const proc = new EventEmitter();
    closeStreamsOnSigterm(proc as unknown as NodeJS.Process);
    closeStreamsOnSigterm(proc as unknown as NodeJS.Process);
    expect(proc.listenerCount('SIGTERM')).toBe(1);
    const close = vi.fn();
    registerStream(close);
    proc.emit('SIGTERM');
    expect(close).toHaveBeenCalledTimes(1);
    expect(registerStream(vi.fn())).toBeNull();
    expect(proc.listenerCount('SIGTERM')).toBe(0);
    log.mockRestore();
  });
});
