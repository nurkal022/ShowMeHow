import { db } from '../db/client';
import type { AdminActionName } from './labels';

/** Журнал админки: каждое действие роутов /api/admin/* пишет сюда строку. */

export interface AdminActionRow {
  id: string;
  actorLabel: string;
  action: string;
  target: string | null;
  payload: Record<string, unknown>;
  at: string;
}

export async function logAdminAction(
  actorId: string, action: AdminActionName, target: string | null, payload: Record<string, unknown> = {},
): Promise<void> {
  await db().query(
    'INSERT INTO admin_actions (actor_id, action, target, payload) VALUES ($1, $2, $3, $4)',
    [actorId, action, target, JSON.stringify(payload)]);
}

export async function listAdminActions(limit = 200): Promise<AdminActionRow[]> {
  const { rows } = await db().query<{
    id: string; actor_label: string; action: string; target: string | null;
    payload: Record<string, unknown>; at: Date;
  }>(
    `SELECT a.id::text AS id,
       coalesce(u.display_name, u.email, u.login, 'удалённый пользователь') AS actor_label,
       a.action, a.target, a.payload, a.at
     FROM admin_actions a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.at DESC, a.id DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id, actorLabel: r.actor_label, action: r.action, target: r.target,
    payload: r.payload, at: r.at.toISOString(),
  }));
}
