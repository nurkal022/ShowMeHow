import { db } from '../db/client';
import { VISIBLE_TO_STUDENT } from './courses';

/**
 * Лента обучения ученика: где он был недавно и как идёт курс в целом.
 * Всё считается по открытым шагам (block_views) и сданным работам — отдельного хранилища нет.
 */

export interface RecentTopic {
  topicId: string;
  topicTitle: string;
  courseId: string;
  courseTitle: string;
  subject: string;
  /** Открытых шагов из общего числа блоков темы. */
  seen: number;
  total: number;
  at: string;
}

export async function recentTopics(userId: string, limit = 6): Promise<RecentTopic[]> {
  const { rows } = await db().query<{
    topic_id: string; topic: string; course_id: string; course: string; subject: string;
    seen: number; total: number; at: Date;
  }>(
    `SELECT t.id AS topic_id, t.title AS topic, c.id AS course_id, c.title AS course, c.subject,
       count(*)::int AS seen,
       (SELECT count(*)::int FROM blocks b2 WHERE b2.topic_id = t.id) AS total,
       max(v.last_at) AS at
     FROM block_views v
     JOIN blocks b ON b.id = v.block_id
     JOIN topics t ON t.id = b.topic_id
     JOIN courses c ON c.id = t.course_id
     WHERE v.user_id = $1 AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
     GROUP BY t.id, t.title, c.id, c.title, c.subject
     ORDER BY max(v.last_at) DESC
     LIMIT $2`, [userId, limit]);
  return rows.map((r) => ({
    topicId: r.topic_id, topicTitle: r.topic, courseId: r.course_id, courseTitle: r.course,
    subject: r.subject, seen: r.seen, total: r.total, at: r.at.toISOString(),
  }));
}

export interface StudentStats {
  /** Дней с занятиями за всё время. */
  activeDays: number;
  /** Сдано работ. */
  submitted: number;
  /** Проверено с полным баллом. */
  full: number;
  pointsEarned: number;
  pointsMax: number;
  stepsSeen: number;
  since: string | null;
}

export async function studentStats(userId: string): Promise<StudentStats> {
  const { rows } = await db().query<{
    active_days: number; submitted: number; full: number; earned: string | null; max: string | null;
    steps: number; since: Date | null;
  }>(
    `SELECT
       (SELECT count(DISTINCT date_trunc('day', at))::int FROM (
          SELECT submitted_at AS at FROM submissions WHERE student_id = $1 AND submitted_at IS NOT NULL
          UNION ALL SELECT last_at FROM block_views WHERE user_id = $1) d) AS active_days,
       (SELECT count(*)::int FROM submissions WHERE student_id = $1 AND status IN ('submitted', 'graded')) AS submitted,
       (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id
          WHERE s.student_id = $1 AND s.status = 'graded' AND (b.payload->>'points') ~ '^[0-9]+$'
            AND s.score >= (b.payload->>'points')::numeric AND (b.payload->>'points')::numeric > 0) AS full,
       (SELECT coalesce(sum(s.score), 0) FROM submissions s WHERE s.student_id = $1 AND s.status = 'graded') AS earned,
       (SELECT coalesce(sum(CASE WHEN (b.payload->>'points') ~ '^[0-9]+$' THEN (b.payload->>'points')::numeric ELSE 0 END), 0)
          FROM submissions s JOIN blocks b ON b.id = s.block_id WHERE s.student_id = $1 AND s.status = 'graded') AS max,
       (SELECT count(*)::int FROM block_views WHERE user_id = $1) AS steps,
       (SELECT min(at) FROM (
          SELECT min(submitted_at) AS at FROM submissions WHERE student_id = $1
          UNION ALL SELECT min(first_at) FROM block_views WHERE user_id = $1
          UNION ALL SELECT min(first_at) FROM topic_views WHERE user_id = $1) f) AS since`, [userId]);
  const r = rows[0];
  return {
    activeDays: r.active_days, submitted: r.submitted, full: r.full,
    pointsEarned: Number(r.earned ?? 0), pointsMax: Number(r.max ?? 0),
    stepsSeen: r.steps, since: r.since ? r.since.toISOString() : null,
  };
}

export interface StudentPlace { org: string; groups: string[] }

/** Где ученик учится: организация и его классы — для шапки профиля. */
export async function studentPlaces(userId: string): Promise<StudentPlace[]> {
  const { rows } = await db().query<{ org: string; groups: string[] }>(
    `SELECT o.name AS org,
       ARRAY(SELECT g.title FROM group_members gm JOIN groups g ON g.id = gm.group_id
             WHERE gm.user_id = $1 AND g.org_id = o.id AND g.archived_at IS NULL ORDER BY g.title) AS groups
     FROM memberships m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = $1 AND m.role = 'student' AND o.archived_at IS NULL
     ORDER BY o.name`, [userId]);
  return rows.map((r) => ({ org: r.org, groups: r.groups }));
}

export interface ActivityDay { date: string; count: number }

/**
 * Активность по дням: сданные работы и открытые шаги. Нужна для сетки на главной
 * ученика; дни считаются по времени Алматы, чтобы «сегодня» совпадало с ощущением.
 */
export async function activityDays(userId: string, days = 84): Promise<ActivityDay[]> {
  const { rows } = await db().query<{ d: string; n: number }>(
    `SELECT to_char(at AT TIME ZONE 'Asia/Almaty', 'YYYY-MM-DD') AS d, count(*)::int AS n FROM (
       SELECT submitted_at AS at FROM submissions WHERE student_id = $1 AND submitted_at IS NOT NULL
       UNION ALL SELECT last_at FROM block_views WHERE user_id = $1
       UNION ALL SELECT last_at FROM topic_views WHERE user_id = $1) x
     WHERE at > now() - ($2 || ' days')::interval AND at <= now()
     GROUP BY 1 ORDER BY 1`, [userId, days]);
  return rows.map((r) => ({ date: r.d, count: r.n }));
}

export interface WeekPulse { submitted: number; steps: number; points: number }

/** Неделя ученика в трёх числах — строка под карточкой «Продолжить». */
export async function weekPulse(userId: string): Promise<WeekPulse> {
  const { rows } = await db().query<{ submitted: number; steps: number; points: string | null }>(
    `SELECT
       (SELECT count(*)::int FROM submissions WHERE student_id = $1 AND status IN ('submitted', 'graded')
          AND submitted_at > now() - interval '7 days') AS submitted,
       (SELECT count(*)::int FROM block_views WHERE user_id = $1 AND last_at > now() - interval '7 days') AS steps,
       (SELECT coalesce(sum(score), 0) FROM submissions WHERE student_id = $1 AND status = 'graded'
          AND coalesce(graded_at, updated_at) > now() - interval '7 days') AS points`, [userId]);
  const r = rows[0];
  return { submitted: r.submitted, steps: r.steps, points: Number(r.points ?? 0) };
}
