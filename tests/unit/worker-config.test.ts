import { describe, it, expect } from 'vitest';
import { workerConcurrency, drainSeconds, embeddedWorkerEnabled } from '@/lib/worker/config';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('настройки воркера', () => {
  it('слоты: по умолчанию два, число из окружения, мусор — ошибка', () => {
    expect(workerConcurrency(env({}))).toBe(2);
    expect(workerConcurrency(env({ WORKER_CONCURRENCY: '4' }))).toBe(4);
    expect(() => workerConcurrency(env({ WORKER_CONCURRENCY: '0' }))).toThrow(/WORKER_CONCURRENCY/);
    expect(() => workerConcurrency(env({ WORKER_CONCURRENCY: 'два' }))).toThrow(/WORKER_CONCURRENCY/);
  });

  it('ожидание при остановке: по умолчанию десять минут', () => {
    expect(drainSeconds(env({}))).toBe(600);
    expect(drainSeconds(env({ WORKER_DRAIN_SECONDS: '0' }))).toBe(0);
    expect(() => drainSeconds(env({ WORKER_DRAIN_SECONDS: '-1' }))).toThrow(/WORKER_DRAIN_SECONDS/);
  });

  it('встроенный воркер: в dev включён, в продакшне выключен, переменная решает', () => {
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'development' }))).toBe(true);
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'production' }))).toBe(false);
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'development', SHOWMEHOW_EMBEDDED_WORKER: '0' }))).toBe(false);
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'production', SHOWMEHOW_EMBEDDED_WORKER: '1' }))).toBe(true);
  });

  it('во время сборки встроенный воркер не запускается', () => {
    expect(embeddedWorkerEnabled(env({
      NODE_ENV: 'production', SHOWMEHOW_EMBEDDED_WORKER: '1', NEXT_PHASE: 'phase-production-build',
    }))).toBe(false);
  });
});
