import { db } from '../db/client';
import { isUuid } from '../org/access';
import type { Role } from '../auth/users';
import type { OrgRole } from '../org/types';

/** Пользователи для админки платформы: поиск, карточка, роль платформы. */

/** Знаки % и _ во вводе ищутся буквально. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface UserListItem {
  id: string;
  email: string | null;
  login: string | null;
  displayName: string | null;
  role: Role;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface UserRow {
  id: string; email: string | null; login: string | null; display_name: string | null;
  role: Role; disabled_at: Date | null; must_change_password: boolean; created_at: Date;
}

const COLUMNS = 'id, email, login, display_name, role, disabled_at, must_change_password, created_at';

function toItem(r: UserRow): UserListItem {
  return {
    id: r.id, email: r.email, login: r.login, displayName: r.display_name, role: r.role,
    disabled: r.disabled_at !== null, mustChangePassword: r.must_change_password,
    createdAt: r.created_at.toISOString(),
  };
}

export async function searchUsers(query: string, limit = 50): Promise<UserListItem[]> {
  const q = query.trim().slice(0, 100);
  const { rows } = q
    ? await db().query<UserRow>(
      `SELECT ${COLUMNS} FROM users
       WHERE email ILIKE $1 OR login ILIKE $1 OR display_name ILIKE $1
       ORDER BY created_at DESC LIMIT $2`, [`%${escapeLike(q)}%`, limit])
    : await db().query<UserRow>(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map(toItem);
}

export interface UserMembershipInfo {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: OrgRole;
  archived: boolean;
}

export interface UserCard extends UserListItem {
  memberships: UserMembershipInfo[];
}

export async function getUserCard(id: string): Promise<UserCard | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const ms = await db().query<{ org_id: string; slug: string; name: string; role: OrgRole; archived: boolean }>(
    `SELECT o.id AS org_id, o.slug, o.name, m.role, (o.archived_at IS NOT NULL) AS archived
     FROM memberships m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = $1 ORDER BY o.name`, [id]);
  return {
    ...toItem(rows[0]),
    memberships: ms.rows.map((m) => ({
      orgId: m.org_id, orgSlug: m.slug, orgName: m.name, role: m.role, archived: m.archived,
    })),
  };
}

export async function setPlatformRole(userId: string, role: Role): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const r = await db().query('UPDATE users SET role = $2 WHERE id = $1', [userId, role]);
  return (r.rowCount ?? 0) > 0;
}
