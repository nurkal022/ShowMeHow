import crypto from 'node:crypto';
import { db } from '../db/client';
import { isUuid } from './access';
import { OrgError } from './types';

export interface Group {
  id: string;
  orgId: string;
  title: string;
}

const MAX_GROUP_TITLE = 60;

interface GroupRow { id: string; org_id: string; title: string }

function toGroup(r: GroupRow): Group {
  return { id: r.id, orgId: r.org_id, title: r.title };
}

/** Одна нормализация для поиска и создания: иначе «7  А» не нашлась бы после создания. */
function normalizeGroupTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

export async function findGroupByTitle(orgId: string, title: string): Promise<Group | null> {
  const { rows } = await db().query<GroupRow>(
    'SELECT id, org_id, title FROM groups WHERE org_id = $1 AND title = $2 AND archived_at IS NULL',
    [orgId, normalizeGroupTitle(title)]);
  return rows[0] ? toGroup(rows[0]) : null;
}

function checkGroupTitle(title: string): string {
  const clean = normalizeGroupTitle(title);
  if (!clean) throw new OrgError('Укажите название группы.');
  if (clean.length > MAX_GROUP_TITLE) {
    throw new OrgError(`Название группы должно быть не длиннее ${MAX_GROUP_TITLE} символов.`);
  }
  return clean;
}

export async function createGroup(orgId: string, title: string): Promise<Group> {
  const clean = checkGroupTitle(title);
  if (await findGroupByTitle(orgId, clean)) {
    throw new OrgError(`Группа «${clean}» уже есть в этой организации.`);
  }
  const { rows } = await db().query<GroupRow>(
    'INSERT INTO groups (id, org_id, title) VALUES ($1,$2,$3) RETURNING id, org_id, title',
    [crypto.randomUUID(), orgId, clean]);
  return toGroup(rows[0]);
}

/**
 * Архивная группа и группа архивной организации для записи не существуют.
 * Без проверки id Postgres ответил бы ошибкой типа, а не «не найдено».
 */
async function requireActiveGroup(groupId: string): Promise<void> {
  if (!isUuid(groupId)) throw new OrgError('Группа не найдена.');
  const { rows } = await db().query(
    `SELECT 1 FROM groups g JOIN organizations o ON o.id = g.org_id
     WHERE g.id = $1 AND g.archived_at IS NULL AND o.archived_at IS NULL`, [groupId]);
  if (rows.length === 0) throw new OrgError('Группа не найдена.');
}

/**
 * Единственный путь записи в group_members. Схема не может проверить, что ученик
 * состоит в организации группы (для этого нужны составные ключи во всех таблицах),
 * поэтому инвариант держит эта функция.
 */
export async function addToGroup(groupId: string, userId: string): Promise<void> {
  await requireActiveGroup(groupId);
  const { rows } = await db().query(
    `SELECT 1 FROM groups g JOIN memberships m ON m.org_id = g.org_id
     WHERE g.id = $1 AND m.user_id = $2`, [groupId, userId]);
  if (rows.length === 0) {
    throw new OrgError('Добавить в группу можно только члена организации этой группы.');
  }
  await db().query(
    'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, userId]);
}

export async function assignTeacher(groupId: string, userId: string): Promise<void> {
  await requireActiveGroup(groupId);
  const { rows } = await db().query(
    `SELECT 1 FROM groups g JOIN memberships m ON m.org_id = g.org_id
     WHERE g.id = $1 AND m.user_id = $2 AND m.role IN ('teacher', 'org_admin')`, [groupId, userId]);
  if (rows.length === 0) {
    throw new OrgError('Учителем группы можно назначить только учителя или администратора её организации.');
  }
  await db().query(
    'INSERT INTO group_teachers (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, userId]);
}

export interface GroupSummary extends Group {
  teacherNames: string[];
  studentCount: number;
}

export async function listGroups(orgId: string): Promise<GroupSummary[]> {
  const { rows } = await db().query<GroupRow & { teacher_names: string[]; student_count: number }>(
    `SELECT g.id, g.org_id, g.title,
       ARRAY(SELECT coalesce(u.display_name, u.email, u.login)
             FROM group_teachers gt JOIN users u ON u.id = gt.user_id
             WHERE gt.group_id = g.id ORDER BY 1) AS teacher_names,
       (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS student_count
     FROM groups g WHERE g.org_id = $1 AND g.archived_at IS NULL ORDER BY g.title`, [orgId]);
  return rows.map((r) => ({ ...toGroup(r), teacherNames: r.teacher_names, studentCount: r.student_count }));
}

export async function getGroup(groupId: string): Promise<Group | null> {
  if (!isUuid(groupId)) return null;
  const { rows } = await db().query<GroupRow>(
    'SELECT id, org_id, title FROM groups WHERE id = $1 AND archived_at IS NULL', [groupId]);
  return rows[0] ? toGroup(rows[0]) : null;
}

export async function renameGroup(groupId: string, title: string): Promise<Group> {
  const group = await getGroup(groupId);
  if (!group) throw new OrgError('Группа не найдена.');
  const clean = checkGroupTitle(title);
  const same = await findGroupByTitle(group.orgId, clean);
  if (same && same.id !== groupId) throw new OrgError(`Группа «${clean}» уже есть в этой организации.`);
  await db().query('UPDATE groups SET title = $2 WHERE id = $1', [groupId, clean]);
  return { ...group, title: clean };
}

/** Архив, а не удаление: курсы и ответы учеников группы остаются. */
export async function archiveGroup(groupId: string): Promise<void> {
  await db().query('UPDATE groups SET archived_at = now() WHERE id = $1 AND archived_at IS NULL', [groupId]);
}

export async function unassignTeacher(groupId: string, userId: string): Promise<void> {
  await db().query('DELETE FROM group_teachers WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
}

export interface GroupStudent {
  userId: string;
  displayName: string;
  login: string | null;
  disabled: boolean;
  mustChangePassword: boolean;
}

export async function listGroupStudents(groupId: string): Promise<GroupStudent[]> {
  const { rows } = await db().query<{
    id: string; label: string; login: string | null; disabled_at: Date | null; must_change_password: boolean;
  }>(
    `SELECT u.id, coalesce(u.display_name, u.login, u.email) AS label, u.login, u.disabled_at, u.must_change_password
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 ORDER BY label`, [groupId]);
  return rows.map((r) => ({
    userId: r.id, displayName: r.label, login: r.login,
    disabled: r.disabled_at !== null, mustChangePassword: r.must_change_password,
  }));
}

export interface GroupTeacher { userId: string; label: string }

export async function listGroupTeachers(groupId: string): Promise<GroupTeacher[]> {
  const { rows } = await db().query<{ id: string; label: string }>(
    `SELECT u.id, coalesce(u.display_name, u.email, u.login) AS label
     FROM group_teachers gt JOIN users u ON u.id = gt.user_id
     WHERE gt.group_id = $1 ORDER BY label`, [groupId]);
  return rows.map((r) => ({ userId: r.id, label: r.label }));
}

export async function isStudentInGroup(groupId: string, userId: string): Promise<boolean> {
  if (!isUuid(groupId) || !isUuid(userId)) return false;
  const { rowCount } = await db().query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return (rowCount ?? 0) > 0;
}

export async function moveStudent(userId: string, fromGroupId: string, toGroupId: string): Promise<void> {
  const from = await getGroup(fromGroupId);
  const to = await getGroup(toGroupId);
  if (!from || !to || from.orgId !== to.orgId) throw new OrgError('Группа не найдена.');
  if (!(await isStudentInGroup(fromGroupId, userId))) throw new OrgError('Ученика нет в этой группе.');
  await addToGroup(toGroupId, userId);
  await db().query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [fromGroupId, userId]);
}

/** Группы, которые учитель ведёт в этой организации (неархивные). */
export async function teacherGroupIds(userId: string, orgId: string): Promise<string[]> {
  const { rows } = await db().query<{ id: string }>(
    `SELECT g.id FROM group_teachers gt JOIN groups g ON g.id = gt.group_id
     WHERE gt.user_id = $1 AND g.org_id = $2 AND g.archived_at IS NULL ORDER BY g.title`, [userId, orgId]);
  return rows.map((r) => r.id);
}
