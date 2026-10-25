import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { aiAllowance, chargeAi, quotaStatus, TRIAL_LIMIT, QUOTA_EXHAUSTED_MESSAGE } from '@/lib/quota';
import { setPlatformLimit } from '@/lib/platform-settings';
import { setUserLimits } from '@/lib/admin/users';
import { createOrganization, addMember } from '@/lib/org/orgs';
import { listMemberships } from '@/lib/org/access';
import { POST as postGenerate } from '@/app/api/generate/route';

const pool = testDb('quota_test');

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, 'quota_test');
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM job_events; DELETE FROM jobs; DELETE FROM sessions; DELETE FROM ai_usage; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM platform_settings; DELETE FROM users;');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('квота', () => {
  async function addJob(ownerId: string, status: string, kind = 'generate') {
    await pool!.query(
      "INSERT INTO jobs (id, owner_id, status, request, kind) VALUES ($1,$2,$3,'{}'::jsonb,$4)",
      [crypto.randomUUID(), ownerId, status, kind]);
  }

  it('считает только успешные генерации', async () => {
    const u = await createUser('a@example.com', 'пароль123');
    for (let i = 0; i < TRIAL_LIMIT; i++) await addJob(u.id, 'done');
    await addJob(u.id, 'cancelled');
    await addJob(u.id, 'error');
    expect(await quotaStatus(u, [])).toEqual({ limit: TRIAL_LIMIT, used: TRIAL_LIMIT, remaining: 0, source: 'trial' });
  });

  it('доработки квоту не тратят', async () => {
    const u = await createUser('r@example.com', 'пароль123');
    await addJob(u.id, 'done');
    for (let i = 0; i < 5; i++) await addJob(u.id, 'done', 'refine');
    expect(await quotaStatus(u, [])).toEqual({ limit: TRIAL_LIMIT, used: 1, remaining: TRIAL_LIMIT - 1, source: 'trial' });
  });

  it('у админа лимита нет', async () => {
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'boss@example.com';
    const admin = await createUser('boss@example.com', 'пароль123');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
    await addJob(admin.id, 'done');
    expect(await quotaStatus(admin, [])).toEqual({ limit: null, used: 0, remaining: null, source: 'admin' });
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

  it('песочница не даёт лимита организации', async () => {
    const u = await createUser('s@example.com', 'пароль123');
    const org = await createOrganization({ slug: 'demo-x', name: 'Демо-университет', kind: 'university' });
    await pool!.query('UPDATE organizations SET sandbox_owner = $2 WHERE id = $1', [org.id, u.id]);
    await addMember(org.id, u.id, 'org_admin');
    const q = await quotaStatus(u, await listMemberships(u.id));
    expect(q).toMatchObject({ limit: 1, source: 'trial' });
  });

  it('общий пробный лимит и персональный из админки', async () => {
    const u = await createUser('p@example.com', 'пароль123');
    await setPlatformLimit('trialGenerations', 3);
    expect((await quotaStatus(u, [])).limit).toBe(3);
    await setUserLimits(u.id, { generationLimit: 7 });
    expect(await quotaStatus(u, [])).toMatchObject({ limit: 7, source: 'personal' });
  });

  it('суточный лимит ИИ отвечает 429 после исчерпания', async () => {
    const u = await createUser('ai@example.com', 'пароль123');
    await setUserLimits(u.id, { aiDailyLimit: 2 });
    expect(await chargeAi(u, 'plan')).toBeNull();
    expect(await chargeAi(u, 'plan')).toBeNull();
    const over = await chargeAi(u, 'plan');
    expect(over?.status).toBe(429);
    expect(await aiAllowance(u)).toEqual({ limit: 2, used: 2 });
  });
});
