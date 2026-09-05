import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, findUserByEmail, normalizeEmail, roleForEmail, EmailTakenError } from '@/lib/auth/users';
import { createSession, resolveSession, destroySession, readCookie, SESSION_COOKIE } from '@/lib/auth/session';

const SCHEMA = 'auth_session_test';
const pool: Pool | null = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM sessions; DELETE FROM users;');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe('нормализация и роли', () => {
  it('почта приводится к нижнему регистру без пробелов', () => {
    expect(normalizeEmail('  Ivan@Example.COM ')).toBe('ivan@example.com');
  });
  it('роль админа определяется переменной окружения', () => {
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'Boss@example.com';
    expect(roleForEmail('boss@example.com')).toBe('admin');
    expect(roleForEmail('other@example.com')).toBe('user');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
  });
});

describe.skipIf(!pool)('пользователи и сессии', () => {
  it('создаёт пользователя и не даёт завести второго с той же почтой', async () => {
    const u = await createUser('Ivan@Example.com', 'пароль123');
    expect(u.email).toBe('ivan@example.com');
    expect(u.role).toBe('user');
    await expect(createUser('ivan@example.com', 'другой123')).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('сессия резолвится по токену и гаснет после выхода', async () => {
    const u = await createUser('a@example.com', 'пароль123');
    const token = await createSession(u.id);
    expect((await resolveSession(token))?.id).toBe(u.id);
    await destroySession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it('в базе лежит не сам токен, а его хеш', async () => {
    const u = await createUser('b@example.com', 'пароль123');
    const token = await createSession(u.id);
    const { rows } = await pool!.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
  });

  it('просроченная сессия не резолвится', async () => {
    const u = await createUser('c@example.com', 'пароль123');
    const token = await createSession(u.id);
    await pool!.query("UPDATE sessions SET expires_at = now() - interval '1 day'");
    expect(await resolveSession(token)).toBeNull();
  });

  it('неизвестный токен и отсутствие токена дают null', async () => {
    expect(await resolveSession(undefined)).toBeNull();
    expect(await resolveSession('такого-нет')).toBeNull();
  });

  it('пароль проверяется через findUserByEmail', async () => {
    await createUser('d@example.com', 'пароль123');
    const found = await findUserByEmail('D@Example.com');
    expect(found?.passwordHash.startsWith('scrypt$')).toBe(true);
  });
});

describe('чтение cookie', () => {
  it('достаёт нужное значение из заголовка', () => {
    // Значение — ASCII: заголовок Cookie в спеке fetch ограничен ByteString,
    // кириллица в значении заголовка вызывает TypeError ещё до вызова readCookie
    // (реальные токены сессии — тоже ASCII, см. base64url в createSession).
    const req = new Request('http://t', { headers: { cookie: `a=1; ${SESSION_COOKIE}=tok123; b=2` } });
    expect(readCookie(req, SESSION_COOKIE)).toBe('tok123');
    expect(readCookie(new Request('http://t'), SESSION_COOKIE)).toBeUndefined();
  });
});
