import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { REQUEUE_WARNING, type ClaimedJob, type JobOutcome, type JobStore, type NewJob } from '@/lib/jobs/store';
import { createWorker, type Execute, type JobIO, type Worker, type WorkerOptions } from '@/lib/worker/worker';
import { executeJob, type ExecuteDeps } from '@/lib/worker/execute';
import type { Ctx } from '@/lib/pipeline/stages';

interface Run { job: ClaimedJob; io: JobIO; finish: (o: JobOutcome) => void }

/** Исполнитель, которым управляет тест: каждое задание висит, пока тест его не завершит. */
function controlled() {
  const runs: Run[] = [];
  const execute: Execute = (job, io) =>
    new Promise<JobOutcome>((resolve) => { runs.push({ job, io, finish: resolve }); });
  return { runs, execute };
}

let clock = 0;
let store: JobStore;
let count = 0;

function makeWorker(execute: Execute, extra: Partial<WorkerOptions> = {}): Worker {
  count++;
  return createWorker({
    store, execute, concurrency: 2, drainMs: 1000, id: `w-${count}`, host: 'test', log: () => {},
    ...extra,
  });
}

const newJob = (priority = 0): NewJob => ({
  ownerId: crypto.randomUUID(), kind: 'generate', priority,
  request: { prompt: 'p', mode: 'fast', hasImage: false },
});
const done = (): JobOutcome => ({ status: 'done', simulationId: crypto.randomUUID() });

beforeEach(() => {
  clock = Date.parse('2026-09-17T10:00:00Z');
  store = createMemoryJobStore({ now: () => clock });
  count = 0;
});

describe('воркер', () => {
  it('держит не больше concurrency заданий и берёт следующее по освобождении', async () => {
    const { runs, execute } = controlled();
    for (let i = 0; i < 3; i++) await store.create(newJob());
    const w = makeWorker(execute);
    await w.fill();
    expect(runs).toHaveLength(2);
    expect(w.running()).toBe(2);
    expect((await store.stats()).queued).toBe(1);
    runs[0].finish(done());
    await vi.waitFor(() => expect(runs).toHaveLength(3));
  });

  it('берёт по приоритету, затем по времени', async () => {
    const order: string[] = [];
    const low1 = await store.create(newJob(0));
    const high = await store.create(newJob(10));
    const low2 = await store.create(newJob(0));
    const w = makeWorker(async (job) => { order.push(job.id); return done(); }, { concurrency: 1 });
    await w.fill();
    await vi.waitFor(() => expect(order).toEqual([high.id, low1.id, low2.id]));
  });

  it('пишет события по порядку, done пайплайна заменяет финальным', async () => {
    const simId = crypto.randomUUID();
    const job = await store.create(newJob());
    const w = makeWorker(async (_job, io) => {
      io.emit({ type: 'stage', stage: 'planning', status: 'start', at: 1 });
      io.emit({ type: 'warning', message: 'осторожно' });
      io.emit({ type: 'done', simulationId: simId });
      return { status: 'done', simulationId: simId };
    });
    await w.fill();
    await w.idle();
    expect((await store.events(job.id, 0)).map((e) => e.event)).toEqual([
      { type: 'stage', stage: 'planning', status: 'start', at: 1 },
      { type: 'warning', message: 'осторожно' },
      { type: 'done', simulationId: simId },
    ]);
    expect(await store.get(job.id)).toMatchObject({ status: 'done', simulationId: simId });
  });

  it('исключение исполнителя превращается в ошибку задания', async () => {
    const job = await store.create(newJob());
    const w = makeWorker(async () => { throw new Error('сломалось'); });
    await w.fill();
    await w.idle();
    expect(await store.get(job.id)).toMatchObject({ status: 'error', error: 'сломалось' });
  });

  it('отменённое в очереди задание не берётся', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    await store.cancelQueued(job.id);
    await makeWorker(execute).fill();
    expect(runs).toHaveLength(0);
  });

  it('отмена идущего доходит до пайплайна через сердцебиение', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    const w = makeWorker(execute);
    await w.fill();
    await store.requestCancel(job.id);
    expect(runs[0].io.cancelled()).toBe(false);
    await w.heartbeat();
    expect(runs[0].io.cancelled()).toBe(true);
    runs[0].finish({ status: 'cancelled' });
    await w.idle();
    expect((await store.get(job.id))?.status).toBe('cancelled');
    expect((await store.events(job.id, 0)).at(-1)?.event).toEqual({ type: 'cancelled' });
  });

  it('мягкая остановка: новых не берёт, текущие доделывает', async () => {
    const { runs, execute } = controlled();
    const first = await store.create(newJob());
    const w = makeWorker(execute, { concurrency: 1 });
    w.start();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    const second = await store.create(newJob());
    const stopping = w.stop();
    runs[0].finish(done());
    expect(await stopping).toEqual({ drained: true });
    await w.fill();
    expect(runs).toHaveLength(1);
    expect((await store.get(first.id))?.status).toBe('done');
    expect((await store.get(second.id))?.status).toBe('queued');
    expect((await store.stats()).workersAlive).toBe(0);
  });

  it('мягкая остановка ограничена по времени', async () => {
    const { execute } = controlled();
    await store.create(newJob());
    const w = makeWorker(execute, { drainMs: 20 });
    await w.fill();
    expect(await w.stop()).toEqual({ drained: false });
  });

  it('потерявший аренду воркер не завершает задание, его берёт другой', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    const a = makeWorker(execute, { concurrency: 1 });
    await a.fill();
    clock += 5 * 60_000;
    const b = makeWorker(execute, { concurrency: 1 });
    await b.reap();
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    await a.heartbeat();
    expect(runs[0].io.cancelled()).toBe(true);
    runs[0].finish(done());
    await vi.waitFor(() => expect(a.running()).toBe(0));
    expect(await store.get(job.id)).toMatchObject({ status: 'running', attempts: 2 });
    expect((await store.events(job.id, 0)).map((e) => e.event))
      .toEqual([{ type: 'warning', message: REQUEUE_WARNING }]);
  });

  it('уборщик зовёт дополнительную уборку', async () => {
    const onReap = vi.fn(async () => {});
    await makeWorker(async () => done(), { onReap }).reap();
    expect(onReap).toHaveBeenCalledTimes(1);
  });

  it('повтор после потери завершает сохранённое задание без второй генерации', async () => {
    const simId = crypto.randomUUID();
    let generations = 0;
    const deps: ExecuteDeps = {
      makeCtx: () => ({}) as Ctx,
      runPipeline: async (_ctx, input) => {
        generations++;
        await input.onSaved?.(simId);
        return new Promise<never>(() => {});   // воркер «завис» после сохранения
      },
      refineExisting: async () => {},
    };
    const execute: Execute = (job, io) => executeJob(job, io, deps);
    const job = await store.create(newJob());
    await makeWorker(execute).fill();
    await vi.waitFor(async () => expect((await store.get(job.id))?.simulationId).toBe(simId));
    clock += 5 * 60_000;
    await makeWorker(execute).reap();
    await vi.waitFor(async () => expect((await store.get(job.id))?.status).toBe('done'));
    expect(generations).toBe(1);
    expect((await store.get(job.id))?.simulationId).toBe(simId);
  });

  it('сбой записи сохранения — ошибка задания, запись в журнал, слот свободен', async () => {
    const log = vi.fn();
    const failing: JobStore = {
      ...store,
      markSaved: async () => { throw new Error('connection reset'); },
    };
    const deps: ExecuteDeps = {
      makeCtx: () => ({}) as Ctx,
      runPipeline: async (_ctx, input) => {
        await input.onSaved?.(crypto.randomUUID());
        throw new Error('не должно дойти');
      },
      refineExisting: async () => {},
    };
    const job = await store.create(newJob());
    const w = createWorker({
      store: failing, execute: (j, io) => executeJob(j, io, deps),
      concurrency: 1, drainMs: 1000, id: 'w-save', host: 'test', log,
    });
    await w.fill();
    await w.idle();
    expect(w.running()).toBe(0);
    expect(await store.get(job.id)).toMatchObject({
      status: 'error', error: 'Не удалось записать результат генерации.',
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(job.id), expect.any(Error));
  });

  it('тот же воркер снова взял своё задание — старая попытка ничего не пишет', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    const w = makeWorker(execute, { concurrency: 2 });
    await w.fill();
    clock += 5 * 60_000;
    await w.reap();
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(runs[0].io.cancelled()).toBe(true);
    runs[0].finish({ status: 'error', message: 'старая попытка' });
    await vi.waitFor(() => expect(w.running()).toBe(1));
    expect((await store.events(job.id, 0)).length).toBe(1);
    expect((await store.get(job.id))?.status).toBe('running');
    runs[1].finish(done());
    await w.idle();
    expect((await store.get(job.id))?.status).toBe('done');
  });

  it('заменённая попытка не пишет ни событий, ни сохранения', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    const w = makeWorker(execute, { concurrency: 2 });
    await w.fill();
    clock += 5 * 60_000;
    await w.reap();
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    runs[0].io.emit({ type: 'warning', message: 'от старой попытки' });
    await expect(runs[0].io.markSaved(crypto.randomUUID())).rejects.toThrow();
    runs[0].finish(done());
    await vi.waitFor(() => expect(w.running()).toBe(1));
    expect((await store.events(job.id, 0)).map((e) => e.event))
      .toEqual([{ type: 'warning', message: REQUEUE_WARNING }]);
    expect(await store.get(job.id)).toMatchObject({ status: 'running', simulationId: null });
  });

  it('заменённая, но ещё идущая попытка занимает слот, и stop её ждёт', async () => {
    const { runs, execute } = controlled();
    await store.create(newJob());
    const w = makeWorker(execute, { concurrency: 2 });
    await w.fill();
    clock += 5 * 60_000;
    await w.reap();
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    // Старая попытка ещё крутится: второй слот занят, новое задание ждёт.
    await store.create(newJob());
    await w.fill();
    expect(runs).toHaveLength(2);
    expect(w.running()).toBe(2);
    const stopping = w.stop();
    let settled = false;
    void stopping.then(() => { settled = true; });
    runs[1].finish(done());
    await vi.waitFor(() => expect(w.running()).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    runs[0].finish(done());
    expect(await stopping).toEqual({ drained: true });
    expect((await store.stats()).queued).toBe(1);
  });

  it('сбой finish: слот свободен, аренда не продлевается, уборщик возвращает задание', async () => {
    const log = vi.fn();
    let failFinish = true;
    const flaky: JobStore = {
      ...store,
      finish: async (...a) => {
        if (failFinish) { failFinish = false; throw new Error('connection reset'); }
        return store.finish(...a);
      },
    };
    const job = await store.create(newJob());
    const w = createWorker({
      store: flaky, execute: async () => done(), concurrency: 1, drainMs: 1000,
      id: 'w-finish', host: 'test', log,
    });
    await w.fill();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining(job.id), expect.any(Error)));
    await vi.waitFor(() => expect(w.running()).toBe(0));
    clock += 5 * 60_000;
    await w.heartbeat();
    await w.reap();
    await vi.waitFor(async () => expect(await store.get(job.id)).toMatchObject({ status: 'done', attempts: 2 }));
  });

  it('гонка сердцебиения не теряет задание, взятое заново во время запроса', async () => {
    const { runs, execute } = controlled();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const racy: JobStore = {
      ...store,
      // Запрос «увидел» задание уже в очереди: в продлённых его нет.
      heartbeat: async () => { await gate; return { leased: [], cancelRequested: [] }; },
    };
    const job = await store.create(newJob());
    const w = createWorker({
      store: racy, execute, concurrency: 2, drainMs: 1000, id: 'w-race', host: 'test', log: () => {},
    });
    await w.fill();
    const beat = w.heartbeat();
    clock += 5 * 60_000;
    await w.reap();
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    release();
    await beat;
    expect(runs[0].io.cancelled()).toBe(true);
    expect(runs[1].io.cancelled()).toBe(false);
    runs[1].finish(done());
    runs[0].finish(done());
    await w.idle();
    expect((await store.get(job.id))?.status).toBe('done');
  });

  it('бросающий журнал не роняет воркер', async () => {
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => { rejections.push(e); };
    process.on('unhandledRejection', onRejection);
    try {
      const job = await store.create(newJob());
      const w = makeWorker(async () => { throw new Error('сломалось'); },
        { log: () => { throw new Error('журнал сломан'); } });
      await w.fill();
      await w.idle();
      await new Promise((r) => setTimeout(r, 10));
      expect(rejections).toEqual([]);
      expect(await store.get(job.id)).toMatchObject({ status: 'error' });
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  describe('таймеры', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('start заводит опрос, сердцебиение и уборщика, stop их снимает', async () => {
      const calls = { claim: 0, heartbeat: 0, reap: 0 };
      const spy: JobStore = {
        ...store,
        claim: async (id) => { calls.claim++; return store.claim(id); },
        heartbeat: async (...a) => { calls.heartbeat++; return store.heartbeat(...a); },
        reap: async () => { calls.reap++; return store.reap(); },
      };
      const w = createWorker({
        store: spy, execute: async () => done(), concurrency: 1, drainMs: 1000,
        id: 'w-timers', host: 'test', log: () => {},
        pollMs: 100, heartbeatMs: 200, reapMs: 300,
      });
      w.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toEqual({ claim: 1, heartbeat: 1, reap: 0 });
      await vi.advanceTimersByTimeAsync(600);
      expect(calls).toEqual({ claim: 7, heartbeat: 4, reap: 2 });
      expect(await w.stop()).toEqual({ drained: true });
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toEqual({ claim: 7, heartbeat: 4, reap: 2 });
    });

    it('повторный start не заводит вторые таймеры и подписку', async () => {
      let subs = 0;
      const counting: JobStore = {
        ...store,
        subscribeQueue: (cb) => { subs++; const off = store.subscribeQueue(cb); return () => { subs--; off(); }; },
      };
      const w = createWorker({
        store: counting, execute: async () => done(), concurrency: 1, drainMs: 1000,
        id: 'w-twice', host: 'test', log: () => {},
      });
      w.start();
      const timers = vi.getTimerCount();
      w.start();
      expect(vi.getTimerCount()).toBe(timers);
      expect(subs).toBe(1);
      await w.stop();
      expect(vi.getTimerCount()).toBe(0);
      expect(subs).toBe(0);
    });

    it('новое задание в очереди будит воркер без ожидания опроса', async () => {
      const seen: string[] = [];
      const w = makeWorker(async (job) => { seen.push(job.id); return done(); }, { pollMs: 60_000 });
      w.start();
      await vi.advanceTimersByTimeAsync(0);
      const job = await store.create(newJob());
      await vi.advanceTimersByTimeAsync(0);
      expect(seen).toEqual([job.id]);
      await w.stop();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
