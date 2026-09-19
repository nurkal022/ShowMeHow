import { db } from '../db/client';
import { isUuid } from '../org/access';
import { assignmentTitle, bodyFromRow, ASSIGNMENT_TYPE_LABELS } from './block-schema';
import { courseStudents } from './courses';

/**
 * Аналитика курса для учителя: какие задания даются трудно, где ученики бросают,
 * кому нужна помощь. Считается по тем, кому курс открыт сейчас.
 */

export interface TaskStat {
  blockId: string; topicId: string; topicTitle: string; title: string; typeLabel: string;
  points: number; answered: number; avgPercent: number | null; fullShare: number | null; pending: number;
}
export interface TopicFunnel { topicId: string; title: string; opened: number; started: number; finished: number }
export interface RiskStudent { id: string; name: string; groups: string[]; avgPercent: number | null; lastActive: string | null; reason: string }
export interface CourseAnalytics { students: number; tasks: TaskStat[]; funnel: TopicFunnel[]; risk: RiskStudent[] }

const POINTS = `CASE WHEN b.payload->>'points' ~ '^[0-9]+$' THEN (b.payload->>'points')::int ELSE 0 END`;

export async function courseAnalytics(courseId: string): Promise<CourseAnalytics> {
  const students = await courseStudents(courseId);
  const ids = students.map((s) => s.id);
  const [tasks, funnel, perStudent] = await Promise.all([
    db().query<{
      id: string; topic_id: string; topic: string; payload: unknown; points: number;
      answered: number; avg: string | null; full: number; graded: number; pending: number;
    }>(
      `SELECT b.id, t.id AS topic_id, t.title AS topic, b.payload, ${POINTS} AS points,
         count(s.id) FILTER (WHERE s.status IN ('submitted', 'graded'))::int AS answered,
         avg(s.score / NULLIF(${POINTS}, 0)) FILTER (WHERE s.status = 'graded') AS avg,
         count(s.id) FILTER (WHERE s.status = 'graded' AND s.score >= ${POINTS})::int AS full,
         count(s.id) FILTER (WHERE s.status = 'graded')::int AS graded,
         count(s.id) FILTER (WHERE s.status = 'submitted')::int AS pending
       FROM blocks b JOIN topics t ON t.id = b.topic_id
       LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = ANY($2::uuid[])
       WHERE t.course_id = $1 AND b.kind = 'assignment'
       GROUP BY b.id, t.id, t.title, t.position, b.position, b.payload
       ORDER BY t.position, b.position`, [courseId, ids]),
    db().query<{ id: string; title: string; opened: number; started: number; finished: number }>(
      `SELECT t.id, t.title,
         (SELECT count(*)::int FROM topic_views v WHERE v.topic_id = t.id AND v.user_id = ANY($2::uuid[])) AS opened,
         (SELECT count(DISTINCT s.student_id)::int FROM submissions s JOIN blocks b ON b.id = s.block_id
            WHERE b.topic_id = t.id AND s.student_id = ANY($2::uuid[]) AND s.status IN ('submitted', 'graded')) AS started,
         (SELECT count(*)::int FROM unnest($2::uuid[]) u(id) WHERE NOT EXISTS (
            SELECT 1 FROM blocks b LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = u.id
            WHERE b.topic_id = t.id AND b.kind = 'assignment' AND (s.id IS NULL OR s.status IN ('draft', 'returned')))
            AND EXISTS (SELECT 1 FROM blocks b WHERE b.topic_id = t.id AND b.kind = 'assignment')) AS finished
       FROM topics t WHERE t.course_id = $1 ORDER BY t.position`, [courseId, ids]),
    db().query<{ id: string; avg: string | null; last: Date | null; returned: number }>(
      `SELECT u.id,
         (SELECT avg(s.score / NULLIF(${POINTS}, 0)) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            WHERE s.student_id = u.id AND t.course_id = $1 AND s.status = 'graded') AS avg,
         greatest(
           (SELECT max(v.last_at) FROM topic_views v JOIN topics t ON t.id = v.topic_id WHERE v.user_id = u.id AND t.course_id = $1),
           (SELECT max(s.updated_at) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
              WHERE s.student_id = u.id AND t.course_id = $1)) AS last,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            WHERE s.student_id = u.id AND t.course_id = $1 AND s.status = 'returned') AS returned
       FROM unnest($2::uuid[]) u(id)`, [courseId, ids]),
  ]);

  const byId = new Map(students.map((s) => [s.id, s]));
  const week = Date.now() - 7 * 86_400_000;
  const risk: RiskStudent[] = [];
  for (const r of perStudent.rows) {
    const s = byId.get(r.id);
    if (!s) continue;
    const avg = r.avg === null ? null : Math.round(Number(r.avg) * 100);
    const last = r.last?.getTime() ?? null;
    const reasons: string[] = [];
    if (last === null) reasons.push('ни разу не открывал курс');
    else if (last < week) reasons.push(`не заходил ${Math.round((Date.now() - last) / 86_400_000)} дн.`);
    if (avg !== null && avg < 55) reasons.push(`средний балл ${avg}%`);
    if (r.returned > 0) reasons.push(`на доработке: ${r.returned}`);
    if (reasons.length) risk.push({ id: s.id, name: s.name, groups: s.groups, avgPercent: avg, lastActive: r.last?.toISOString() ?? null, reason: reasons.join(' · ') });
  }
  risk.sort((a, b) => (a.lastActive ?? '') < (b.lastActive ?? '') ? -1 : 1);

  return {
    students: students.length,
    tasks: tasks.rows.map((r) => {
      const body = bodyFromRow('assignment', r.payload);
      const p = body.kind === 'assignment' ? body.payload : null;
      return {
        blockId: r.id, topicId: r.topic_id, topicTitle: r.topic, title: p ? assignmentTitle(p.prompt) : 'Задание',
        typeLabel: p ? ASSIGNMENT_TYPE_LABELS[p.spec.type] : '', points: r.points, answered: r.answered,
        avgPercent: r.avg === null ? null : Math.round(Number(r.avg) * 100),
        fullShare: r.graded ? Math.round((r.full / r.graded) * 100) : null, pending: r.pending,
      };
    }),
    funnel: funnel.rows.map((r) => ({ topicId: r.id, title: r.title, opened: r.opened, started: r.started, finished: r.finished })),
    risk,
  };
}

export interface StudentAnswerRow {
  blockId: string; topicId: string; topicTitle: string; title: string; typeLabel: string; points: number;
  status: 'none' | 'draft' | 'submitted' | 'graded' | 'returned'; score: number | null; comment: string | null; at: string | null;
}
export interface StudentCard {
  id: string; name: string; login: string | null; groups: string[];
  avgPercent: number | null; earned: number; max: number; done: number; total: number; lastActive: string | null;
  answers: StudentAnswerRow[];
}

/** Карточка ученика в курсе: все задания по порядку, его статус, балл и комментарий. */
export async function studentCard(courseId: string, studentId: string): Promise<StudentCard | null> {
  if (!isUuid(studentId)) return null;
  const student = (await courseStudents(courseId)).find((s) => s.id === studentId);
  if (!student) return null;
  const [user, rows, last] = await Promise.all([
    db().query<{ login: string | null }>('SELECT login FROM users WHERE id = $1', [studentId]),
    db().query<{
      id: string; topic_id: string; topic: string; payload: unknown; points: number;
      status: StudentAnswerRow['status'] | null; score: string | null; comment: string | null; at: Date | null;
    }>(
      `SELECT b.id, t.id AS topic_id, t.title AS topic, b.payload, ${POINTS} AS points, s.status, s.score, s.comment,
         coalesce(s.submitted_at, s.updated_at) AS at
       FROM blocks b JOIN topics t ON t.id = b.topic_id
       LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = $2
       WHERE t.course_id = $1 AND b.kind = 'assignment' ORDER BY t.position, b.position`, [courseId, studentId]),
    db().query<{ last: Date | null }>(
      `SELECT max(v.last_at) AS last FROM topic_views v JOIN topics t ON t.id = v.topic_id WHERE v.user_id = $2 AND t.course_id = $1`,
      [courseId, studentId]),
  ]);
  const answers = rows.rows.map((r): StudentAnswerRow => {
    const body = bodyFromRow('assignment', r.payload);
    const p = body.kind === 'assignment' ? body.payload : null;
    return {
      blockId: r.id, topicId: r.topic_id, topicTitle: r.topic, title: p ? assignmentTitle(p.prompt) : 'Задание',
      typeLabel: p ? ASSIGNMENT_TYPE_LABELS[p.spec.type] : '', points: r.points, status: r.status ?? 'none',
      score: r.score === null ? null : Number(r.score), comment: r.comment, at: r.at?.toISOString() ?? null,
    };
  });
  const graded = answers.filter((a) => a.status === 'graded');
  const earned = graded.reduce((a, r) => a + (r.score ?? 0), 0);
  const gradedMax = graded.reduce((a, r) => a + r.points, 0);
  return {
    id: student.id, name: student.name, login: user.rows[0]?.login ?? null, groups: student.groups,
    avgPercent: gradedMax ? Math.round((earned / gradedMax) * 100) : null, earned,
    max: answers.reduce((a, r) => a + r.points, 0),
    done: answers.filter((a) => a.status === 'submitted' || a.status === 'graded').length, total: answers.length,
    lastActive: last.rows[0]?.last?.toISOString() ?? null, answers,
  };
}
