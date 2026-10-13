import { db } from '../db/client';

/** Личный демо-университет человека (без тяжёлых сидов — их тянет только sandbox.ts). */
export interface Sandbox { orgId: string; slug: string; name: string }

export type SandboxView = 'teacher' | 'student';

export async function sandboxOf(userId: string): Promise<Sandbox | null> {
  const { rows } = await db().query<{ id: string; slug: string; name: string }>(
    'SELECT id, slug, name FROM organizations WHERE sandbox_owner = $1 AND archived_at IS NULL', [userId]);
  return rows[0] ? { orgId: rows[0].id, slug: rows[0].slug, name: rows[0].name } : null;
}

/** Владелец песочницы смотрит только глазами её участников — не дальше. */
export async function canViewAs(viewerId: string, targetId: string): Promise<boolean> {
  const { rowCount } = await db().query(
    `SELECT 1 FROM organizations o JOIN memberships m ON m.org_id = o.id
     WHERE o.sandbox_owner = $1 AND o.archived_at IS NULL AND m.user_id = $2 LIMIT 1`, [viewerId, targetId]);
  return !!rowCount;
}

/**
 * Кем показывать роль: первый преподаватель песочницы или студент из середины по активности —
 * у отличника всё сдано и главная пустеет, у отстающего нечего показать.
 */
export async function sandboxPerson(orgId: string, view: SandboxView): Promise<string | null> {
  const { rows } = await db().query<{ id: string }>(
    view === 'teacher'
      ? `SELECT m.user_id AS id FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1 AND m.role = 'teacher' ORDER BY m.created_at, u.id LIMIT 1`
      : `SELECT m.user_id AS id FROM memberships m
         WHERE m.org_id = $1 AND m.role = 'student'
         ORDER BY (SELECT count(*) FROM submissions s WHERE s.student_id = m.user_id) DESC, m.user_id`,
    [orgId]);
  return rows[view === 'teacher' ? 0 : Math.floor(rows.length / 2)]?.id ?? null;
}
