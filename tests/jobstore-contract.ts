import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  ActiveJobExistsError, LOST_TWICE_MESSAGE, REQUEUE_WARNING,
  type JobStore, type NewJob,
} from '@/lib/jobs/store';

export interface ContractEnv {
  store: JobStore;
  /** Новый владелец; для Postgres — настоящая строка users. */
  owner(): Promise<string>;
  /** Сдвигает все аренды в прошлое дальше порога уборщика. */
  expireLeases(): Promise<void>;
}

const REQUEST = { prompt: 'маятник', mode: 'fast' as const, hasImage: false };

/**
 * Одни и те же гарантии для обоих драйверов: драйвер в памяти обязан вести себя
 * как Postgres, иначе юниты роутов и воркера проверяли бы не то поведение.
 */
export function jobStoreContract(label: string, setup: () => Promise<ContractEnv>, skip = false): void {
  describe.skipIf(skip)(`хранилище заданий: ${label}`, () => {
    let env: ContractEnv;
    let store: JobStore;
    const gen = (ownerId: string, extra: Partial<NewJob> = {}): NewJob =>
      ({ ownerId, kind: 'generate', priority: 0, request: REQUEST, ...extra });

    beforeEach(async () => {
      env = await setup();
      store = env.store;
    });

    it('create и get: новое задание в очереди', async () => {
      const owner = await env.owner();
      const job = await store.create(gen(owner));
      expect(job).toMatchObject({
        ownerId: owner, kind: 'generate', status: 'queued', priority: 0, request: REQUEST,
        attempts: 0, simulationId: null, error: null, cancelRequested: false,
        targetSimulationId: null, startedAt: null, finishedAt: null,
      });
      expect(await store.get(job.id)).toEqual(job);
      expect(await store.get(crypto.randomUUID())).toBeNull();
      expect(await store.get('nope')).toBeNull();
    });

    it('вторая активная генерация того же человека отбивается, доработка разрешена', async () => {
      const owner = await env.owner();
      await store.create(gen(owner));
      await expect(store.create(gen(owner))).rejects.toBeInstanceOf(ActiveJobExistsError);
      const refine = await store.create({
        ownerId: owner, kind: 'refine', priority: 0, request: { instruction: 'медленнее' },
        targetSimulationId: crypto.randomUUID(),
      });
      expect(refine.kind).toBe('refine');
      await expect(store.create({
        ownerId: owner, kind: 'refine', priority: 0, request: { instruction: 'ещё' },
        targetSimulationId: crypto.randomUUID(),
      })).rejects.toBeInstanceOf(ActiveJobExistsError);
      // Другой человек не мешает.
      await store.create(gen(await env.owner()));
    });

    it('после завершения можно запускать новую генерацию', async () => {
      const owner = await env.owner();
      const job = await store.create(gen(owner));
      await store.claim('w1');
      expect(await store.finish(job.id, 'w1', { status: 'error', message: 'сбой' })).toBe(true);
      await expect(store.create(gen(owner))).resolves.toMatchObject({ status: 'queued' });
    });

    it('claim берёт по приоритету, затем по времени, и отдаёт картинку', async () => {
      const low1 = await store.create(gen(await env.owner(), { imageDataUrl: 'data:image/png;base64,AA' }));
      const high = await store.create(gen(await env.owner(), { priority: 10 }));
      const low2 = await store.create(gen(await env.owner()));
      const first = await store.claim('w1');
      expect(first?.id).toBe(high.id);
      expect(first).toMatchObject({ status: 'running', attempts: 1 });
      expect(first?.startedAt).not.toBeNull();
      const second = await store.claim('w1');
      expect(second?.id).toBe(low1.id);
      expect(second?.imageDataUrl).toBe('data:image/png;base64,AA');
      expect((await store.claim('w2'))?.id).toBe(low2.id);
      expect(await store.claim('w2')).toBeNull();
    });

    it('события нумеруются по порядку, чужой воркер писать не может', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'a' }, 'w1')).toBe(1);
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'b' }, 'w1')).toBe(2);
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'чужое' }, 'w2')).toBeNull();
      expect(await store.events(job.id, 0)).toEqual([
        { seq: 1, event: { type: 'warning', message: 'a' } },
        { seq: 2, event: { type: 'warning', message: 'b' } },
      ]);
      expect((await store.events(job.id, 1)).map((e) => e.seq)).toEqual([2]);
      expect(await store.events(crypto.randomUUID(), 0)).toEqual([]);
    });

    it('finish пишет терминальное событие последним и срабатывает один раз', async () => {
      const job = await store.create(gen(await env.owner(), { imageDataUrl: 'data:x' }));
      await store.claim('w1');
      await store.appendEvent(job.id, { type: 'warning', message: 'a' }, 'w1');
      const simId = crypto.randomUUID();
      expect(await store.finish(job.id, 'w2', { status: 'done', simulationId: simId })).toBe(false);
      expect(await store.finish(job.id, 'w1', { status: 'done', simulationId: simId })).toBe(true);
      expect(await store.finish(job.id, 'w1', { status: 'error', message: 'поздно' })).toBe(false);
      const done = await store.get(job.id);
      expect(done).toMatchObject({ status: 'done', simulationId: simId, error: null });
      expect(done?.finishedAt).not.toBeNull();
      const events = await store.events(job.id, 0);
      expect(events.at(-1)).toEqual({ seq: 2, event: { type: 'done', simulationId: simId } });
    });

    it('cancelQueued закрывает только ожидающее задание', async () => {
      const queued = await store.create(gen(await env.owner()));
      expect(await store.cancelQueued(queued.id)).toBe(true);
      expect(await store.cancelQueued(queued.id)).toBe(false);
      expect((await store.get(queued.id))?.status).toBe('cancelled');
      expect(await store.events(queued.id, 0)).toEqual([{ seq: 1, event: { type: 'cancelled' } }]);

      const running = await store.create(gen(await env.owner()));
      await store.claim('w1');
      expect(await store.cancelQueued(running.id)).toBe(false);
      expect((await store.get(running.id))?.status).toBe('running');
    });

    it('requestCancel виден в сердцебиении, аренды продлеваются', async () => {
      const a = await store.create(gen(await env.owner()));
      const b = await store.create(gen(await env.owner()));
      await store.claim('w1');
      await store.claim('w1');
      await store.requestCancel(b.id);
      await store.requestCancel(b.id);
      const beat = await store.heartbeat('w1', 'host', 2);
      expect([...beat.leased].sort()).toEqual([a.id, b.id].sort());
      expect(beat.cancelRequested).toEqual([b.id]);
      expect((await store.get(b.id))?.cancelRequested).toBe(true);
      expect(await store.heartbeat('w2', 'host', 0)).toEqual({ leased: [], cancelRequested: [] });
    });

    it('position считает очередь с учётом приоритета; не в очереди — 0', async () => {
      const first = await store.create(gen(await env.owner()));
      const second = await store.create(gen(await env.owner()));
      const vip = await store.create(gen(await env.owner(), { priority: 10 }));
      expect(await store.position(vip.id)).toBe(1);
      expect(await store.position(first.id)).toBe(2);
      expect(await store.position(second.id)).toBe(3);
      await store.claim('w1');
      expect(await store.position(vip.id)).toBe(0);
      expect(await store.position(second.id)).toBe(2);
      expect(await store.position(crypto.randomUUID())).toBe(0);
    });

    it('уборщик: первая потеря — в очередь с предупреждением, вторая — ошибка', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      await env.expireLeases();
      expect(await store.reap()).toEqual([{ id: job.id, decision: 'requeue' }]);
      expect((await store.get(job.id))?.status).toBe('queued');
      expect((await store.events(job.id, 0)).at(-1)?.event)
        .toEqual({ type: 'warning', message: REQUEUE_WARNING });
      // Потерявший аренду воркер больше ничего не пишет.
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'зомби' }, 'w1')).toBeNull();
      expect(await store.finish(job.id, 'w1', { status: 'error', message: 'зомби' })).toBe(false);

      expect((await store.claim('w2'))?.attempts).toBe(2);
      await env.expireLeases();
      expect(await store.reap()).toEqual([{ id: job.id, decision: 'fail' }]);
      expect(await store.get(job.id)).toMatchObject({ status: 'error', error: LOST_TWICE_MESSAGE });
      expect((await store.events(job.id, 0)).at(-1)?.event)
        .toEqual({ type: 'error', message: LOST_TWICE_MESSAGE });
      expect(await store.reap()).toEqual([]);
    });

    it('уборщик отменяет потерянное задание, которое просили отменить', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      await store.requestCancel(job.id);
      await env.expireLeases();
      expect(await store.reap()).toEqual([{ id: job.id, decision: 'cancel' }]);
      expect((await store.get(job.id))?.status).toBe('cancelled');
    });

    it('живая аренда уборщика не касается', async () => {
      await store.create(gen(await env.owner()));
      await store.claim('w1');
      expect(await store.reap()).toEqual([]);
    });

    it('markSaved запоминает симуляцию и переживает возврат в очередь', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      const simId = crypto.randomUUID();
      await store.markSaved(job.id, 'w2', crypto.randomUUID());
      expect((await store.get(job.id))?.simulationId).toBeNull();
      await store.markSaved(job.id, 'w1', simId);
      await env.expireLeases();
      await store.reap();
      expect((await store.claim('w2'))?.simulationId).toBe(simId);
    });

    it('subscribe сообщает о новых событиях, отписка прекращает', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      const onChange = vi.fn();
      const off = store.subscribe(job.id, onChange);
      await vi.waitFor(async () => {
        await store.appendEvent(job.id, { type: 'warning', message: 'x' }, 'w1');
        expect(onChange).toHaveBeenCalled();
      }, { timeout: 3000, interval: 200 });
      off();
      const calls = onChange.mock.calls.length;
      await store.appendEvent(job.id, { type: 'warning', message: 'y' }, 'w1');
      await new Promise((r) => setTimeout(r, 300));
      expect(onChange.mock.calls.length).toBe(calls);
    });

    it('subscribeQueue сообщает о новом задании', async () => {
      const onQueued = vi.fn();
      const off = store.subscribeQueue(onQueued);
      await vi.waitFor(async () => {
        await store.create(gen(await env.owner()));
        expect(onQueued).toHaveBeenCalled();
      }, { timeout: 3000, interval: 200 });
      off();
    });

    it('stats: очередь, идущие и живые воркеры', async () => {
      expect(await store.stats()).toEqual({
        queued: 0, oldestQueuedSec: null, running: 0, workersAlive: 0, lastWorkerSeenSec: null,
      });
      await store.create(gen(await env.owner()));
      await store.create(gen(await env.owner()));
      await store.claim('w1');
      await store.heartbeat('w1', 'host', 1);
      const s = await store.stats();
      expect(s).toMatchObject({ queued: 1, running: 1, workersAlive: 1 });
      expect(s.oldestQueuedSec).toBeGreaterThanOrEqual(0);
      expect(s.lastWorkerSeenSec).toBeGreaterThanOrEqual(0);
      await store.retireWorker('w1');
      expect((await store.stats()).workersAlive).toBe(0);
    });
  });
}
