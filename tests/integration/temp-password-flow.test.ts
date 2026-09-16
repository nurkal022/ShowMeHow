import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me, PATCH as patchMe } from '@/app/api/me/route';
import { POST as changePassword } from '@/app/api/me/password/route';
import { GET as listSims } from '@/app/api/simulations/route';
import { createLoginUser, createUser, setTemporaryPassword } from '@/lib/auth/users';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'temp_password_flow_test';
const pool = testDb(SCHEMA);

function post(body: unknown, cookie?: string, method = 'POST'): Request {
  return new Request('http://t', {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
function get(cookie: string): Request {
  return new Request('http://t', { headers: { cookie } });
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
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-temp-pw-'));
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('временный пароль', () => {
  async function flaggedStudent(): Promise<string> {
    await createLoginUser({
      login: 'petrov.p.sch12', displayName: 'Петров Пётр', password: 'лиса-дом-семь', mustChangePassword: true,
    });
    // Набор не про примеры: помечаем их разложенными, чтобы список не ставил демки.
    await pool!.query('UPDATE users SET demos_seeded_at = now()');
    const res = await login(post({ identifier: 'petrov.p.sch12', password: 'лиса-дом-семь' }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.mustChangePassword).toBe(true);
    return cookieOf(res);
  }

  it('закрывает приложение, но отдаёт /api/me с флагом', async () => {
    const cookie = await flaggedStudent();
    expect((await listSims(get(cookie))).status).toBe(401);
    expect((await patchMe(post({ displayName: 'X' }, cookie, 'PATCH'))).status).toBe(401);
    const whoami = await me(get(cookie));
    expect(whoami.status).toBe(200);
    expect((await whoami.json()).user).toMatchObject({ login: 'petrov.p.sch12', mustChangePassword: true });
  });

  it('смена без текущего пароля снимает флаг и открывает приложение', async () => {
    const cookie = await flaggedStudent();
    const short = await changePassword(post({ newPassword: 'корот' }, cookie));
    expect(short.status).toBe(400);
    const ok = await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookie));
    expect(ok.status).toBe(200);
    expect((await (await me(get(cookie))).json()).user.mustChangePassword).toBe(false);
    expect((await listSims(get(cookie))).status).toBe(200);

    __resetAttemptsForTests();
    expect((await login(post({ identifier: 'petrov.p.sch12', password: 'лиса-дом-семь' }))).status).toBe(401);
    expect((await login(post({ identifier: 'petrov.p.sch12', password: 'мой-новый-пароль' }))).status).toBe(200);
  });

  it('после снятия флага текущий пароль снова обязателен', async () => {
    const cookie = await flaggedStudent();
    await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookie));
    const again = await changePassword(post({ newPassword: 'ещё-один-пароль' }, cookie));
    expect(again.status).toBe(403);
  });

  it('смена рвёт прочие сессии и оставляет текущую', async () => {
    const cookieA = await flaggedStudent();
    const cookieB = cookieOf(await login(post({ identifier: 'petrov.p.sch12', password: 'лиса-дом-семь' })));
    await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookieA));
    expect((await me(get(cookieA))).status).toBe(200);
    expect((await me(get(cookieB))).status).toBe(401);
  });

  it('выход работает при поднятом флаге', async () => {
    const cookie = await flaggedStudent();
    expect((await logout(post({}, cookie))).status).toBe(200);
    expect((await me(get(cookie))).status).toBe(401);
  });

  it('setTemporaryPassword ставит флаг, меняет пароль и выбрасывает из сессий', async () => {
    const u = await createUser('forgot@example.com', 'старый-пароль1');
    const cookie = cookieOf(await login(post({ identifier: 'forgot@example.com', password: 'старый-пароль1' })));
    await setTemporaryPassword(u.id, 'сова-мост-три');
    expect((await me(get(cookie))).status).toBe(401);
    const res = await login(post({ identifier: 'forgot@example.com', password: 'сова-мост-три' }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.mustChangePassword).toBe(true);
  });

  it('без сессии разрешающие роуты по-прежнему отвечают 401', async () => {
    expect((await me(new Request('http://t'))).status).toBe(401);
    expect((await changePassword(post({ newPassword: 'мой-новый-пароль' }))).status).toBe(401);
  });
});
