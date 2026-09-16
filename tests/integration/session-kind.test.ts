import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as register } from '@/app/api/auth/register/route';
import { GET as me } from '@/app/api/me/route';
import { createUser, createLoginUser, disableUser } from '@/lib/auth/users';
import { resolveSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createOrganization, addMember, updateOrgSettings } from '@/lib/org/orgs';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'session_kind_test';
const pool = testDb(SCHEMA);
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function post(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}
function tokenOf(res: Response): string {
  return cookieOf(res).slice(SESSION_COOKIE.length + 1);
}
async function sessionRow(): Promise<{ expires_at: Date; sliding: boolean }> {
  const { rows } = await pool!.query<{ expires_at: Date; sliding: boolean }>(
    'SELECT expires_at, sliding FROM sessions');
  expect(rows).toHaveLength(1);
  return rows[0];
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

describe.skipIf(!pool)('тип сессии', () => {
  async function student(orgSettings: unknown = {}) {
    const org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    await updateOrgSettings(org.id, orgSettings);
    const u = await createLoginUser({
      login: 'ivanov.i.sch12', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    await addMember(org.id, u.id, 'student');
    return u;
  }

  it('ученик получает 12-часовую непродлеваемую сессию', async () => {
    await student();
    const res = await login(post({ identifier: 'ivanov.i.sch12', password: 'пароль123' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=43200');
    const row = await sessionRow();
    expect(row.sliding).toBe(false);
    expect(Math.abs(row.expires_at.getTime() - (Date.now() + 12 * HOUR))).toBeLessThan(60_000);

    // Осталось меньше часа — скользящая сессия продлилась бы, короткая нет.
    await pool!.query("UPDATE sessions SET expires_at = now() + interval '1 hour'");
    expect(await resolveSession(tokenOf(res))).not.toBeNull();
    expect((await sessionRow()).expires_at.getTime()).toBeLessThan(Date.now() + 2 * HOUR);

    await pool!.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect(await resolveSession(tokenOf(res))).toBeNull();
  });

  it('организация с studentLongSessions даёт ученику обычную сессию', async () => {
    await student({ studentLongSessions: true });
    const res = await login(post({ identifier: 'ivanov.i.sch12', password: 'пароль123' }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000');
    expect((await sessionRow()).sliding).toBe(true);
  });

  it('учитель получает 30-дневную скользящую сессию', async () => {
    const org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    const t = await createUser('teacher@example.com', 'пароль123');
    await addMember(org.id, t.id, 'teacher');
    const res = await login(post({ identifier: 'teacher@example.com', password: 'пароль123' }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000');
    const row = await sessionRow();
    expect(row.sliding).toBe(true);
    expect(Math.abs(row.expires_at.getTime() - (Date.now() + 30 * DAY))).toBeLessThan(60_000);

    // Старая скользящая логика жива: через два дня срок продлевается.
    await pool!.query("UPDATE sessions SET expires_at = now() + interval '28 days'");
    await resolveSession(tokenOf(res));
    expect((await sessionRow()).expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it('регистрация без членств — обычная сессия, как раньше', async () => {
    const res = await register(post({ email: 'b2c@example.com', password: 'пароль123' }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000');
    expect((await sessionRow()).sliding).toBe(true);
  });
});

describe.skipIf(!pool)('блокировка', () => {
  it('выбрасывает из всех сессий и не пускает обратно', async () => {
    const u = await createLoginUser({
      login: 'blocked.sch12', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    const first = await login(post({ identifier: 'blocked.sch12', password: 'пароль123' }));
    const second = await login(post({ identifier: 'blocked.sch12', password: 'пароль123' }));
    await disableUser(u.id);

    const { rows } = await pool!.query('SELECT 1 FROM sessions WHERE user_id = $1', [u.id]);
    expect(rows).toHaveLength(0);
    for (const r of [first, second]) {
      expect((await me(new Request('http://t', { headers: { cookie: cookieOf(r) } }))).status).toBe(401);
    }

    const right = await login(post({ identifier: 'blocked.sch12', password: 'пароль123' }));
    expect(right.status).toBe(403);
    expect(await right.json()).toEqual({ error: 'Аккаунт заблокирован. Обратитесь к администратору организации.' });
    expect(right.headers.get('set-cookie')).toBeNull();

    const wrong = await login(post({ identifier: 'blocked.sch12', password: 'неверный1' }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'Неверный логин, почта или пароль.' });

    // Данные не трогаются: строка пользователя на месте.
    const user = await pool!.query('SELECT 1 FROM users WHERE id = $1', [u.id]);
    expect(user.rows).toHaveLength(1);
  });

  it('сессия, созданная до блокировки в обход disableUser, тоже не резолвится', async () => {
    const u = await createUser('x@example.com', 'пароль123');
    const res = await login(post({ identifier: 'x@example.com', password: 'пароль123' }));
    await pool!.query('UPDATE users SET disabled_at = now() WHERE id = $1', [u.id]);
    expect(await resolveSession(tokenOf(res))).toBeNull();
  });
});
