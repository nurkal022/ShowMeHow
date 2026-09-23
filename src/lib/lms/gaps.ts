import { db } from '../db/client';
import { assignmentTitle } from './block-schema';
import { VISIBLE_TO_STUDENT } from './courses';

/**
 * Слабые места ученика: задания, где он не набрал и половины с небольшим, и те,
 * что учитель вернул на доработку. Считается по submissions на лету — отдельного
 * хранилища нет, иначе пришлось бы пересчитывать его после каждой проверки.
 */

/** Ниже этой доли баллов задание считается проваленным. */
export const GAP_THRESHOLD = 0.6;

export interface Gap {
  blockId: string;
  topicId: string;
  topicTitle: string;
  courseId: string;
  courseTitle: string;
  subject: string;
  /** Короткое название задания — из его формулировки. */
  title: string;
  prompt: string;
  points: number;
  /** null — работа возвращена на доработку, балла ещё нет. */
  score: number | null;
  percent: number | null;
  at: string;
  /** Сколько всего заданий в теме: нужно только для сводки по темам, отдельным запросом за ним не ходим. */
  topicTotal: number;
}

export interface TopicGap {
  topicId: string;
  topicTitle: string;
  courseTitle: string;
  failed: number;
  total: number;
}

interface GapRow {
  block_id: string; payload: { prompt?: string; points?: number } | null;
  topic_id: string; topic: string; course_id: string; course: string; subject: string;
  score: string | null; at: Date; topic_total: number;
}

export async function listGaps(userId: string): Promise<Gap[]> {
  const { rows } = await db().query<GapRow>(
    `SELECT b.id AS block_id, b.payload, t.id AS topic_id, t.title AS topic,
       c.id AS course_id, c.title AS course, c.subject,
       coalesce(s.score, s.auto_score) AS score,
       coalesce(s.graded_at, s.submitted_at, s.updated_at) AS at,
       (SELECT count(*)::int FROM blocks b2 WHERE b2.topic_id = t.id AND b2.kind = 'assignment') AS topic_total
     FROM submissions s
     JOIN blocks b ON b.id = s.block_id AND b.kind = 'assignment'
     JOIN topics t ON t.id = b.topic_id
     JOIN courses c ON c.id = t.course_id
     WHERE s.student_id = $1 AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
       AND (s.status = 'returned'
         -- Проверка на число обязательна: payload приходит из jsonb, и битое
         -- значение баллов уронило бы весь запрос, а не одно задание.
         OR (s.status = 'graded' AND (b.payload->>'points') ~ '^[0-9]+(\.[0-9]+)?$'
           AND (b.payload->>'points')::numeric > 0
           AND coalesce(s.score, s.auto_score, 0) < (b.payload->>'points')::numeric * ${GAP_THRESHOLD}))
     ORDER BY coalesce(s.graded_at, s.submitted_at, s.updated_at) DESC`, [userId]);
  return rows.map((r) => {
    const prompt = r.payload?.prompt ?? '';
    const points = Number(r.payload?.points ?? 0);
    const score = r.score === null ? null : Number(r.score);
    return {
      blockId: r.block_id, topicId: r.topic_id, topicTitle: r.topic, courseId: r.course_id,
      courseTitle: r.course, subject: r.subject, title: assignmentTitle(prompt) || 'Задание', prompt, points, score,
      percent: score !== null && points > 0 ? Math.round((score / points) * 100) : null,
      at: r.at.toISOString(), topicTotal: r.topic_total,
    };
  });
}

/**
 * Темы, где провалено не одно задание: с них полезнее начинать разбор, чем
 * со случайной ошибки. Порядок — от самых проблемных. Функция чистая.
 */
export function topicGaps(gaps: Gap[]): TopicGap[] {
  const byTopic = new Map<string, TopicGap>();
  for (const g of gaps) {
    const found = byTopic.get(g.topicId);
    if (found) found.failed += 1;
    else byTopic.set(g.topicId, { topicId: g.topicId, topicTitle: g.topicTitle, courseTitle: g.courseTitle, failed: 1, total: g.topicTotal });
  }
  return [...byTopic.values()].filter((t) => t.failed > 1).sort((a, b) => b.failed - a.failed);
}
