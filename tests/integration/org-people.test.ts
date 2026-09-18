import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, findUserByIdentifier, type AuthUser } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import {
  addMember, createOrganization, getOrgById, listOrganizationsForAdmin, orgOverview, setOrgArchived,
  type Organization,
} from '@/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup } from '@/lib/org/groups';
import { orgRoleOf } from '@/lib/org/access';
import {
  provisionMember, removeMember, listOrgPeople, getOrgPerson, isExclusiveMember,
} from '@/lib/org/people';
import { resolveCabinetOrg } from '@/lib/org/cabinet';
import { OrgError } from '@/lib/org/types';

const SCHEMA = 'org_people_test';
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

describe.skipIf(!pool)('люди организации', () => {
  let org: Organization;
  let director: AuthUser;

  beforeEach(async () => {
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    director = await createUser('director@example.com', 'пароль123');
    await addMember(org.id, director.id, 'org_admin');
  });

  it('новый по почте: временный пароль, смена обязательна, имя записано', async () => {
    const r = await provisionMember(org.id, 'teacher',
      { kind: 'email', email: 'new@example.com', displayName: 'Анна Петровна' });
    expect(r).toMatchObject({ label: 'Анна Петровна', created: true });
    expect(r.tempPassword).toMatch(/^[а-я]+-[а-я]+-[а-я]+$/);
    const stored = await findUserByIdentifier('new@example.com');
    expect(stored).toMatchObject({ displayName: 'Анна Петровна', mustChangePassword: true });
    expect(verifyPassword(r.tempPassword!, stored!.passwordHash)).toBe(true);
    expect(await orgRoleOf(r.userId, org.id)).toBe('teacher');
  });

  it('существующий по почте становится членом без нового пароля; повтор — отказ', async () => {
    const u = await createUser('old@example.com', 'пароль123');
    expect(await provisionMember(org.id, 'teacher', { kind: 'email', email: 'old@example.com', displayName: null }))
      .toEqual({ userId: u.id, label: 'old@example.com', tempPassword: null, created: false });
    await expect(provisionMember(org.id, 'teacher', { kind: 'email', email: 'old@example.com', displayName: null }))
      .rejects.toThrow('Этот человек уже состоит в организации: учитель.');
  });

  it('по логину: новый создаётся, занятый — отказ', async () => {
    const r = await provisionMember(org.id, 'org_admin', { kind: 'login', login: 'zavuch.sch12', displayName: 'Завуч' });
    expect(r.created).toBe(true);
    await expect(provisionMember(org.id, 'teacher', { kind: 'login', login: 'zavuch.sch12', displayName: 'Другой' }))
      .rejects.toBeInstanceOf(OrgError);
  });

  it('removeMember переписывает владельца курсов и снимает с групп', async () => {
    const t = await createUser('t@example.com', 'пароль123');
    await addMember(org.id, t.id, 'teacher');
    const g = await createGroup(org.id, '7А');
    await assignTeacher(g.id, t.id);
    const courseId = crypto.randomUUID();
    await pool!.query('INSERT INTO courses (id, org_id, owner_id, title) VALUES ($1, $2, $3, $4)',
      [courseId, org.id, t.id, 'Физика']);
    expect(await removeMember(org.id, t.id, director.id)).toEqual({ reassignedCourses: 1 });
    const { rows } = await pool!.query<{ owner_id: string }>('SELECT owner_id FROM courses WHERE id = $1', [courseId]);
    expect(rows[0].owner_id).toBe(director.id);
    expect(await orgRoleOf(t.id, org.id)).toBeNull();
    expect((await pool!.query('SELECT 1 FROM group_teachers')).rows).toHaveLength(0);
    await expect(removeMember(org.id, t.id, director.id)).rejects.toThrow('Этот человек не состоит в организации.');
  });

  it('списки людей, исключительное членство, обзор', async () => {
    const s = await createLoginUser({
      login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: true });
    await addMember(org.id, s.id, 'student');
    const g = await createGroup(org.id, '7А');
    await addToGroup(g.id, s.id);
    expect(await listOrgPeople(org.id, ['student'])).toEqual([{
      userId: s.id, displayName: 'Иванов Иван', email: null, login: 'ivanov.i.sch12', role: 'student',
      disabled: false, mustChangePassword: true, groups: ['7А'],
    }]);
    expect((await getOrgPerson(org.id, s.id))?.role).toBe('student');
    expect(await getOrgPerson(org.id, 'не-uuid')).toBeNull();
    expect(await isExclusiveMember(org.id, s.id)).toBe(true);
    const other = await createOrganization({ slug: 'col7', name: 'Колледж', kind: 'college' });
    await addMember(other.id, s.id, 'student');
    expect(await isExclusiveMember(org.id, s.id)).toBe(false);
    expect(await orgOverview(org.id)).toEqual({ admins: 1, teachers: 0, students: 1, groups: 1, courses: 0 });
  });

  it('организации для админки, архив, поиск по id, длина названия', async () => {
    expect(await setOrgArchived(org.id, true)).toBe(true);
    expect((await getOrgById(org.id))?.archivedAt).not.toBeNull();
    const [row] = await listOrganizationsForAdmin();
    expect(row).toMatchObject({ slug: 'sch12', memberCount: 1 });
    expect(row.createdAt).toMatch(/^\d{4}-/);
    await setOrgArchived(org.id, false);
    expect((await getOrgById(org.id))?.archivedAt).toBeNull();
    expect(await getOrgById('../x')).toBeNull();
    await expect(createOrganization({ slug: 'long', name: 'я'.repeat(201), kind: 'school' }))
      .rejects.toThrow('Название организации — не длиннее 200 символов.');
  });

  it('кабинет: выбор организации по ?org=, админ платформы — по слагу', async () => {
    const other = await createOrganization({ slug: 'col7', name: 'Колледж №7', kind: 'college' });
    await addMember(other.id, director.id, 'teacher');
    expect((await resolveCabinetOrg(director, ['org_admin'], undefined))?.membership.orgSlug).toBe('sch12');
    expect(await resolveCabinetOrg(director, ['org_admin'], 'col7')).toBeNull();
    const teach = await resolveCabinetOrg(director, ['teacher'], 'col7');
    expect(teach?.membership.role).toBe('teacher');
    expect(teach?.choices.map((c) => c.slug)).toEqual(['col7', 'sch12']);

    process.env.SHOWMEHOW_ADMIN_EMAIL = 'boss@example.com';
    const boss = await createUser('boss@example.com', 'пароль123');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
    expect(await resolveCabinetOrg(boss, ['org_admin'], undefined)).toBeNull();
    expect((await resolveCabinetOrg(boss, ['org_admin'], 'col7'))?.membership)
      .toMatchObject({ orgSlug: 'col7', role: 'org_admin' });
    expect(await resolveCabinetOrg(boss, ['org_admin'], 'nope')).toBeNull();
  });
});
