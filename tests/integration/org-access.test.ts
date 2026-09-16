import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import {
  createOrganization, findOrgBySlug, listOrganizations, addMember, updateOrgSettings, isValidSlug,
  type Organization,
} from '@/lib/org/orgs';
import { createGroup, findGroupByTitle, addToGroup, assignTeacher } from '@/lib/org/groups';
import { listMemberships, orgRoleOf, requireOrgRole, canManageGroup, isUuid } from '@/lib/org/access';
import { OrgError } from '@/lib/org/types';

const SCHEMA = 'org_access_test';
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

describe('проверки без базы', () => {
  it('слаг: строчная латиница, цифры, дефис, 2–32 символа', () => {
    expect(isValidSlug('sch12')).toBe(true);
    expect(isValidSlug('kz-college-7')).toBe(true);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('a'.repeat(33))).toBe(false);
    expect(isValidSlug('Sch12')).toBe(false);
    expect(isValidSlug('шк12')).toBe(false);
    expect(isValidSlug('sch_12')).toBe(false);
  });
  it('isUuid', () => {
    expect(isUuid('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(isUuid('../evil')).toBe(false);
  });
});

describe.skipIf(!pool)('доступ в организации', () => {
  let sch: Organization;
  let other: Organization;
  let teacher: AuthUser;
  let student: AuthUser;
  let orgAdmin: AuthUser;
  let stranger: AuthUser;
  let admin: AuthUser;

  beforeEach(async () => {
    sch = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    other = await createOrganization({ slug: 'col7', name: 'Колледж №7', kind: 'college' });
    teacher = await createUser('teacher@example.com', 'пароль123');
    orgAdmin = await createUser('director@example.com', 'пароль123');
    student = await createLoginUser({
      login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false,
    });
    stranger = await createLoginUser({
      login: 'petrov.p.col7', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'boss@example.com';
    admin = await createUser('boss@example.com', 'пароль123');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
    await addMember(sch.id, teacher.id, 'teacher');
    await addMember(sch.id, orgAdmin.id, 'org_admin');
    await addMember(sch.id, student.id, 'student');
    await addMember(other.id, stranger.id, 'student');
  });

  it('listMemberships отдаёт организацию с настройками по умолчанию', async () => {
    expect(await listMemberships(student.id)).toEqual([{
      orgId: sch.id, orgSlug: 'sch12', orgName: 'Школа №12', orgKind: 'school', role: 'student',
      settings: { studentsCanGenerate: false, studentLongSessions: false, teacherGenerationLimit: 100 },
    }]);
    expect(await listMemberships(admin.id)).toEqual([]);
  });

  it('в одной организации у человека одна роль: повторное добавление меняет её', async () => {
    await addMember(sch.id, student.id, 'teacher');
    expect(await orgRoleOf(student.id, sch.id)).toBe('teacher');
    const { rows } = await pool!.query('SELECT 1 FROM memberships WHERE user_id = $1', [student.id]);
    expect(rows).toHaveLength(1);
  });

  it('requireOrgRole: чужая организация — null, своя с подходящей ролью — членство', async () => {
    expect(await requireOrgRole(teacher, other.id, ['teacher', 'org_admin'])).toBeNull();
    expect((await requireOrgRole(teacher, sch.id, ['teacher']))?.role).toBe('teacher');
    expect(await requireOrgRole(teacher, sch.id, ['org_admin'])).toBeNull();
    expect(await requireOrgRole(student, sch.id, ['teacher'])).toBeNull();
    // org_admin включает права учителя.
    expect((await requireOrgRole(orgAdmin, sch.id, ['teacher']))?.role).toBe('org_admin');
    expect(await requireOrgRole(teacher, 'не-uuid', ['teacher'])).toBeNull();
  });

  it('платформенный админ проходит в любую существующую организацию', async () => {
    const m = await requireOrgRole(admin, other.id, ['org_admin']);
    expect(m).toMatchObject({ orgId: other.id, orgSlug: 'col7', role: 'org_admin' });
    expect(await requireOrgRole(admin, '00000000-0000-0000-0000-000000000000', ['org_admin'])).toBeNull();
  });

  it('addToGroup пускает только члена организации группы', async () => {
    const g = await createGroup(sch.id, '7А');
    await expect(addToGroup(g.id, stranger.id)).rejects.toBeInstanceOf(OrgError);
    await expect(addToGroup(g.id, admin.id)).rejects.toBeInstanceOf(OrgError);
    const before = await pool!.query('SELECT 1 FROM group_members');
    expect(before.rows).toHaveLength(0);
    await addToGroup(g.id, student.id);
    await addToGroup(g.id, student.id);  // повтор безвреден
    const after = await pool!.query('SELECT user_id FROM group_members');
    expect(after.rows).toEqual([{ user_id: student.id }]);
    await expect(addToGroup('00000000-0000-0000-0000-000000000000', student.id)).rejects.toBeInstanceOf(OrgError);
  });

  it('группы: название обязательно и не повторяется внутри организации', async () => {
    const g = await createGroup(sch.id, ' 7А ');
    expect(g.title).toBe('7А');
    await expect(createGroup(sch.id, '7А')).rejects.toBeInstanceOf(OrgError);
    await expect(createGroup(sch.id, '   ')).rejects.toBeInstanceOf(OrgError);
    expect((await createGroup(other.id, '7А')).orgId).toBe(other.id);
    expect((await findGroupByTitle(sch.id, '7А'))?.id).toBe(g.id);
    expect(await findGroupByTitle(sch.id, '8Б')).toBeNull();
  });

  it('учителем группы назначается только учитель или админ этой организации', async () => {
    const g = await createGroup(sch.id, '7А');
    await expect(assignTeacher(g.id, student.id)).rejects.toBeInstanceOf(OrgError);
    await expect(assignTeacher(g.id, stranger.id)).rejects.toBeInstanceOf(OrgError);
    await assignTeacher(g.id, teacher.id);
    await assignTeacher(g.id, teacher.id);
    const { rows } = await pool!.query('SELECT user_id FROM group_teachers');
    expect(rows).toEqual([{ user_id: teacher.id }]);
  });

  it('canManageGroup: админ организации, назначенный учитель и платформенный админ', async () => {
    const g = await createGroup(sch.id, '7А');
    expect(await canManageGroup(teacher, g.id)).toBe(false);
    await assignTeacher(g.id, teacher.id);
    expect(await canManageGroup(teacher, g.id)).toBe(true);
    expect(await canManageGroup(orgAdmin, g.id)).toBe(true);
    expect(await canManageGroup(admin, g.id)).toBe(true);
    expect(await canManageGroup(student, g.id)).toBe(false);
    expect(await canManageGroup(stranger, g.id)).toBe(false);
    expect(await canManageGroup(admin, 'не-uuid')).toBe(false);
  });

  it('архивная организация не даёт прав', async () => {
    const g = await createGroup(sch.id, '7А');
    await assignTeacher(g.id, teacher.id);
    await pool!.query('UPDATE organizations SET archived_at = now() WHERE id = $1', [sch.id]);
    expect(await listMemberships(teacher.id)).toEqual([]);
    expect(await orgRoleOf(teacher.id, sch.id)).toBeNull();
    expect(await requireOrgRole(teacher, sch.id, ['teacher'])).toBeNull();
    expect(await canManageGroup(teacher, g.id)).toBe(false);
    expect(await canManageGroup(orgAdmin, g.id)).toBe(false);
  });

  it('архивная группа считается отсутствующей', async () => {
    const g = await createGroup(sch.id, '7А');
    await assignTeacher(g.id, teacher.id);
    await pool!.query('UPDATE groups SET archived_at = now() WHERE id = $1', [g.id]);
    expect(await canManageGroup(teacher, g.id)).toBe(false);
    expect(await canManageGroup(orgAdmin, g.id)).toBe(false);
    expect(await canManageGroup(admin, g.id)).toBe(false);
    await expect(addToGroup(g.id, student.id)).rejects.toThrow('Группа не найдена.');
    await expect(assignTeacher(g.id, orgAdmin.id)).rejects.toThrow('Группа не найдена.');
    const { rows } = await pool!.query(
      'SELECT (SELECT count(*) FROM group_members)::int AS m, (SELECT count(*) FROM group_teachers)::int AS t');
    expect(rows[0]).toEqual({ m: 0, t: 1 });
  });

  it('в группу архивной организации нельзя добавить ни ученика, ни учителя', async () => {
    const g = await createGroup(sch.id, '7А');
    await pool!.query('UPDATE organizations SET archived_at = now() WHERE id = $1', [sch.id]);
    await expect(addToGroup(g.id, student.id)).rejects.toThrow('Группа не найдена.');
    await expect(assignTeacher(g.id, teacher.id)).rejects.toThrow('Группа не найдена.');
    const { rows } = await pool!.query(
      'SELECT (SELECT count(*) FROM group_members)::int AS m, (SELECT count(*) FROM group_teachers)::int AS t');
    expect(rows[0]).toEqual({ m: 0, t: 0 });
  });

  it('поиск группы нормализует пробелы так же, как создание', async () => {
    const g = await createGroup(sch.id, '  7   А ');
    expect(g.title).toBe('7 А');
    expect((await findGroupByTitle(sch.id, '7  А'))?.id).toBe(g.id);
    expect((await findGroupByTitle(sch.id, ' 7\tА'))?.id).toBe(g.id);
    await expect(createGroup(sch.id, '7    А')).rejects.toThrow('Группа «7 А» уже есть в этой организации.');
  });

  it('создание организации: занятый и кривой слаг — отказ, ничего не создано', async () => {
    await expect(createOrganization({ slug: 'SCH12', name: 'Дубль', kind: 'school' }))
      .rejects.toThrow('Слаг «sch12» уже занят.');
    await expect(createOrganization({ slug: 'шк', name: 'X', kind: 'school' })).rejects.toBeInstanceOf(OrgError);
    await expect(createOrganization({ slug: 'ok-slug', name: 'X', kind: 'kindergarten' }))
      .rejects.toBeInstanceOf(OrgError);
    await expect(createOrganization({ slug: 'ok-slug', name: '  ', kind: 'school' }))
      .rejects.toBeInstanceOf(OrgError);
    const list = await listOrganizations();
    expect(list.map((o) => [o.slug, o.memberCount])).toEqual([['col7', 1], ['sch12', 3]]);
    expect((await findOrgBySlug('SCH12'))?.id).toBe(sch.id);
    expect(await findOrgBySlug('nope')).toBeNull();
  });

  it('updateOrgSettings пишет только известные ключи и возвращает полные настройки', async () => {
    const s = await updateOrgSettings(sch.id, { studentsCanGenerate: true, hack: 'да' });
    expect(s).toEqual({ studentsCanGenerate: true, studentLongSessions: false, teacherGenerationLimit: 100 });
    await updateOrgSettings(sch.id, { teacherGenerationLimit: 5 });
    const { rows } = await pool!.query<{ settings: unknown }>(
      'SELECT settings FROM organizations WHERE id = $1', [sch.id]);
    expect(rows[0].settings).toEqual({ studentsCanGenerate: true, teacherGenerationLimit: 5 });
    await expect(updateOrgSettings('00000000-0000-0000-0000-000000000000', {}))
      .rejects.toBeInstanceOf(OrgError);
  });
});
