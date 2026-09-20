import crypto from 'node:crypto';
import { db } from '../db/client';
import { LmsError } from './types';
import { VISIBLE_TO_STUDENT } from './courses';
import type { Comment } from './discussion-types';

export type { Comment };

/** Прохождение шагов и обсуждение под уроком. Права проверяет вызывающий (learnerCourse). */

const MAX_COMMENT = 2000;

/** Отмечает шаги пройденными. Чужие блоки отсеиваются в самом запросе: курс должен быть виден ученику. */
export async function recordBlockViews(userId: string, blockIds: string[]): Promise<void> {
  if (blockIds.length === 0) return;
  await db().query(
    `INSERT INTO block_views (block_id, user_id)
     SELECT b.id, $1 FROM blocks b JOIN topics t ON t.id = b.topic_id JOIN courses c ON c.id = t.course_id
     WHERE b.id = ANY($2::uuid[]) AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
     ON CONFLICT (block_id, user_id) DO UPDATE SET last_at = now()`, [userId, blockIds]);
}

export async function viewedBlockIds(userId: string, blockIds: string[]): Promise<Set<string>> {
  if (blockIds.length === 0) return new Set();
  const { rows } = await db().query<{ block_id: string }>(
    'SELECT block_id FROM block_views WHERE user_id = $1 AND block_id = ANY($2::uuid[])', [userId, blockIds]);
  return new Set(rows.map((r) => r.block_id));
}

/** Сколько шагов темы ученик открыл — для оглавления курса. */
export async function viewedCountsByTopic(userId: string, courseId: string): Promise<Map<string, number>> {
  const { rows } = await db().query<{ topic_id: string; n: number }>(
    `SELECT b.topic_id, count(*)::int AS n FROM block_views v JOIN blocks b ON b.id = v.block_id
     JOIN topics t ON t.id = b.topic_id WHERE v.user_id = $1 AND t.course_id = $2 GROUP BY b.topic_id`, [userId, courseId]);
  return new Map(rows.map((r) => [r.topic_id, r.n]));
}


export async function listComments(topicId: string): Promise<Comment[]> {
  const { rows } = await db().query<{
    id: string; author_id: string; author: string; is_teacher: boolean; body: string; created_at: Date;
    parent_id: string | null; deleted_at: Date | null;
  }>(
    `SELECT c.id, c.author_id, coalesce(u.display_name, u.login, u.email) AS author, c.body, c.created_at, c.parent_id, c.deleted_at,
       EXISTS (SELECT 1 FROM memberships m JOIN topics t ON t.id = c.topic_id JOIN courses co ON co.id = t.course_id
               WHERE m.user_id = c.author_id AND m.org_id = co.org_id AND m.role IN ('teacher', 'org_admin')) AS is_teacher
     FROM lesson_comments c JOIN users u ON u.id = c.author_id
     WHERE c.topic_id = $1 ORDER BY c.created_at`, [topicId]);
  return rows.map((r) => ({
    id: r.id, authorId: r.author_id, author: r.author, role: r.is_teacher ? 'teacher' : 'student',
    body: r.deleted_at ? '' : r.body, createdAt: r.created_at.toISOString(), parentId: r.parent_id, deleted: r.deleted_at !== null,
  }));
}

export async function addComment(topicId: string, authorId: string, raw: unknown, parentId: unknown): Promise<Comment> {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (!body) throw new LmsError('Напишите вопрос или мысль — пустое сообщение не отправляется.');
  if (body.length > MAX_COMMENT) throw new LmsError(`Сообщение — не длиннее ${MAX_COMMENT} символов.`);
  const parent = typeof parentId === 'string' && parentId ? parentId : null;
  if (parent) {
    // Ветка только одного уровня: ответ на ответ крепится к тому же корню.
    const { rows } = await db().query<{ id: string; parent_id: string | null; topic_id: string }>(
      'SELECT id, parent_id, topic_id FROM lesson_comments WHERE id = $1', [parent]);
    if (!rows[0] || rows[0].topic_id !== topicId) throw new LmsError('Сообщение, на которое вы отвечаете, уже удалено.');
  }
  const id = crypto.randomUUID();
  const { rows } = await db().query<{ created_at: Date; root: string | null }>(
    `INSERT INTO lesson_comments (id, topic_id, author_id, parent_id, body)
     VALUES ($1, $2, $3, (SELECT coalesce(p.parent_id, p.id) FROM lesson_comments p WHERE p.id = $4), $5)
     RETURNING created_at, parent_id AS root`, [id, topicId, authorId, parent, body]);
  const mine = await db().query<{ author: string; is_teacher: boolean }>(
    `SELECT coalesce(u.display_name, u.login, u.email) AS author,
       EXISTS (SELECT 1 FROM memberships m JOIN topics t ON t.id = $2 JOIN courses co ON co.id = t.course_id
               WHERE m.user_id = u.id AND m.org_id = co.org_id AND m.role IN ('teacher', 'org_admin')) AS is_teacher
     FROM users u WHERE u.id = $1`, [authorId, topicId]);
  return {
    id, authorId, author: mine.rows[0]?.author ?? '', role: mine.rows[0]?.is_teacher ? 'teacher' : 'student',
    body, createdAt: rows[0].created_at.toISOString(), parentId: rows[0].root, deleted: false,
  };
}

/** Своё сообщение удаляет автор, чужое — учитель курса. Текст стирается, ветка остаётся. */
export async function deleteComment(id: string, userId: string, isTeacher: boolean): Promise<void> {
  const { rowCount } = await db().query(
    `UPDATE lesson_comments SET deleted_at = now(), body = '' WHERE id = $1 AND deleted_at IS NULL AND ($3 OR author_id = $2)`,
    [id, userId, isTeacher]);
  if (!rowCount) throw new LmsError('Сообщение не найдено или его нельзя удалить.');
}
