import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { quotaStatus, TRIAL_LIMIT, QUOTA_EXHAUSTED_MESSAGE } from '@/lib/quota';
import { __resetLimitsForTests } from '@/lib/limits';
import { __clearForTests } from '@/lib/jobs';
import { POST as postGenerate } from '@/app/api/generate/route';

const pool = testDb('quota_test');

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, 'quota_test');
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM jobs; DELETE FROM sessions; DELETE FROM users;');
  __clearForTests();
  __resetLimitsForTests();
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('квота', () => {
  async function addJob(ownerId: string, status: string) {
    await pool!.query(
      "INSERT INTO jobs (id, owner_id, status, request) VALUES ($1,$2,$3,'{}'::jsonb)",
      [crypto.randomUUID(), ownerId, status]);
  }

  it('считает только успешные генерации', async () => {
    const u = await createUser('a@example.com', 'пароль123');
    for (let i = 0; i < TRIAL_LIMIT; i++) await addJob(u.id, 'done');
    await addJob(u.id, 'cancelled');
    await addJob(u.id, 'error');
    expect(await quotaStatus(u)).toEqual({ limit: TRIAL_LIMIT, used: TRIAL_LIMIT, remaining: 0 });
  });

  it('у админа лимита нет', async () => {
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'boss@example.com';
    const admin = await createUser('boss@example.com', 'пароль123');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
    await addJob(admin.id, 'done');
    expect(await quotaStatus(admin)).toEqual({ limit: null, used: 0, remaining: null });
  });

  it('исчерпанная квота даёт 403 из /api/generate и не создаёт задания', async () => {
    // Провайдер берётся из окружения — иначе роут ответил бы 400 раньше проверки квоты.
    process.env.SHOWMEHOW_API_KEY = 'test-key';
    process.env.SHOWMEHOW_MODEL = 'test-model';
    try {
      const u = await createUser('c@example.com', 'пароль123');
      for (let i = 0; i < TRIAL_LIMIT; i++) await addJob(u.id, 'done');
      const cookie = `${SESSION_COOKIE}=${await createSession(u.id)}`;
      const res = await postGenerate(new Request('http://t/api/generate', {
        method: 'POST', headers: { cookie }, body: JSON.stringify({ prompt: 'маятник' }),
      }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe(QUOTA_EXHAUSTED_MESSAGE);
      const { rows } = await pool!.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM jobs WHERE owner_id = $1', [u.id]);
      expect(Number(rows[0].count)).toBe(TRIAL_LIMIT);
    } finally {
      delete process.env.SHOWMEHOW_API_KEY;
      delete process.env.SHOWMEHOW_MODEL;
    }
  });
});
