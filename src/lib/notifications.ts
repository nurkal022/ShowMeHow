import crypto from 'node:crypto';
import { db, hasDb } from './db/client';

/**
 * Уведомления. Одно непрочитанное на ключ: вторая «новая работа» по тому же заданию
 * не плодит строку, а увеличивает счётчик. Отправка — удобство: её сбой не должен
 * ломать оценку или сдачу, поэтому ошибки глотаются.
 */

export type NotificationKind = 'graded' | 'returned' | 'submitted' | 'published';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  count: number;
  read: boolean;
  at: string;
}

export async function notify(userId: string, n: { key: string; kind: NotificationKind; title: string; body?: string; href: string }): Promise<void> {
  if (!hasDb()) return;
  try {
    await db().query(
      `INSERT INTO notifications (id, user_id, key, kind, title, body, href)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, key) WHERE read_at IS NULL
       DO UPDATE SET count = notifications.count + 1, title = EXCLUDED.title, body = EXCLUDED.body,
         href = EXCLUDED.href, updated_at = now()`,
      [crypto.randomUUID(), userId, n.key, n.kind, n.title.slice(0, 200), (n.body ?? '').slice(0, 400), n.href]);
  } catch (e) {
    console.error('Не удалось записать уведомление:', e);
  }
}

export async function listNotifications(userId: string, limit = 30): Promise<{ items: Notification[]; unread: number }> {
  if (!hasDb()) return { items: [], unread: 0 };
  const { rows } = await db().query<{
    id: string; kind: NotificationKind; title: string; body: string; href: string; count: number; read_at: Date | null; updated_at: Date;
  }>(
    `SELECT id, kind, title, body, href, count, read_at, updated_at FROM notifications
     WHERE user_id = $1 ORDER BY (read_at IS NULL) DESC, updated_at DESC LIMIT $2`, [userId, limit]);
  const unread = rows.filter((r) => !r.read_at).length;
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id, kind: r.kind, title: r.title, body: r.body, href: r.href, count: r.count,
      read: r.read_at !== null, at: r.updated_at.toISOString(),
    })),
  };
}

export async function unreadCount(userId: string): Promise<number> {
  if (!hasDb()) return 0;
  const { rows } = await db().query<{ n: number }>(
    'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return rows[0].n;
}

/** ids не задан — прочитать все. */
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  if (!hasDb()) return;
  if (ids && ids.length > 0) {
    await db().query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [userId, ids]);
  } else {
    await db().query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  }
  // Старое прочитанное не копим: хватит последних двухсот.
  await db().query(
    `DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL AND id NOT IN (
       SELECT id FROM notifications WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200)`, [userId]);
}
