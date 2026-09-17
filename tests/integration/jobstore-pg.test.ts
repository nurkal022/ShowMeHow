import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createPgJobStore } from '@/lib/jobs/store-pg';
import { closeListener } from '@/lib/jobs/listener';
import { jobStoreContract } from '../jobstore-contract';

const SCHEMA = 'jobstore_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => {
  await closeListener();
  await pool?.end();
  await closeDb();
});

async function cleanStore() {
  await pool!.query('DELETE FROM job_events; DELETE FROM jobs; DELETE FROM workers; DELETE FROM users;');
  return {
    store: createPgJobStore(pool!),
    owner: async () => (await createUser(`u-${crypto.randomUUID()}@example.com`, 'пароль123')).id,
    expireLeases: async () => {
      await pool!.query(
        "UPDATE jobs SET locked_until = now() - interval '5 minutes' WHERE status = 'running'");
    },
  };
}

jobStoreContract('Postgres', cleanStore, !pool);

describe.skipIf(!pool)('Postgres: то, чего нет у памяти', () => {
  it('два одновременных claim из разных соединений берут разные задания', async () => {
    const env = await cleanStore();
    for (let i = 0; i < 2; i++) {
      await env.store.create({
        ownerId: await env.owner(), kind: 'generate', priority: 0,
        request: { prompt: 'p', mode: 'fast', hasImage: false },
      });
    }
    const url = process.env.DATABASE_URL!;
    const poolA = new Pool({ connectionString: url });
    const poolB = new Pool({ connectionString: url });
    try {
      const [a, b] = await Promise.all([
        createPgJobStore(poolA).claim('wa'), createPgJobStore(poolB).claim('wb')]);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a!.id).not.toBe(b!.id);
    } finally {
      await poolA.end();
      await poolB.end();
    }
  });

  it('finish стирает картинку и аренду', async () => {
    const env = await cleanStore();
    const job = await env.store.create({
      ownerId: await env.owner(), kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: true }, imageDataUrl: 'data:image/png;base64,AA',
    });
    await env.store.claim('w1');
    await env.store.finish(job.id, 'w1', { status: 'cancelled' });
    const { rows } = await pool!.query(
      'SELECT image_data_url, locked_by, locked_until FROM jobs WHERE id = $1', [job.id]);
    expect(rows[0]).toEqual({ image_data_url: null, locked_by: null, locked_until: null });
  });

  it('старое задание без job_events отдаёт журнал из jobs.events', async () => {
    const env = await cleanStore();
    const owner = await env.owner();
    const id = crypto.randomUUID();
    const legacy = [
      { type: 'stage', stage: 'planning', status: 'start', at: 1 },
      { type: 'done', simulationId: '33333333-3333-3333-3333-333333333333' },
    ];
    await pool!.query(
      "INSERT INTO jobs (id, owner_id, status, request, events, simulation_id) VALUES ($1,$2,'done','{}'::jsonb,$3::jsonb,$4)",
      [id, owner, JSON.stringify(legacy), '33333333-3333-3333-3333-333333333333']);
    expect(await env.store.events(id, 0)).toEqual([
      { seq: 1, event: legacy[0] }, { seq: 2, event: legacy[1] },
    ]);
    expect(await env.store.events(id, 1)).toEqual([{ seq: 2, event: legacy[1] }]);
  });

  it('уборщик при отмене пишет событие, время завершения и стирает картинку', async () => {
    const env = await cleanStore();
    const job = await env.store.create({
      ownerId: await env.owner(), kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: true }, imageDataUrl: 'data:image/png;base64,AA',
    });
    await env.store.claim('w1');
    await env.store.requestCancel(job.id);
    await env.expireLeases();
    expect(await env.store.reap()).toEqual([{ id: job.id, decision: 'cancel' }]);
    expect((await env.store.get(job.id))?.finishedAt).not.toBeNull();
    expect((await env.store.events(job.id, 0)).at(-1)?.event).toEqual({ type: 'cancelled' });
    const { rows } = await pool!.query(
      'SELECT image_data_url, locked_by, locked_until FROM jobs WHERE id = $1', [job.id]);
    expect(rows[0]).toEqual({ image_data_url: null, locked_by: null, locked_until: null });
  });

  it('finish и markSaved с id не в формате uuid ничего не делают', async () => {
    const env = await cleanStore();
    await expect(env.store.finish('nope', 'w1', { status: 'cancelled' })).resolves.toBe(false);
    await expect(env.store.markSaved('nope', 'w1', crypto.randomUUID())).resolves.toBeUndefined();
  });

  it('NOTIFY из транзакций доходит: отмена в очереди и возврат уборщиком', async () => {
    const env = await cleanStore();
    const queued = await env.store.create({
      ownerId: await env.owner(), kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: false },
    });
    const onChange = vi.fn();
    const off = env.store.subscribe(queued.id, onChange);
    // Слушатель будит всех при подключении — даём ему осесть и считаем после.
    await new Promise((r) => setTimeout(r, 300));
    const before = onChange.mock.calls.length;
    await env.store.cancelQueued(queued.id);
    await vi.waitFor(() => expect(onChange.mock.calls.length).toBeGreaterThan(before), { timeout: 3000 });
    off();

    const lost = await env.store.create({
      ownerId: await env.owner(), kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: false },
    });
    await env.store.claim('w1');
    await env.expireLeases();
    const onQueued = vi.fn();
    const offQueue = env.store.subscribeQueue(onQueued);
    await new Promise((r) => setTimeout(r, 300));
    const queuedBefore = onQueued.mock.calls.length;
    expect(await env.store.reap()).toEqual([{ id: lost.id, decision: 'requeue' }]);
    await vi.waitFor(
      () => expect(onQueued.mock.calls.length).toBeGreaterThan(queuedBefore), { timeout: 3000 });
    offQueue();
  });

  it('подписка по id в верхнем регистре получает уведомления', async () => {
    const env = await cleanStore();
    const newJob = async () => env.store.create({
      ownerId: await env.owner(), kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: false },
    });
    const running = await newJob();
    await env.store.claim('w1');
    const queued = await newJob();
    const onRunning = vi.fn();
    const onQueued = vi.fn();
    const offRunning = env.store.subscribe(running.id.toUpperCase(), onRunning);
    const offQueued = env.store.subscribe(queued.id.toUpperCase(), onQueued);
    await new Promise((r) => setTimeout(r, 300));
    onRunning.mockClear();
    onQueued.mockClear();
    // Событие воркера (appendEvent) и событие из транзакции (cancelQueued по id в верхнем регистре).
    await env.store.appendEvent(running.id, { type: 'warning', message: 'x' }, 'w1');
    expect(await env.store.cancelQueued(queued.id.toUpperCase())).toBe(true);
    await vi.waitFor(() => {
      expect(onRunning).toHaveBeenCalled();
      expect(onQueued).toHaveBeenCalled();
    }, { timeout: 3000 });
    offRunning();
    offQueued();
  });

  it('событие воркера ждёт идущего finish и после него не пишется', async () => {
    const env = await cleanStore();
    const job = await env.store.create({
      ownerId: await env.owner(), kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: false },
    });
    await env.store.claim('w1');
    const other = await pool!.connect();
    try {
      // Та же последовательность, что у finish, но с паузой между UPDATE и событием.
      await other.query('BEGIN');
      await other.query(
        "UPDATE jobs SET status = 'done', locked_by = NULL, locked_until = NULL WHERE id = $1", [job.id]);
      let settled = false;
      const pending = env.store.appendEvent(job.id, { type: 'warning', message: 'поздно' }, 'w1')
        .finally(() => { settled = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);
      await other.query(
        "INSERT INTO job_events (job_id, seq, event) VALUES ($1, 1, '{\"type\":\"cancelled\"}'::jsonb)",
        [job.id]);
      await other.query('COMMIT');
      expect(await pending).toBeNull();
      expect(await env.store.events(job.id, 0)).toEqual([{ seq: 1, event: { type: 'cancelled' } }]);
    } catch (e) {
      await other.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      other.release();
    }
  });

  it('сердцебиение пишет строку воркера', async () => {
    const env = await cleanStore();
    await env.store.heartbeat('host:1:abc', 'host', 0, []);
    await env.store.heartbeat('host:1:abc', 'host', 2, []);
    const { rows } = await pool!.query('SELECT id, host, running FROM workers');
    expect(rows).toEqual([{ id: 'host:1:abc', host: 'host', running: 2 }]);
  });
});
