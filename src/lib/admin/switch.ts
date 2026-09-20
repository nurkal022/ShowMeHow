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

/**
 * Есть демонстрационная организация — показываем только её людей: список для
 * показов и тестов, а не перепись всех аккаунтов платформы. Демо-школы нет —
 * работает прежний порядок: по одному человеку каждой роли из первых школ.
 */
export async function listSwitchTargets(limitOrgs = 8, limitPerRole = 4): Promise<SwitchTarget[]> {
  const demo = await db().query<{
    user_id: string; label: string; role: OrgRole; slug: string; name: string;
  }>(
    `SELECT user_id, label, role, slug, name FROM (
       SELECT u.id AS user_id, coalesce(u.display_name, u.login, u.email) AS label, m.role, o.slug, o.name,
         row_number() OVER (PARTITION BY m.role ORDER BY m.created_at, u.id) AS n
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
       JOIN users u ON u.id = m.user_id
       WHERE o.demo AND o.archived_at IS NULL AND u.disabled_at IS NULL AND u.role <> 'admin'
     ) t WHERE n <= $1`, [limitPerRole]);
  const rows = demo.rows.length > 0 ? demo.rows : (await db().query<{
    user_id: string; label: string; role: OrgRole; slug: string; name: string;
  }>(
    `SELECT DISTINCT ON (o.id, m.role)
       u.id AS user_id, coalesce(u.display_name, u.login, u.email) AS label, m.role, o.slug, o.name
     FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     JOIN users u ON u.id = m.user_id
     WHERE o.archived_at IS NULL AND u.disabled_at IS NULL AND u.role <> 'admin'
       AND o.id IN (SELECT id FROM organizations WHERE archived_at IS NULL ORDER BY name LIMIT $1)
     ORDER BY o.id, m.role, m.created_at, u.id`, [limitOrgs])).rows;
  return rows
    .map((r) => ({ userId: r.user_id, label: r.label, role: r.role, orgSlug: r.slug, orgName: r.name }))
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'ru')
      || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
      || a.label.localeCompare(b.label, 'ru'));
}
