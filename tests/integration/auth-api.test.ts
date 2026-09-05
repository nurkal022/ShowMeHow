import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/me/route';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'auth_api_test';
const pool = testDb(SCHEMA);

function post(body: unknown, cookie?: string): Request {
  return new Request('http://t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function cookieOf(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0];
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('DELETE FROM sessions; DELETE FROM users;');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('api аутентификации', () => {
  it('регистрирует, ставит cookie и узнаёт пользователя', async () => {
    const res = await register(post({ email: 'a@example.com', password: 'пароль123' }));
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    const whoami = await me(new Request('http://t', { headers: { cookie } }));
    expect((await whoami.json()).user.email).toBe('a@example.com');
  });

  it('короткий пароль и кривая почта отклоняются', async () => {
    expect((await register(post({ email: 'a@example.com', password: 'коротк' }))).status).toBe(400);
    expect((await register(post({ email: 'не-почта', password: 'пароль123' }))).status).toBe(400);
  });

  it('занятая почта даёт 409', async () => {
    await register(post({ email: 'b@example.com', password: 'пароль123' }));
    expect((await register(post({ email: 'B@example.com', password: 'пароль123' }))).status).toBe(409);
  });

  it('неверная почта и неверный пароль дают один и тот же ответ', async () => {
    await register(post({ email: 'c@example.com', password: 'пароль123' }));
    const wrongPass = await login(post({ email: 'c@example.com', password: 'неверный1' }));
    const noUser = await login(post({ email: 'нет@example.com', password: 'неверный1' }));
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPass.json()).toEqual(await noUser.json());
  });

  it('выход гасит сессию', async () => {
    const reg = await register(post({ email: 'd@example.com', password: 'пароль123' }));
    const cookie = cookieOf(reg);
    await logout(post({}, cookie));
    expect((await me(new Request('http://t', { headers: { cookie } }))).status).toBe(401);
  });

  it('одиннадцатая попытка входа отклоняется с 429', async () => {
    await register(post({ email: 'e@example.com', password: 'пароль123' }));
    for (let i = 0; i < 10; i++) {
      await login(post({ email: 'e@example.com', password: 'неверный1' }));
    }
    expect((await login(post({ email: 'e@example.com', password: 'пароль123' }))).status).toBe(429);
  });
});

describe('me без сессии', () => {
  it('отдаёт 401', async () => {
    expect((await me(new Request('http://t'))).status).toBe(401);
  });
});
