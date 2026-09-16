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

export async function findGroupByTitle(orgId: string, title: string): Promise<Group | null> {
  const { rows } = await db().query<GroupRow>(
    'SELECT id, org_id, title FROM groups WHERE org_id = $1 AND title = $2 AND archived_at IS NULL',
    [orgId, title.trim()]);
  return rows[0] ? toGroup(rows[0]) : null;
}

export async function createGroup(orgId: string, title: string): Promise<Group> {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (!clean) throw new OrgError('Укажите название группы.');
  if (clean.length > MAX_GROUP_TITLE) {
    throw new OrgError(`Название группы должно быть не длиннее ${MAX_GROUP_TITLE} символов.`);
  }
  if (await findGroupByTitle(orgId, clean)) {
    throw new OrgError(`Группа «${clean}» уже есть в этой организации.`);
  }
  const { rows } = await db().query<GroupRow>(
    'INSERT INTO groups (id, org_id, title) VALUES ($1,$2,$3) RETURNING id, org_id, title',
    [crypto.randomUUID(), orgId, clean]);
  return toGroup(rows[0]);
}

/**
 * Единственный путь записи в group_members. Схема не может проверить, что ученик
 * состоит в организации группы (для этого нужны составные ключи во всех таблицах),
 * поэтому инвариант держит эта функция.
 */
export async function addToGroup(groupId: string, userId: string): Promise<void> {
  if (!isUuid(groupId)) throw new OrgError('Группа не найдена.');
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
  if (!isUuid(groupId)) throw new OrgError('Группа не найдена.');
  const { rows } = await db().query(
    `SELECT 1 FROM groups g JOIN memberships m ON m.org_id = g.org_id
     WHERE g.id = $1 AND m.user_id = $2 AND m.role IN ('teacher', 'org_admin')`, [groupId, userId]);
  if (rows.length === 0) {
    throw new OrgError('Учителем группы можно назначить только учителя или администратора её организации.');
  }
  await db().query(
    'INSERT INTO group_teachers (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, userId]);
}
