import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import {
  createJob, getJob, setStatus, appendEvent, flushJobWrites, __clearForTests,
} from '@/lib/jobs';
import { __resetLimitsForTests } from '@/lib/limits';
import type { JobRequest } from '@/lib/jobs';

const pool = testDb('jobs_test');
const REQUEST: JobRequest = { prompt: 'маятник', mode: 'standard', hasImage: false };

let owner = '';
let stranger = '';

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, 'jobs_test');
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM jobs; DELETE FROM users;');
  owner = (await createUser('owner@example.com', 'пароль123')).id;
  stranger = (await createUser('stranger@example.com', 'пароль123')).id;
  __clearForTests();
  __resetLimitsForTests();
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('задания в базе', () => {
  it('createJob пишет строку владельцу, терминальное событие — статус и журнал', async () => {
    const job = await createJob(owner, REQUEST);
    setStatus(job.id, 'running');
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });
    await flushJobWrites();

    // Промежуточные события в базу не пишутся: журнал уходит один раз, с финальным статусом.
    let row = (await pool!.query('SELECT status, events FROM jobs WHERE id = $1', [job.id])).rows[0];
    expect(row.status).toBe('running');
    expect(row.events).toEqual([]);

    appendEvent(job.id, { type: 'done', simulationId: '33333333-3333-3333-3333-333333333333' });
    await flushJobWrites();
    row = (await pool!.query('SELECT status, events, simulation_id FROM jobs WHERE id = $1',
      [job.id])).rows[0];
    expect(row.status).toBe('done');
    expect(row.simulation_id).toBe('33333333-3333-3333-3333-333333333333');
    expect(row.events).toHaveLength(2);
  });

  it('чужое задание из базы неотличимо от несуществующего', async () => {
    const job = await createJob(owner, REQUEST);
    __clearForTests();   // память пуста — читаем из базы
    expect(await getJob(stranger, job.id)).toBeNull();
    expect(await getJob(owner, crypto.randomUUID())).toBeNull();
    expect(await getJob(owner, job.id)).not.toBeNull();
  });

  it('задание, пережившее перезапуск процесса, помечается ошибкой', async () => {
    const job = await createJob(owner, REQUEST);
    setStatus(job.id, 'running');
    await flushJobWrites();
    __clearForTests();   // имитация перезапуска: пайплайна, который вёл задание, больше нет

    const recovered = (await getJob(owner, job.id))!;
    expect(recovered.status).toBe('error');
    expect(recovered.error).toBe('Сервер был перезапущен');
    await flushJobWrites();
    const row = (await pool!.query('SELECT status, error FROM jobs WHERE id = $1', [job.id])).rows[0];
    expect(row.status).toBe('error');
    expect(row.error).toBe('Сервер был перезапущен');
  });
});
