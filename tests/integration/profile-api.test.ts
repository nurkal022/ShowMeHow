import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as register } from '@/app/api/auth/register/route';
import { GET as me, PATCH as patchMe } from '@/app/api/me/route';
import { POST as changePassword } from '@/app/api/me/password/route';
import { POST as login } from '@/app/api/auth/login/route';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'profile_api_test';
const pool = testDb(SCHEMA);

function post(body: unknown, cookie?: string, method = 'POST'): Request {
  return new Request('http://t', {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
function get(cookie?: string): Request {
  return new Request('http://t', { headers: cookie ? { cookie } : {} });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}
async function signUp(email = 'p@example.com', password = 'пароль123'): Promise<string> {
  return cookieOf(await register(post({ email, password })));
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

describe.skipIf(!pool)('профиль и настройки', () => {
  it('без входа не отдаёт и не меняет профиль', async () => {
    expect((await me(get())).status).toBe(401);
    expect((await patchMe(post({ displayName: 'X' }, undefined, 'PATCH'))).status).toBe(401);
    expect((await changePassword(post({ currentPassword: 'a', newPassword: 'b'.repeat(9) }))).status).toBe(401);
  });

  it('у нового пользователя профиль пустой, а настройки — {}', async () => {
    const cookie = await signUp();
    const body = await (await me(get(cookie))).json();
    expect(body.profile.displayName).toBeNull();
    expect(body.prefs).toEqual({});
  });

  it('сохраняет имя и настройки, обновляя частично', async () => {
    const cookie = await signUp();
    await patchMe(post({ displayName: '  Нурлыхан  ', prefs: { theme: 'dark' } }, cookie, 'PATCH'));
    await patchMe(post({ prefs: { quality: 'fast' } }, cookie, 'PATCH'));
    const body = await (await me(get(cookie))).json();
    expect(body.profile.displayName).toBe('Нурлыхан');
    // Второй патч не должен был стереть тему, поставленную первым.
    expect(body.prefs).toEqual({ theme: 'dark', quality: 'fast' });
  });

  it('не пишет в базу неизвестные ключи и недопустимые значения', async () => {
    const cookie = await signUp();
    await patchMe(post({ prefs: { theme: 'neon', hack: 'да', voiceInput: false } }, cookie, 'PATCH'));
    const body = await (await me(get(cookie))).json();
    expect(body.prefs).toEqual({ voiceInput: false });
  });

  it('меняет пароль только при верном текущем и рвёт остальные сессии', async () => {
    const cookieA = await signUp('u@example.com', 'пароль123');
    // Второй вход — «другое устройство» с собственной сессией.
    const cookieB = cookieOf(await login(post({ email: 'u@example.com', password: 'пароль123' })));

    const wrong = await changePassword(post({ currentPassword: 'нетакой', newPassword: 'новыйпароль1' }, cookieA));
    expect(wrong.status).toBe(403);

    const short = await changePassword(post({ currentPassword: 'пароль123', newPassword: 'корот' }, cookieA));
    expect(short.status).toBe(400);

    const ok = await changePassword(post({ currentPassword: 'пароль123', newPassword: 'новыйпароль1' }, cookieA));
    expect(ok.status).toBe(200);

    // Сессия, из которой меняли, продолжает работать; чужая — нет.
    expect((await me(get(cookieA))).status).toBe(200);
    expect((await me(get(cookieB))).status).toBe(401);

    __resetAttemptsForTests();
    const relogin = await login(post({ email: 'u@example.com', password: 'новыйпароль1' }));
    expect(relogin.status).toBe(200);
  });
});
