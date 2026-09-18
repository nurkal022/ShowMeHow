import { db } from '../db/client';
import { dailyCounts } from '../cabinet/daily';
import { assignmentTitle } from './block-schema';

/**
 * Сводка для главной «Преподавания». Область — курсы организации: учителю свои
 * (ownerId), админу организации — все (ownerId = null), как в listStaffCourses.
 */

export interface PendingBlock {
  courseId: string; courseTitle: string; blockId: string; topicTitle: string; title: string; pending: number;
}

export interface CourseProgressStat { students: number; topics: number; views: number; graded: number; submitted: number }

export interface TeachDashboard {
  students: number;
  pending: number;
  /** Средний балл проверенных работ в процентах от максимума; null — проверенных нет. */
  averagePercent: number | null;
  gradedTotal: number;
  chart: { days: string[]; submitted: number[]; graded: number[] };
  pendingBlocks: PendingBlock[];
  /** По id курса: сколько учеников видят курс и сколько тем они открыли. */
  progress: Record<string, CourseProgressStat>;
}

/** Условие области; номера параметров разные: у dailyCounts $1 занят числом дней. */
function scopeSql(org: number, owner: number): string {
  return `c.org_id = $${org} AND ($${owner}::uuid IS NULL OR c.owner_id = $${owner}::uuid) AND c.status <> 'archived'`;
}
const SCOPE = scopeSql(1, 2);
const DAILY_SCOPE = scopeSql(2, 3);
const SUBMISSIONS = `submissions s JOIN blocks b ON b.id = s.block_id
  JOIN topics t ON t.id = b.topic_id JOIN courses c ON c.id = t.course_id`;

export async function teachDashboard(
  orgId: string, ownerId: string | null, groupIds: string[],
): Promise<TeachDashboard> {
  const scope = [orgId, ownerId];
  const [totals, submitted, graded, pendingBlocks, progress] = await Promise.all([
    db().query<{ students: number; pending: number; avg: string | null; graded: number }>(
      `SELECT
         (SELECT count(DISTINCT gm.user_id)::int FROM group_members gm
           WHERE gm.group_id = ANY($3::uuid[])
              OR gm.group_id IN (SELECT cg.group_id FROM course_groups cg JOIN courses c ON c.id = cg.course_id
                                 WHERE ${SCOPE})) AS students,
         (SELECT count(*)::int FROM ${SUBMISSIONS} WHERE ${SCOPE} AND s.status = 'submitted') AS pending,
         (SELECT count(*)::int FROM ${SUBMISSIONS} WHERE ${SCOPE} AND s.status = 'graded') AS graded,
         (SELECT avg(s.score / nullif((b.payload->>'points')::numeric, 0)) * 100 FROM ${SUBMISSIONS}
           WHERE ${SCOPE} AND s.status = 'graded' AND s.score IS NOT NULL) AS avg`,
      [...scope, groupIds]),
    dailyCounts({ from: SUBMISSIONS, at: 's.submitted_at', where: `${DAILY_SCOPE} AND s.submitted_at IS NOT NULL`, params: [orgId, ownerId] }, 30),
    dailyCounts({ from: SUBMISSIONS, at: 's.graded_at', where: `${DAILY_SCOPE} AND s.graded_at IS NOT NULL`, params: [orgId, ownerId] }, 30),
    db().query<{ course_id: string; course_title: string; block_id: string; topic_title: string; prompt: string | null; pending: number }>(
      `SELECT c.id AS course_id, c.title AS course_title, b.id AS block_id, t.title AS topic_title,
         b.payload->>'prompt' AS prompt, count(*)::int AS pending
       FROM ${SUBMISSIONS}
       WHERE ${SCOPE} AND s.status = 'submitted'
       GROUP BY c.id, c.title, b.id, t.title, t.position, b.position
       ORDER BY count(*) DESC, c.title, t.position, b.position LIMIT 50`, scope),
    db().query<{ id: string; students: number; topics: number; views: number; graded: number; submitted: number }>(
      `SELECT c.id,
         (SELECT count(DISTINCT gm.user_id)::int FROM course_groups cg JOIN group_members gm ON gm.group_id = cg.group_id
           WHERE cg.course_id = c.id) AS students,
         (SELECT count(*)::int FROM topics t WHERE t.course_id = c.id) AS topics,
         (SELECT count(*)::int FROM topic_views v JOIN topics t ON t.id = v.topic_id
           WHERE t.course_id = c.id AND v.user_id IN (
             SELECT gm.user_id FROM course_groups cg JOIN group_members gm ON gm.group_id = cg.group_id
             WHERE cg.course_id = c.id)) AS views,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           WHERE t.course_id = c.id AND s.status = 'graded') AS graded,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           WHERE t.course_id = c.id AND s.status = 'submitted') AS submitted
       FROM courses c WHERE ${SCOPE}`, scope),
  ]);
  const t = totals.rows[0];
  return {
    students: t.students,
    pending: t.pending,
    gradedTotal: t.graded,
    averagePercent: t.avg === null ? null : Math.round(Number(t.avg)),
    chart: { days: submitted.days, submitted: submitted.values, graded: graded.values },
    pendingBlocks: pendingBlocks.rows.map((r) => ({
      courseId: r.course_id, courseTitle: r.course_title, blockId: r.block_id, topicTitle: r.topic_title,
      title: assignmentTitle(r.prompt ?? '') || 'Задание', pending: r.pending,
    })),
    progress: Object.fromEntries(progress.rows.map((r) => [r.id, {
      students: r.students, topics: r.topics, views: r.views, graded: r.graded, submitted: r.submitted,
    }])),
  };
}

/** Доля открытых тем: просмотры / (ученики × темы), в процентах. */
export function progressPercent(p: CourseProgressStat | undefined): number {
  if (!p || p.students === 0 || p.topics === 0) return 0;
  return Math.min(100, Math.round((p.views / (p.students * p.topics)) * 100));
}
