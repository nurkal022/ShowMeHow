import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/me/route';
import {
  createUser, createLoginUser, findUserByIdentifier, InvalidLoginError, LoginTakenError,
} from '@/lib/auth/users';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'login_identifier_test';
const pool = testDb(SCHEMA);

function post(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
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

describe.skipIf(!pool)('вход по логину и по почте', () => {
  it('ученик входит логином в любом регистре, а /api/me отдаёт новые поля', async () => {
    await createLoginUser({
      login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false,
    });
    const res = await login(post({ identifier: ' Ivanov.I.Sch12 ', password: 'пароль123' }));
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    const loginBody = await res.json();
    expect(Object.keys(loginBody.user).sort()).toEqual(
      ['displayName', 'email', 'id', 'login', 'mustChangePassword', 'role'].sort(),
    );
    const body = await (await me(new Request('http://t', { headers: { cookie } }))).json();
    expect(body.user).toMatchObject({
      email: null, login: 'ivanov.i.sch12', displayName: 'Иванов Иван', role: 'user', mustChangePassword: false,
    });
  });

  it('почта входит и через identifier, и через старое поле email', async () => {
    await createUser('a@example.com', 'пароль123');
    expect((await login(post({ identifier: 'A@example.com', password: 'пароль123' }))).status).toBe(200);
    expect((await login(post({ email: 'a@example.com', password: 'пароль123' }))).status).toBe(200);
  });

  it('неверный логин, неверная почта и неверный пароль дают один и тот же 401', async () => {
    await createLoginUser({ login: 'petrov', displayName: null, password: 'пароль123', mustChangePassword: false });
    const wrongPass = await login(post({ identifier: 'petrov', password: 'неверный1' }));
    const noLogin = await login(post({ identifier: 'sidorov', password: 'неверный1' }));
    const badLogin = await login(post({ identifier: 'ив', password: 'неверный1' }));
    const noEmail = await login(post({ identifier: 'нет@example.com', password: 'неверный1' }));
    for (const r of [wrongPass, noLogin, badLogin, noEmail]) expect(r.status).toBe(401);
    const bodies = await Promise.all([wrongPass, noLogin, badLogin, noEmail].map((r) => r.json()));
    for (const b of bodies) expect(b).toEqual({ error: 'Неверный логин, почта или пароль.' });
  });

  it('findUserByIdentifier ищет по почте или логину и отдаёт хеш', async () => {
    await createUser('b@example.com', 'пароль123');
    await createLoginUser({ login: 'kim.a', displayName: null, password: 'пароль123', mustChangePassword: true });
    expect((await findUserByIdentifier('B@Example.com'))?.passwordHash.startsWith('scrypt$')).toBe(true);
    const byLogin = await findUserByIdentifier('KIM.A');
    expect(byLogin).toMatchObject({ login: 'kim.a', email: null, mustChangePassword: true, disabledAt: null });
    expect(await findUserByIdentifier('нет-такого')).toBeNull();
  });

  it('createLoginUser отклоняет недопустимый и занятый логин', async () => {
    await expect(createLoginUser({
      login: 'ivanov@sch12', displayName: null, password: 'пароль123', mustChangePassword: true,
    })).rejects.toBeInstanceOf(InvalidLoginError);
    await createLoginUser({ login: 'lee', displayName: null, password: 'пароль123', mustChangePassword: true });
    await expect(createLoginUser({
      login: 'LEE', displayName: null, password: 'пароль123', mustChangePassword: true,
    })).rejects.toBeInstanceOf(LoginTakenError);
  });
});
