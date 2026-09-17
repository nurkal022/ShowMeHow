import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Модуль встроенного воркера тянет пайплайн и Playwright; веб-процесс без воркера
// не должен его даже загружать. Фабрика мока вызывается только при импорте модуля.
const embedded = { loaded: 0, started: 0 };

// Каждый тест берёт свежий instrumentation и свежую фабрику: кэш модулей не скрывает загрузку.
async function register(): Promise<void> {
  vi.resetModules();
  vi.doMock('@/lib/worker/embedded', () => {
    embedded.loaded++;
    return { startEmbeddedWorker: () => { embedded.started++; return null; } };
  });
  await (await import('@/instrumentation')).register();
}

const saved = { ...process.env };

beforeEach(() => {
  embedded.loaded = 0;
  embedded.started = 0;
  process.env.NEXT_RUNTIME = 'nodejs';
  delete process.env.NEXT_PHASE;
});
afterEach(() => {
  vi.doUnmock('@/lib/worker/embedded');
  process.env = { ...saved };
});

describe('register()', () => {
  it('с выключенным воркером модуль воркера не загружается', async () => {
    process.env.SHOWMEHOW_EMBEDDED_WORKER = '0';
    await register();
    expect(embedded.loaded).toBe(0);
  });

  it('во время сборки модуль воркера не загружается даже при явном включении', async () => {
    process.env.SHOWMEHOW_EMBEDDED_WORKER = '1';
    process.env.NEXT_PHASE = 'phase-production-build';
    await register();
    expect(embedded.loaded).toBe(0);
  });

  it('в Edge-рантайме ничего не загружается', async () => {
    process.env.SHOWMEHOW_EMBEDDED_WORKER = '1';
    process.env.NEXT_RUNTIME = 'edge';
    await register();
    expect(embedded.loaded).toBe(0);
  });

  it('включённый воркер загружается и запускается', async () => {
    process.env.SHOWMEHOW_EMBEDDED_WORKER = '1';
    await register();
    expect(embedded.loaded).toBe(1);
    expect(embedded.started).toBe(1);
  });
});
