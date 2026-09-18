import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, findActiveUserById, findUserByIdentifier, type AuthUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { addMember, createOrganization, findOrgBySlug, type Organization } from '@/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup, getGroup, isStudentInGroup, listGroupTeachers, type Group } from '@/lib/org/groups';
import { listGroupCredentials } from '@/lib/org/credentials';
import { orgRoleOf } from '@/lib/org/access';
import { PATCH as settings } from '@/app/api/org/[slug]/settings/route';
import { POST as addTeacher } from '@/app/api/org/[slug]/teachers/route';
import { POST as newGroup } from '@/app/api/org/[slug]/groups/route';
import { PATCH as patchGroup, DELETE as archiveGroupRoute } from '@/app/api/org/[slug]/groups/[groupId]/route';
import { PUT as groupTeacher } from '@/app/api/org/[slug]/groups/[groupId]/teachers/route';
import { POST as students } from '@/app/api/org/[slug]/groups/[groupId]/students/route';
import { POST as memberAction } from '@/app/api/org/[slug]/members/[userId]/route';

const SCHEMA = 'org_api_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

const cookieOf = async (u: AuthUser) => `${SESSION_COOKIE}=${await createSession(u.id)}`;
function call(cookie: string, body: unknown, method = 'POST'): Request {
  return new Request('http://t', {
    method, headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const slugP = (slug = 'sch12') => ({ params: Promise.resolve({ slug }) });
const groupP = (groupId: string, slug = 'sch12') => ({ params: Promise.resolve({ slug, groupId }) });
const memberP = (userId: string, slug = 'sch12') => ({ params: Promise.resolve({ slug, userId }) });

describe.skipIf(!pool)('API кабинета организации', () => {
  let org: Organization;
  let director: AuthUser;
  let teacher: AuthUser;
  let student: AuthUser;
  let g7a: Group;
  let g7b: Group;
  let dc: string;
  let tc: string;
  let strangerCookie: string;

  beforeEach(async () => {
    await pool!.query('TRUNCATE organizations, users CASCADE');
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    const col = await createOrganization({ slug: 'col7', name: 'Колледж', kind: 'college' });
    director = await createUser('director@example.com', 'пароль123');
    teacher = await createUser('teacher@example.com', 'пароль123');
    const stranger = await createUser('stranger@example.com', 'пароль123');
    await addMember(org.id, director.id, 'org_admin');
    await addMember(org.id, teacher.id, 'teacher');
    await addMember(col.id, stranger.id, 'org_admin');
    student = await createLoginUser({ login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false });
    await addMember(org.id, student.id, 'student');
    g7a = await createGroup(org.id, '7А');
    g7b = await createGroup(org.id, '7Б');
    await assignTeacher(g7a.id, teacher.id);
    await addToGroup(g7a.id, student.id);
    dc = await cookieOf(director);
    tc = await cookieOf(teacher);
    strangerCookie = await cookieOf(stranger);
  });

  it('чужой админ и учитель получают 404 на действиях админа', async () => {
    for (const cookie of [strangerCookie, tc]) {
      expect((await settings(call(cookie, { settings: {} }, 'PATCH'), slugP())).status).toBe(404);
      expect((await addTeacher(call(cookie, { email: 'x@example.com' }), slugP())).status).toBe(404);
      expect((await newGroup(call(cookie, { title: '9В' }), slugP())).status).toBe(404);
      expect((await patchGroup(call(cookie, { title: 'Х' }, 'PATCH'), groupP(g7a.id))).status).toBe(404);
      expect((await groupTeacher(call(cookie, { userId: teacher.id, assigned: false }, 'PUT'), groupP(g7a.id))).status).toBe(404);
      expect((await students(call(cookie, { text: 'Петров Пётр', dryRun: true }), groupP(g7a.id))).status).toBe(404);
      expect((await memberAction(call(cookie, { action: 'disable' }), memberP(student.id))).status).toBe(404);
    }
    expect((await settings(call(dc, { settings: {} }, 'PATCH'), slugP('nope'))).status).toBe(404);
    // Группа другой организации через свой слаг не находится.
    const foreign = await createGroup((await findOrgBySlug('col7'))!.id, '1');
    expect((await patchGroup(call(dc, { title: 'Х' }, 'PATCH'), groupP(foreign.id))).status).toBe(404);
  });

  it('настройки, учитель, группы', async () => {
    const s = await settings(call(dc, { settings: { studentLongSessions: true } }, 'PATCH'), slugP());
    expect((await s.json()).settings.studentLongSessions).toBe(true);

    const t = await addTeacher(call(dc, { login: 'fizik.sch12', displayName: 'Физик' }), slugP());
    expect(t.status).toBe(201);
    expect((await t.json())).toMatchObject({ label: 'Физик', created: true });
    const bad = await addTeacher(call(dc, { login: 'fizik.sch12', displayName: 'Физик' }), slugP());
    expect(bad.status).toBe(400);

    const g = await newGroup(call(dc, { title: '9В' }), slugP());
    expect(g.status).toBe(201);
    const { group } = await g.json();
    expect((await patchGroup(call(dc, { title: '9Г' }, 'PATCH'), groupP(group.id))).status).toBe(200);
    expect((await patchGroup(call(dc, { title: '7А' }, 'PATCH'), groupP(group.id))).status).toBe(400);
    const fizik = (await findUserByIdentifier('fizik.sch12'))!;
    expect((await groupTeacher(call(dc, { userId: fizik.id, assigned: true }, 'PUT'), groupP(group.id))).status).toBe(200);
    expect(await listGroupTeachers(group.id)).toEqual([{ userId: fizik.id, label: 'Физик' }]);
    expect((await groupTeacher(call(dc, { userId: student.id, assigned: true }, 'PUT'), groupP(group.id))).status).toBe(400);
    expect((await archiveGroupRoute(call(dc, {}, 'DELETE'), groupP(group.id))).status).toBe(200);
    expect(await getGroup(group.id)).toBeNull();
  });

  it('ученики списком: предпросмотр и создание', async () => {
    const preview = await students(call(dc, { text: 'Петров Пётр\nИванов Иван', dryRun: true }), groupP(g7a.id));
    const body = await preview.json();
    expect(body.creatable).toBe(1);
    expect(body.rows.map((r: { issue: string | null }) => r.issue)).toEqual([null, 'in_group']);
    const created = await students(call(dc, { text: 'Петров Пётр\nИванов Иван', dryRun: false }), groupP(g7a.id));
    expect(created.status).toBe(201);
    expect((await created.json()).created).toEqual([expect.objectContaining({ login: 'petrov.p.sch12' })]);
    expect((await students(call(dc, { text: 5 }), groupP(g7a.id))).status).toBe(400);
  });

  it('учитель группы сбрасывает пароль только своему ученику', async () => {
    const other = await createLoginUser({ login: 'kim.o.sch12', displayName: 'Ким Олег', password: 'пароль123', mustChangePassword: false });
    await addMember(org.id, other.id, 'student');
    await addToGroup(g7b.id, other.id);
    const ok = await memberAction(call(tc, { action: 'reset-password', groupId: g7a.id }), memberP(student.id));
    expect(ok.status).toBe(200);
    const { password } = await ok.json();
    expect((await listGroupCredentials(g7a.id))[0].password).toBe(password);
    expect((await memberAction(call(tc, { action: 'reset-password', groupId: g7b.id }), memberP(other.id))).status).toBe(404);
    expect((await memberAction(call(tc, { action: 'reset-password', groupId: g7a.id }), memberP(other.id))).status).toBe(404);
    expect((await memberAction(call(tc, { action: 'disable', groupId: g7a.id }), memberP(student.id))).status).toBe(404);
  });

  it('админ организации: блокировка, перевод, снятие учителя, отказ по чужим аккаунтам', async () => {
    expect((await memberAction(call(dc, { action: 'disable' }), memberP(student.id))).status).toBe(200);
    expect(await findActiveUserById(student.id)).toBeNull();
    expect((await memberAction(call(dc, { action: 'enable' }), memberP(student.id))).status).toBe(200);
    const moved = await memberAction(call(dc, { action: 'move', groupId: g7a.id, toGroupId: g7b.id }), memberP(student.id));
    expect(moved.status).toBe(200);
    expect(await isStudentInGroup(g7b.id, student.id)).toBe(true);

    const courseId = crypto.randomUUID();
    await pool!.query('INSERT INTO courses (id, org_id, owner_id, title) VALUES ($1, $2, $3, $4)',
      [courseId, org.id, teacher.id, 'Физика']);
    const removed = await memberAction(call(dc, { action: 'remove' }), memberP(teacher.id));
    expect(await removed.json()).toEqual({ ok: true, reassignedCourses: 1 });
    expect(await orgRoleOf(teacher.id, org.id)).toBeNull();
    expect((await memberAction(call(dc, { action: 'remove' }), memberP(student.id))).status).toBe(400);
    expect((await memberAction(call(dc, { action: 'disable' }), memberP(director.id))).status).toBe(400);

    const shared = await createUser('shared@example.com', 'пароль123');
    await addMember(org.id, shared.id, 'teacher');
    await addMember((await findOrgBySlug('col7'))!.id, shared.id, 'teacher');
    const refused = await memberAction(call(dc, { action: 'reset-password' }), memberP(shared.id));
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain('администратору платформы');
    expect((await memberAction(call(dc, { action: 'fly' }), memberP(student.id))).status).toBe(400);
  });
});
