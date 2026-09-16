import { db } from '../db/client';
import type { AuthUser } from '../auth/users';
import { resolveOrgSettings } from './settings';
import { isPlatformAdmin } from './policy';
import type { Membership, OrgKind, OrgRole } from './types';

export type { Membership, OrgKind, OrgRole } from './types';
export { isPlatformAdmin } from './policy';

/**
 * Единственное место, которое знает, кто что может в организации. При отказе
 * функции возвращают null/false, а роут отвечает 404 — так чужая организация
 * неотличима от несуществующей. Архивные организации прав не дают.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Кривой id не должен доходить до базы: Postgres ответил бы ошибкой типа, а не «не найдено». */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

interface MembershipRow {
  org_id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  role: OrgRole;
  settings: unknown;
}

function toMembership(r: MembershipRow): Membership {
  return {
    orgId: r.org_id, orgSlug: r.slug, orgName: r.name, orgKind: r.kind,
    role: r.role, settings: resolveOrgSettings(r.settings),
  };
}

const MEMBERSHIP_SELECT = `
  SELECT o.id AS org_id, o.slug, o.name, o.kind, m.role, o.settings
  FROM memberships m JOIN organizations o ON o.id = m.org_id
  WHERE o.archived_at IS NULL`;

/** Без архивных организаций (спецификация §7, §9). */
export async function listMemberships(userId: string): Promise<Membership[]> {
  const { rows } = await db().query<MembershipRow>(
    `${MEMBERSHIP_SELECT} AND m.user_id = $1 ORDER BY o.name`, [userId]);
  return rows.map(toMembership);
}

export async function orgRoleOf(userId: string, orgId: string): Promise<OrgRole | null> {
  if (!isUuid(orgId)) return null;
  const { rows } = await db().query<MembershipRow>(
    `${MEMBERSHIP_SELECT} AND m.user_id = $1 AND m.org_id = $2`, [userId, orgId]);
  return rows[0]?.role ?? null;
}

/** org_admin включает права учителя. */
function roleAllowed(role: OrgRole, allowed: OrgRole[]): boolean {
  if (allowed.includes(role)) return true;
  return role === 'org_admin' && allowed.includes('teacher');
}

export async function requireOrgRole(
  user: AuthUser, orgId: string, allowed: OrgRole[],
): Promise<Membership | null> {
  if (!isUuid(orgId)) return null;
  if (isPlatformAdmin(user)) {
    // Админ платформы видит любую организацию, в том числе архивную, — как её админ.
    const { rows } = await db().query<MembershipRow>(
      `SELECT id AS org_id, slug, name, kind, 'org_admin' AS role, settings
       FROM organizations WHERE id = $1`, [orgId]);
    return rows[0] ? toMembership(rows[0]) : null;
  }
  const { rows } = await db().query<MembershipRow>(
    `${MEMBERSHIP_SELECT} AND m.user_id = $1 AND m.org_id = $2`, [user.id, orgId]);
  const row = rows[0];
  if (!row || !roleAllowed(row.role, allowed)) return null;
  return toMembership(row);
}

/** Админ организации группы или учитель, которому группа назначена. */
export async function canManageGroup(user: AuthUser, groupId: string): Promise<boolean> {
  if (!isUuid(groupId)) return false;
  const { rows } = await db().query<{ org_id: string }>('SELECT org_id FROM groups WHERE id = $1', [groupId]);
  const group = rows[0];
  if (!group) return false;
  if (isPlatformAdmin(user)) return true;
  const role = await orgRoleOf(user.id, group.org_id);
  if (role === 'org_admin') return true;
  if (role !== 'teacher') return false;
  const assigned = await db().query(
    'SELECT 1 FROM group_teachers WHERE group_id = $1 AND user_id = $2', [groupId, user.id]);
  return (assigned.rowCount ?? 0) > 0;
}
