import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { addMember, createOrganization, type Organization } from '@/lib/org/orgs';
import {
  addToGroup, archiveGroup, assignTeacher, createGroup, getGroup, isStudentInGroup, listGroups,
  listGroupStudents, listGroupTeachers, moveStudent, renameGroup, teacherGroupIds, unassignTeacher,
} from '@/lib/org/groups';
import { createStudents, previewStudents } from '@/lib/org/bulk';
import { listGroupCredentials } from '@/lib/org/credentials';
import { POST as changePassword } from '@/app/api/me/password/route';

const SCHEMA = 'org_groups_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

let org: Organization;
let teacher: AuthUser;

async function student(login: string, name: string): Promise<AuthUser> {
  const u = await createLoginUser({ login, displayName: name, password: 'пароль123', mustChangePassword: true });
  await addMember(org.id, u.id, 'student');
  return u;
}

describe.skipIf(!pool)('группы', () => {
  beforeEach(async () => {
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    teacher = await createUser('teacher@example.com', 'пароль123');
    await addMember(org.id, teacher.id, 'teacher');
  });

  it('список со счётчиками, переименование, архив, снятие учителя', async () => {
    const a = await createGroup(org.id, '7А');
    const b = await createGroup(org.id, '7Б');
    await assignTeacher(a.id, teacher.id);
    const s = await student('ivanov.i.sch12', 'Иванов Иван');
    await addToGroup(a.id, s.id);
    expect(await listGroups(org.id)).toEqual([
      { id: a.id, orgId: org.id, title: '7А', teacherNames: ['teacher@example.com'], studentCount: 1 },
      { id: b.id, orgId: org.id, title: '7Б', teacherNames: [], studentCount: 0 },
    ]);
    expect(await teacherGroupIds(teacher.id, org.id)).toEqual([a.id]);
    expect(await listGroupTeachers(a.id)).toEqual([{ userId: teacher.id, label: 'teacher@example.com' }]);
    await expect(renameGroup(b.id, ' 7А ')).rejects.toThrow('Группа «7А» уже есть в этой организации.');
    expect((await renameGroup(b.id, '8Б')).title).toBe('8Б');
    expect((await renameGroup(b.id, '8Б')).title).toBe('8Б');
    await archiveGroup(b.id);
    expect(await getGroup(b.id)).toBeNull();
    expect((await listGroups(org.id)).map((g) => g.title)).toEqual(['7А']);
    await unassignTeacher(a.id, teacher.id);
    expect(await listGroupTeachers(a.id)).toEqual([]);
    expect(await getGroup('не-uuid')).toBeNull();
  });

  it('ученики группы и перевод только внутри организации', async () => {
    const a = await createGroup(org.id, '7А');
    const b = await createGroup(org.id, '7Б');
    const s = await student('ivanov.i.sch12', 'Иванов Иван');
    await addToGroup(a.id, s.id);
    expect(await listGroupStudents(a.id)).toEqual([{
      userId: s.id, displayName: 'Иванов Иван', login: 'ivanov.i.sch12', disabled: false, mustChangePassword: true,
    }]);
    expect(await isStudentInGroup(a.id, s.id)).toBe(true);
    await moveStudent(s.id, a.id, b.id);
    expect(await isStudentInGroup(a.id, s.id)).toBe(false);
    expect(await isStudentInGroup(b.id, s.id)).toBe(true);
    const foreign = await createOrganization({ slug: 'col7', name: 'Колледж', kind: 'college' });
    const fg = await createGroup(foreign.id, '1');
    await expect(moveStudent(s.id, b.id, fg.id)).rejects.toThrow('Группа не найдена.');
    await expect(moveStudent(s.id, a.id, b.id)).rejects.toThrow('Ученика нет в этой группе.');
  });
});

describe.skipIf(!pool)('ученики списком', () => {
  beforeEach(async () => {
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
  });

  it('предпросмотр: пометки и логины в обход занятых', async () => {
    const g = await createGroup(org.id, '7А');
    const existing = await student('ivanov.i.sch12', 'Сидоров Пётр');
    await addToGroup(g.id, existing.id);
    const p = await previewStudents(g.id, 'Иванов Иван\n\nСидоров Петр\nИванов Иван');
    expect(p.rows.map((r) => [r.line, r.issue, r.login])).toEqual([
      [1, null, 'ivanov.i2.sch12'],
      [2, 'empty', null],
      [3, 'in_group', null],
      [4, 'duplicate', null],
    ]);
    expect(p.creatable).toBe(1);
    await expect(previewStudents(crypto.randomUUID(), 'Иванов Иван')).rejects.toThrow('Группа не найдена.');
    await expect(previewStudents(g.id, 'x\n'.repeat(301))).rejects.toThrow('В списке больше 300 строк.');
  });

  it('30 учеников за один шаг: члены, в группе, пароли в листе; повтор никого не создаёт', async () => {
    const g = await createGroup(org.id, '7А');
    const text = Array.from({ length: 30 }, (_, i) => `Ученик${String.fromCharCode(1072 + i)} Имя`).join('\n');
    const created = await createStudents(g.id, text);
    expect(created).toHaveLength(30);
    expect(new Set(created.map((c) => c.login)).size).toBe(30);
    expect(await listGroupStudents(g.id)).toHaveLength(30);
    expect((await listGroupCredentials(g.id)).filter((c) => c.password)).toHaveLength(30);
    const { rows } = await pool!.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM memberships WHERE role = 'student'");
    expect(rows[0].n).toBe(30);
    expect(await createStudents(g.id, text)).toEqual([]);
  });

  it('строка листа исчезает, когда ученик сменил пароль', async () => {
    const g = await createGroup(org.id, '7А');
    const [c] = await createStudents(g.id, 'Иванов;Иван');
    expect(c).toMatchObject({ displayName: 'Иванов Иван', login: 'ivanov.i.sch12' });
    const cookie = `${SESSION_COOKIE}=${await createSession(c.userId)}`;
    const res = await changePassword(new Request('http://t/api/me/password', {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'мой-новый-пароль' }),
    }));
    expect(res.status).toBe(200);
    expect((await listGroupCredentials(g.id))[0].password).toBeNull();
  });
});
