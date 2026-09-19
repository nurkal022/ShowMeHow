import { db } from '../db/client';
import { assignmentTitle, bodyFromRow } from './block-schema';
import { VISIBLE_TO_STUDENT } from './courses';

/**
 * «Сегодня» ученика: где остановился, что сдать и к какому сроку, что проверили недавно.
 * Только опубликованные курсы, открытые его группам; ключей ответов здесь нет.
 */

export interface ContinueItem { topicId: string; topicTitle: string; courseTitle: string; left: number }
export interface DueItem { topicId: string; topicTitle: string; courseTitle: string; dueAt: string; left: number }
export interface ResultItem {
  topicId: string; blockId: string; courseTitle: string; task: string;
  status: 'graded' | 'returned'; score: number | null; points: number; comment: string | null; at: string;
}
export interface Today { continueAt: ContinueItem | null; due: DueItem[]; results: ResultItem[]; doneThisWeek: number }

const POINTS = `CASE WHEN b.payload->>'points' ~ '^[0-9]+$' THEN (b.payload->>'points')::int ELSE 0 END`;

export async function studentToday(userId: string): Promise<Today> {
  const [cont, due, results, week] = await Promise.all([
    db().query<{ topic_id: string; topic: string; course: string; left: number }>(
      `SELECT t.id AS topic_id, t.title AS topic, c.title AS course,
         (SELECT count(*)::int FROM blocks b LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = $1
          WHERE b.topic_id = t.id AND b.kind = 'assignment' AND (s.id IS NULL OR s.status IN ('draft', 'returned'))) AS left
       FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id
       WHERE v.user_id = $1 AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
       ORDER BY v.last_at DESC LIMIT 1`, [userId]),
    db().query<{ topic_id: string; topic: string; course: string; due_at: Date; left: number }>(
      `SELECT t.id AS topic_id, t.title AS topic, c.title AS course, t.due_at,
         count(b.id) FILTER (WHERE s.id IS NULL OR s.status IN ('draft', 'returned'))::int AS left
       FROM topics t JOIN courses c ON c.id = t.course_id
       JOIN blocks b ON b.topic_id = t.id AND b.kind = 'assignment'
       LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = $1
       WHERE t.due_at IS NOT NULL AND t.due_at > now() - interval '7 days'
         AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
       GROUP BY t.id, t.title, c.title, t.due_at
       HAVING count(b.id) FILTER (WHERE s.id IS NULL OR s.status IN ('draft', 'returned')) > 0
       ORDER BY t.due_at LIMIT 6`, [userId]),
    db().query<{
      topic_id: string; block_id: string; course: string; payload: unknown; status: 'graded' | 'returned';
      score: string | null; points: number; comment: string | null; at: Date;
    }>(
      `SELECT t.id AS topic_id, b.id AS block_id, c.title AS course, b.payload, s.status, s.score, ${POINTS} AS points,
         s.comment, coalesce(s.graded_at, s.updated_at) AS at
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id JOIN courses c ON c.id = t.course_id
       WHERE s.student_id = $1 AND s.status IN ('graded', 'returned') AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
       ORDER BY coalesce(s.graded_at, s.updated_at) DESC LIMIT 5`, [userId]),
    db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM submissions WHERE student_id = $1 AND status IN ('submitted', 'graded')
         AND submitted_at > now() - interval '7 days'`, [userId]),
  ]);
  const c = cont.rows[0];
  return {
    continueAt: c ? { topicId: c.topic_id, topicTitle: c.topic, courseTitle: c.course, left: c.left } : null,
    due: due.rows.map((r) => ({ topicId: r.topic_id, topicTitle: r.topic, courseTitle: r.course, dueAt: r.due_at.toISOString(), left: r.left })),
    results: results.rows.map((r) => {
      const body = bodyFromRow('assignment', r.payload);
      return {
        topicId: r.topic_id, blockId: r.block_id, courseTitle: r.course,
        task: body.kind === 'assignment' ? assignmentTitle(body.payload.prompt) : 'Задание',
        status: r.status, score: r.score === null ? null : Number(r.score), points: r.points, comment: r.comment, at: r.at.toISOString(),
      };
    }),
    doneThisWeek: week.rows[0].n,
  };
}
