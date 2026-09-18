import { db } from '../db/client';
import type { OrgRole } from '../org/types';

/** Кем админ платформы может быстро посмотреть: по одному человеку каждой роли в каждой школе. */
export interface SwitchTarget {
  userId: string;
  label: string;
  role: OrgRole;
  orgSlug: string;
  orgName: string;
}

const ROLE_ORDER: Record<OrgRole, number> = { org_admin: 0, teacher: 1, student: 2 };

export async function listSwitchTargets(limitOrgs = 8): Promise<SwitchTarget[]> {
  const { rows } = await db().query<{
    user_id: string; label: string; role: OrgRole; slug: string; name: string;
  }>(
    `SELECT DISTINCT ON (o.id, m.role)
       u.id AS user_id, coalesce(u.display_name, u.login, u.email) AS label, m.role, o.slug, o.name
     FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     JOIN users u ON u.id = m.user_id
     WHERE o.archived_at IS NULL AND u.disabled_at IS NULL AND u.role <> 'admin'
       AND o.id IN (SELECT id FROM organizations WHERE archived_at IS NULL ORDER BY name LIMIT $1)
     ORDER BY o.id, m.role, m.created_at, u.id`, [limitOrgs]);
  return rows
    .map((r) => ({ userId: r.user_id, label: r.label, role: r.role, orgSlug: r.slug, orgName: r.name }))
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'ru') || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}
