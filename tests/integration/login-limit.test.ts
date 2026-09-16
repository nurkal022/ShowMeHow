import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { createLoginUser } from '@/lib/auth/users';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'login_limit_test';
const pool = testDb(SCHEMA);
const SCHOOL_IP = { 'x-forwarded-for': '203.0.113.20' };

function post(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...SCHOOL_IP }, body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('класс за одним IP', () => {
  it('тридцать неудач по разным аккаунтам не мешают тридцать первому верному входу', async () => {
    for (let i = 0; i < 31; i++) {
      await createLoginUser({ login: `s${i}.sch12`, displayName: null, password: 'пароль123', mustChangePassword: false });
    }
    for (let i = 0; i < 30; i++) {
      expect((await login(post({ identifier: `s${i}.sch12`, password: 'опечатка1' }))).status).toBe(401);
    }
    expect((await login(post({ identifier: 's30.sch12', password: 'пароль123' }))).status).toBe(200);
  });

  it('пятьдесят входов в несуществующие аккаунты закрывают вход и верному паролю', async () => {
    await createLoginUser({ login: 'real.sch12', displayName: null, password: 'пароль123', mustChangePassword: false });
    for (let i = 0; i < 50; i++) {
      expect((await login(post({ identifier: `ghost${i}`, password: 'пароль123' }))).status).toBe(401);
    }
    expect((await login(post({ identifier: 'real.sch12', password: 'пароль123' }))).status).toBe(429);
  });
});
