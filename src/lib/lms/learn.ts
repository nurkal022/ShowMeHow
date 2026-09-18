import { db } from '../db/client';

/** Только чтение для кабинета ученика: прогресс по темам и подписи карточек. Ключи ответов сюда не попадают. */

export type TopicState = 'none' | 'progress' | 'done';
export const TOPIC_STATE_LABELS: Record<TopicState, string> = {
  none: 'не начато',
  progress: 'в процессе',
  done: 'пройдено',
};

export interface TopicProgress {
  topicId: string;
  title: string;
  viewed: boolean;
  blocksTotal: number;
  assignmentsTotal: number;
  /** Сдано или проверено. */
  assignmentsDone: number;
  assignmentsReturned: number;
  pointsEarned: number;
  pointsMax: number;
  state: TopicState;
}

const POINTS = `CASE WHEN b.payload->>'points' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (b.payload->>'points')::numeric ELSE 0 END`;

/** Темы курса по порядку с состоянием ученика. Права проверяет вызывающий (learnerCourse). */
export async function listTopicProgress(courseId: string, userId: string): Promise<TopicProgress[]> {
  const { rows } = await db().query<{
    id: string; title: string; viewed: boolean; blocks_total: number; a_total: number; a_done: number;
    a_returned: number; a_touched: number; earned: string | null; max: string | null;
  }>(
    `SELECT t.id, t.title,
       EXISTS (SELECT 1 FROM topic_views v WHERE v.topic_id = t.id AND v.user_id = $2) AS viewed,
       count(b.id)::int AS blocks_total,
       count(b.id) FILTER (WHERE b.kind = 'assignment')::int AS a_total,
       count(s.id) FILTER (WHERE s.status IN ('submitted', 'graded'))::int AS a_done,
       count(s.id) FILTER (WHERE s.status = 'returned')::int AS a_returned,
       count(s.id)::int AS a_touched,
       sum(s.score) FILTER (WHERE s.status = 'graded') AS earned,
       sum(${POINTS}) FILTER (WHERE b.kind = 'assignment') AS max
     FROM topics t
     LEFT JOIN blocks b ON b.topic_id = t.id
     LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = $2 AND b.kind = 'assignment'
     WHERE t.course_id = $1
     GROUP BY t.id, t.title, t.position
     ORDER BY t.position, t.id`, [courseId, userId]);
  return rows.map((r) => {
    const done = r.viewed && r.a_done >= r.a_total;
    const state: TopicState = done ? 'done' : (r.viewed || r.a_touched > 0) ? 'progress' : 'none';
    return {
      topicId: r.id, title: r.title, viewed: r.viewed, blocksTotal: r.blocks_total,
      assignmentsTotal: r.a_total, assignmentsDone: r.a_done, assignmentsReturned: r.a_returned,
      pointsEarned: Number(r.earned ?? 0), pointsMax: Number(r.max ?? 0), state,
    };
  });
}

/** Первая незавершённая тема — куда ведёт «Продолжить». null — курс пройден или пуст. */
export function continueTopicId(topics: TopicProgress[]): string | null {
  return topics.find((t) => t.state !== 'done')?.topicId ?? null;
}

export interface ProgressTotals {
  topicsTotal: number; topicsDone: number; topicsViewed: number;
  assignmentsTotal: number; assignmentsDone: number; pointsEarned: number; pointsMax: number;
}

export function progressTotals(topics: TopicProgress[]): ProgressTotals {
  const sum = (f: (t: TopicProgress) => number) => topics.reduce((a, t) => a + f(t), 0);
  return {
    topicsTotal: topics.length,
    topicsDone: sum((t) => (t.state === 'done' ? 1 : 0)),
    topicsViewed: sum((t) => (t.viewed ? 1 : 0)),
    assignmentsTotal: sum((t) => t.assignmentsTotal),
    assignmentsDone: sum((t) => t.assignmentsDone),
    pointsEarned: sum((t) => t.pointsEarned),
    pointsMax: sum((t) => t.pointsMax),
  };
}

/** Имена учителей (владельцев) курсов: id курса → подпись. */
export async function courseTeacherNames(courseIds: string[]): Promise<Map<string, string>> {
  if (courseIds.length === 0) return new Map();
  const { rows } = await db().query<{ id: string; name: string | null }>(
    `SELECT c.id, coalesce(u.display_name, u.login) AS name
     FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.id = ANY($1::uuid[])`, [courseIds]);
  return new Map(rows.flatMap((r) => (r.name ? [[r.id, r.name] as [string, string]] : [])));
}
