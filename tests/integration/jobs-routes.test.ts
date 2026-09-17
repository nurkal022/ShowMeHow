import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createPgJobStore } from '@/lib/jobs/store-pg';
import { closeListener } from '@/lib/jobs/listener';
import { GENERATION_BUSY_MESSAGE } from '@/lib/jobs/messages';
import { POST as postGenerate } from '@/app/api/generate/route';
import { GET as getStream } from '@/app/api/jobs/[id]/stream/route';

const SCHEMA = 'jobs_routes_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM job_events; DELETE FROM jobs; DELETE FROM sessions; DELETE FROM users;');
});
afterAll(async () => {
  delete process.env.SHOWMEHOW_API_KEY;
  delete process.env.SHOWMEHOW_MODEL;
  await closeListener();
  await pool?.end();
  await closeDb();
});

async function signIn(): Promise<{ id: string; cookie: string }> {
  const u = await createUser(`u-${crypto.randomUUID()}@example.com`, 'пароль123');
  return { id: u.id, cookie: `${SESSION_COOKIE}=${await createSession(u.id)}` };
}

const generate = (cookie: string) => postGenerate(new Request('http://t/api/generate', {
  method: 'POST', headers: { cookie }, body: JSON.stringify({ prompt: 'маятник' }),
}));

async function readUntilClosed(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6)));
}

describe.skipIf(!pool)('роуты заданий на Postgres', () => {
  it('вторая активная генерация упирается в уникальный индекс и даёт 409', async () => {
    const { cookie } = await signIn();
    const [a, b] = await Promise.all([generate(cookie), generate(cookie)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const busy = a.status === 409 ? a : b;
    expect((await busy.json()).error).toBe(GENERATION_BUSY_MESSAGE);
    const { rows } = await pool!.query('SELECT count(*)::int AS n FROM jobs');
    expect(rows[0].n).toBe(1);
  });

  it('поток получает событие, записанное из другого соединения', async () => {
    const { cookie } = await signIn();
    const { jobId } = await (await generate(cookie)).json();
    const other = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const workerStore = createPgJobStore(other);
      expect((await workerStore.claim('w-int'))?.id).toBe(jobId);
      const res = await getStream(new Request('http://t', { headers: { cookie } }),
        { params: Promise.resolve({ id: jobId }) });
      const events = readUntilClosed(res);
      await new Promise((r) => setTimeout(r, 300));
      await workerStore.appendEvent(jobId, { type: 'warning', message: 'из воркера' }, 'w-int');
      await workerStore.finish(jobId, 'w-int', { status: 'error', message: 'стоп' });
      expect(await events).toEqual([
        { type: 'warning', message: 'из воркера' },
        { type: 'error', message: 'стоп' },
      ]);
    } finally {
      await other.end();
    }
  });

  it('старая запись без терминального события: журнал из jobs.events и ошибка по статусу', async () => {
    const { id, cookie } = await signIn();
    const jobId = crypto.randomUUID();
    await pool!.query(
      `INSERT INTO jobs (id, owner_id, status, request, events, error)
       VALUES ($1, $2, 'error', '{}'::jsonb, $3::jsonb, 'Сервер был перезапущен')`,
      [jobId, id, JSON.stringify([{ type: 'stage', stage: 'planning', status: 'start', at: 1 }])]);
    const res = await getStream(new Request('http://t', { headers: { cookie } }),
      { params: Promise.resolve({ id: jobId }) });
    expect(await readUntilClosed(res)).toEqual([
      { type: 'stage', stage: 'planning', status: 'start', at: 1 },
      { type: 'error', message: 'Сервер был перезапущен' },
    ]);
  });
});
