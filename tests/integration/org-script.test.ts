import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { runOrgCommand } from '../../scripts/org';
import { closeDb } from '@/lib/db/client';
import { createUser, findUserByIdentifier } from '@/lib/auth/users';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/me/route';
import { POST as changePassword } from '@/app/api/me/password/route';
import { listMemberships } from '@/lib/org/access';
import { navSections } from '@/lib/org/policy';
import { findOrgBySlug } from '@/lib/org/orgs';
import { OrgError } from '@/lib/org/types';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'org_script_test';
const pool = testDb(SCHEMA);

async function run(...argv: string[]): Promise<string[]> {
  const out: string[] = [];
  await runOrgCommand(argv, (line) => out.push(line));
  return out;
}
function passwordFrom(out: string[]): string {
  const line = out.find((l) => l.startsWith('Временный пароль'));
  expect(line).toBeDefined();
  return line!.slice(line!.lastIndexOf(' ') + 1);
}
function post(body: unknown, cookie?: string): Request {
  return new Request('http://t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
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
  await __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('скрипт управления организациями', () => {
  it('сквозной сценарий: школа, учитель, ученик, группа, первый вход ученика', async () => {
    await createUser('teacher@example.com', 'пароль123');
    expect(await run('create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school'))
      .toEqual(['Организация sch12 создана.']);
    await run('add-member', '--org', 'sch12', '--user', 'teacher@example.com', '--role', 'teacher');
    const created = await run('create-user', '--org', 'sch12', '--login', 'ivanov.i.sch12',
      '--name', 'Иванов Иван', '--role', 'student');
    const tempPassword = passwordFrom(created);
    expect(tempPassword).toMatch(/^[а-я]+-[а-я]+-[а-я]+$/);
    await run('create-group', '--org', 'sch12', '--title', '7А');
    await run('add-to-group', '--org', 'sch12', '--group', '7А', '--user', 'ivanov.i.sch12');
    await run('assign-teacher', '--org', 'sch12', '--group', '7А', '--user', 'teacher@example.com');

    const list = await run('list');
    expect(list).toEqual(['sch12\tШкола №12\tschool\tучастников: 2']);

    // Ученик входит логином, видит флаг, меняет пароль и остаётся без «Создать».
    const res = await login(post({ identifier: 'ivanov.i.sch12', password: tempPassword }));
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect((await (await me(new Request('http://t', { headers: { cookie } }))).json()).user)
      .toMatchObject({ displayName: 'Иванов Иван', mustChangePassword: true });
    expect((await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookie))).status).toBe(200);
    const student = (await findUserByIdentifier('ivanov.i.sch12'))!;
    expect(student.mustChangePassword).toBe(false);
    expect(navSections(student, await listMemberships(student.id)).map((s) => s.key))
      .toEqual(['learn', 'library', 'labs']);

    const { rows } = await pool!.query<{ gm: number; gt: number }>(
      'SELECT (SELECT count(*)::int FROM group_members) AS gm, (SELECT count(*)::int FROM group_teachers) AS gt');
    expect(rows[0]).toEqual({ gm: 1, gt: 1 });
  });

  it('set меняет настройки, reset-password выдаёт новый временный пароль, disable блокирует', async () => {
    await run('create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school');
    const first = passwordFrom(await run('create-user', '--org', 'sch12', '--login', 'kim.a.sch12',
      '--name', 'Ким Алия', '--role', 'student'));

    await run('set', '--org', 'sch12', 'studentsCanGenerate=true', 'teacherGenerationLimit=40');
    expect((await findOrgBySlug('sch12'))!.settings)
      .toEqual({ studentsCanGenerate: true, studentLongSessions: false, teacherGenerationLimit: 40 });

    const second = passwordFrom(await run('reset-password', '--user', 'kim.a.sch12'));
    await __resetAttemptsForTests();
    expect((await login(post({ identifier: 'kim.a.sch12', password: first }))).status).toBe(401);
    expect((await login(post({ identifier: 'kim.a.sch12', password: second }))).status).toBe(200);

    expect(await run('disable', '--user', 'kim.a.sch12')).toEqual(['Пользователь kim.a.sch12 заблокирован.']);
    expect((await login(post({ identifier: 'kim.a.sch12', password: second }))).status).toBe(403);
  });

  it('отказы понятным текстом и без побочных эффектов', async () => {
    await run('create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school');
    await run('create', '--slug', 'col7', '--name', 'Колледж №7', '--kind', 'college');
    await run('create-user', '--org', 'col7', '--login', 'stranger.col7', '--name', 'Чужой', '--role', 'student');
    await run('create-group', '--org', 'sch12', '--title', '7А');

    await expect(run('create', '--slug', 'sch12', '--name', 'Дубль', '--kind', 'school'))
      .rejects.toThrow('Слаг «sch12» уже занят.');
    await expect(run('create-user', '--org', 'sch12', '--login', 'ivanov@sch12', '--name', 'X', '--role', 'student'))
      .rejects.toThrow(/только строчные латинские буквы/);
    await expect(run('create-user', '--org', 'sch12', '--login', 'stranger.col7', '--name', 'X', '--role', 'student'))
      .rejects.toThrow('Логин «stranger.col7» уже занят.');
    await expect(run('create-user', '--org', 'nope', '--login', 'new.user', '--name', 'X', '--role', 'student'))
      .rejects.toThrow('Организация «nope» не найдена.');
    await expect(run('add-to-group', '--org', 'sch12', '--group', '7А', '--user', 'stranger.col7'))
      .rejects.toBeInstanceOf(OrgError);
    await expect(run('add-to-group', '--org', 'sch12', '--group', '9В', '--user', 'stranger.col7'))
      .rejects.toThrow('Группа «9В» не найдена в организации sch12.');
    await expect(run('add-member', '--org', 'sch12', '--user', 'ghost@example.com', '--role', 'teacher'))
      .rejects.toThrow('Пользователь «ghost@example.com» не найден.');
    await expect(run('add-member', '--org', 'sch12', '--user', 'stranger.col7', '--role', 'director'))
      .rejects.toThrow('Роль — org_admin, teacher или student.');
    await expect(run('set', '--org', 'sch12', 'hack=1')).rejects.toBeInstanceOf(OrgError);
    await expect(run('fly')).rejects.toThrow('Неизвестная команда «fly».');

    // Ни один отказ ничего не создал.
    const { rows } = await pool!.query<{ users: number; gm: number; orgs: number }>(
      `SELECT (SELECT count(*)::int FROM users) AS users,
              (SELECT count(*)::int FROM group_members) AS gm,
              (SELECT count(*)::int FROM organizations) AS orgs`);
    expect(rows[0]).toEqual({ users: 1, gm: 0, orgs: 2 });
    expect((await findOrgBySlug('sch12'))!.settings.studentsCanGenerate).toBe(false);
  });

  it('без команды печатает справку', async () => {
    const out = await run();
    expect(out.join('\n')).toContain('npm run org -- create --slug');
  });
});
