import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createOrganization, addMember, updateOrgSettings, type Organization } from '@/lib/org/orgs';
import { listMemberships } from '@/lib/org/access';
import { GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';
import { quotaStatus, quotaExhaustedMessage, QUOTA_EXHAUSTED_MESSAGE, TRIAL_LIMIT } from '@/lib/quota';
import { __resetLimitsForTests } from '@/lib/limits';
import { __clearForTests } from '@/lib/jobs';
import { POST as postGenerate } from '@/app/api/generate/route';
import { POST as postRefine } from '@/app/api/simulations/[id]/refine/route';
import { GET as me } from '@/app/api/me/route';

// Пайплайн поднимает Chromium и зовёт модель — здесь он повисает и ничего не делает.
vi.mock('@/lib/pipeline/run', async (orig) => ({
  ...(await orig<typeof import('@/lib/pipeline/run')>()),
  makeCtx: () => ({}),
  runPipeline: () => new Promise<void>(() => {}),
}));

const SCHEMA = 'org_generation_test';
const pool = testDb(SCHEMA);

async function cookieFor(u: AuthUser): Promise<string> {
  return `${SESSION_COOKIE}=${await createSession(u.id)}`;
}
function generate(cookie: string): Promise<Response> {
  return postGenerate(new Request('http://t/api/generate', {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ prompt: 'маятник' }),
  }));
}
function refine(cookie: string, id: string): Promise<Response> {
  return postRefine(new Request('http://t', {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ instruction: 'крупнее' }),
  }), { params: Promise.resolve({ id }) });
}
async function addDoneJobs(ownerId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await pool!.query("INSERT INTO jobs (id, owner_id, status, request) VALUES ($1,$2,'done','{}'::jsonb)",
      [crypto.randomUUID(), ownerId]);
  }
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __clearForTests();
  __resetLimitsForTests();
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => {
  delete process.env.SHOWMEHOW_API_KEY;
  delete process.env.SHOWMEHOW_MODEL;
  await pool?.end();
  await closeDb();
});

describe.skipIf(!pool)('генерация и квота в организации', () => {
  let org: Organization;
  let student: AuthUser;
  let teacher: AuthUser;

  beforeEach(async () => {
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    student = await createLoginUser({
      login: 'ivanov.i.sch12', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    teacher = await createUser('teacher@example.com', 'пароль123');
    await addMember(org.id, student.id, 'student');
    await addMember(org.id, teacher.id, 'teacher');
  });

  it('ученик без разрешения получает 403 и не создаёт задания', async () => {
    const cookie = await cookieFor(student);
    const res = await generate(cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: GENERATION_FORBIDDEN_MESSAGE });
    const { rows } = await pool!.query('SELECT 1 FROM jobs');
    expect(rows).toHaveLength(0);

    // Доработка тоже закрыта; проверка права идёт раньше поиска симуляции.
    const r = await refine(cookie, crypto.randomUUID());
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: GENERATION_FORBIDDEN_MESSAGE });
  });

  it('/api/me сообщает право на генерацию: библиотека прячет по нему кнопку «Создать»', async () => {
    const canGen = async (u: AuthUser) =>
      (await (await me(new Request('http://t', { headers: { cookie: await cookieFor(u) } }))).json()).canGenerate;
    expect(await canGen(student)).toBe(false);
    expect(await canGen(teacher)).toBe(true);
    expect(await canGen(await createUser('solo@example.com', 'пароль123'))).toBe(true);
    await updateOrgSettings(org.id, { studentsCanGenerate: true });
    expect(await canGen(student)).toBe(true);
  });

  it('ученик проходит, когда организация разрешила генерацию', async () => {
    await updateOrgSettings(org.id, { studentsCanGenerate: true });
    const res = await generate(await cookieFor(student));
    expect(res.status).toBe(200);
    expect((await res.json()).jobId).toEqual(expect.any(String));
    // Разрешённый ученик тратит обычную пробную квоту.
    expect((await quotaStatus(student, await listMemberships(student.id))).limit).toBe(TRIAL_LIMIT);
  });

  it('ученик архивной организации считается пользователем без членств', async () => {
    await pool!.query('UPDATE organizations SET archived_at = now() WHERE id = $1', [org.id]);
    expect((await generate(await cookieFor(student))).status).toBe(200);
  });

  it('учитель получает лимит организации и текст с этим числом', async () => {
    expect(await quotaStatus(teacher, await listMemberships(teacher.id)))
      .toEqual({ limit: 100, used: 0, remaining: 100 });

    await updateOrgSettings(org.id, { teacherGenerationLimit: 3 });
    await addDoneJobs(teacher.id, 3);
    const cookie = await cookieFor(teacher);
    const res = await generate(cookie);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(quotaExhaustedMessage(3, true));
    expect(quotaExhaustedMessage(3, true)).toContain('3 из 3');

    const body = await (await me(new Request('http://t', { headers: { cookie } }))).json();
    expect(body.quota).toEqual({ limit: 3, used: 3, remaining: 0 });
    expect(body.quotaMessage).toBe(quotaExhaustedMessage(3, true));
  });

  it('пользователь без членств — прежние 10 и прежний текст', async () => {
    const b2c = await createUser('b2c@example.com', 'пароль123');
    await addDoneJobs(b2c.id, TRIAL_LIMIT);
    const res = await generate(await cookieFor(b2c));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(QUOTA_EXHAUSTED_MESSAGE);
    expect(QUOTA_EXHAUSTED_MESSAGE).toBe(
      'Лимит пробной версии исчерпан: использовано 10 из 10 генераций. '
      + 'Доработка уже созданных симуляций по-прежнему доступна.');
  });
});
