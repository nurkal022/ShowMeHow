import { db } from '../db/client';
import { lastDays } from '../cabinet/daily';
import { assignmentTitle } from './block-schema';

/**
 * Данные новых страниц «Преподавания»: «Сегодня», группы учителя и общая очередь
 * проверки. Область — как у teachDashboard: курсы организации (учителю — свои,
 * админу — все, ownerId = null) и ученики его групп и этих курсов.
 */

const COURSE_SCOPE = `c.org_id = $1 AND ($2::uuid IS NULL OR c.owner_id = $2::uuid) AND c.status <> 'archived'`;
const POINTS = `NULLIF(CASE WHEN b.payload->>'points' ~ '^[0-9]+$' THEN (b.payload->>'points')::int ELSE 0 END, 0)`;
/** Ученики области: $3 — группы учителя. */
const SCOPE_STUDENTS = `SELECT DISTINCT gm.user_id AS id FROM group_members gm
  JOIN groups g ON g.id = gm.group_id AND g.archived_at IS NULL
  JOIN memberships m ON m.user_id = gm.user_id AND m.org_id = g.org_id AND m.role = 'student'
  WHERE gm.group_id = ANY($3::uuid[]) OR gm.group_id IN (
    SELECT cg.group_id FROM course_groups cg JOIN courses c ON c.id = cg.course_id WHERE ${COURSE_SCOPE})`;
const NAME = 'coalesce(u.display_name, u.login, u.email)';
const DAY = 86_400_000;

/* --------------------------------- лента --------------------------------- */

export type FeedKind = 'submitted' | 'graded' | 'returned' | 'opened';

export interface FeedItem {
  kind: FeedKind; at: string; who: string; what: string; where: string; href: string;
}

export async function teachFeed(orgId: string, ownerId: string | null, limit = 8): Promise<FeedItem[]> {
  const { rows } = await db().query<{
    kind: FeedKind; at: Date; who: string; prompt: string | null; topic: string; course: string;
    course_id: string; block_id: string | null; sid: string | null;
  }>(
    `SELECT * FROM (
       SELECT 'submitted' AS kind, s.submitted_at AS at, ${NAME} AS who, b.payload->>'prompt' AS prompt,
         t.title AS topic, c.title AS course, c.id AS course_id, b.id AS block_id, s.id AS sid
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
       JOIN courses c ON c.id = t.course_id JOIN users u ON u.id = s.student_id
       WHERE ${COURSE_SCOPE} AND s.submitted_at IS NOT NULL AND s.status <> 'draft'
       UNION ALL
       SELECT CASE WHEN s.status = 'returned' THEN 'returned' ELSE 'graded' END, s.graded_at, ${NAME},
         b.payload->>'prompt', t.title, c.title, c.id, b.id, s.id
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
       JOIN courses c ON c.id = t.course_id JOIN users u ON u.id = s.student_id
       WHERE ${COURSE_SCOPE} AND s.graded_at IS NOT NULL AND s.graded_by IS NOT NULL
       UNION ALL
       SELECT 'opened', v.first_at, ${NAME}, NULL, t.title, c.title, c.id, NULL, NULL
       FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id
       JOIN users u ON u.id = v.user_id
       JOIN memberships m ON m.user_id = u.id AND m.org_id = c.org_id AND m.role = 'student'
       WHERE ${COURSE_SCOPE}
     ) e WHERE at <= now() ORDER BY at DESC LIMIT $3`, [orgId, ownerId, limit]);
  return rows.map((r) => ({
    kind: r.kind, at: r.at.toISOString(), who: r.who,
    what: r.prompt !== null ? assignmentTitle(r.prompt) || 'Задание' : r.topic,
    where: r.prompt !== null ? `${r.course} · ${r.topic}` : r.course,
    href: r.block_id
      ? `/teach/courses/${r.course_id}/answers/${r.block_id}${r.sid ? `?s=${r.sid}` : ''}`
      : `/teach/courses/${r.course_id}/progress`,
  }));
}

/* ------------------------ ученики, которым нужна помощь ------------------- */

export interface AttentionStudent {
  id: string; name: string; groups: string[]; reason: string; severity: 1 | 2 | 3;
  lastActive: string | null; avgPercent: number | null;
}

interface StudentActivityRow {
  id: string; name: string; groups: string[]; must_change: boolean; last: Date | null;
  avg: string | null; returned: number; pending: number; opened: number; done: number;
}

/** Активность учеников по курсам области: последний заход, средний балл, доработки. */
async function studentActivity(orgId: string, ownerId: string | null, groupIds: string[]): Promise<StudentActivityRow[]> {
  const { rows } = await db().query<StudentActivityRow>(
    `WITH st AS (${SCOPE_STUDENTS}), sc AS (SELECT c.id FROM courses c WHERE ${COURSE_SCOPE})
     SELECT u.id, ${NAME} AS name, u.must_change_password AS must_change,
       ARRAY(SELECT g.title FROM group_members gm JOIN groups g ON g.id = gm.group_id
             WHERE gm.user_id = u.id AND g.org_id = $1 AND g.archived_at IS NULL ORDER BY g.title) AS groups,
       greatest(
         (SELECT max(v.last_at) FROM topic_views v JOIN topics t ON t.id = v.topic_id WHERE v.user_id = u.id AND t.course_id IN (SELECT id FROM sc)),
         (SELECT max(s.updated_at) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM sc))) AS last,
       (SELECT avg(s.score / ${POINTS}) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
          WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM sc) AND s.status = 'graded') AS avg,
       (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
          WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM sc) AND s.status = 'returned') AS returned,
       (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
          WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM sc) AND s.status = 'submitted') AS pending,
       (SELECT count(*)::int FROM topic_views v JOIN topics t ON t.id = v.topic_id
          WHERE v.user_id = u.id AND t.course_id IN (SELECT id FROM sc)) AS opened,
       (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
          WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM sc) AND s.status IN ('submitted', 'graded')) AS done
     FROM st JOIN users u ON u.id = st.id AND u.disabled_at IS NULL
     ORDER BY name`, [orgId, ownerId, groupIds]);
  return rows;
}

function attentionOf(r: StudentActivityRow): AttentionStudent | null {
  const avg = r.avg === null ? null : Math.round(Number(r.avg) * 100);
  const last = r.last?.getTime() ?? null;
  const reasons: string[] = [];
  let severity: 1 | 2 | 3 = 1;
  if (r.must_change && last === null) { reasons.push('ни разу не входил'); severity = 3; }
  else if (last === null) { reasons.push('не открывал уроки'); severity = 3; }
  else if (last < Date.now() - 7 * DAY) {
    reasons.push(`не заходил ${Math.round((Date.now() - last) / DAY)} дн.`);
    severity = 2;
  }
  if (avg !== null && avg < 55) { reasons.push(`средний балл ${avg}%`); severity = Math.max(severity, 2) as 2 | 3; }
  if (r.returned > 0) reasons.push(`на доработке: ${r.returned}`);
  if (!reasons.length) return null;
  return { id: r.id, name: r.name, groups: r.groups, reason: reasons.join(' · '), severity, lastActive: r.last?.toISOString() ?? null, avgPercent: avg };
}

/* ------------------------------- «Сегодня» ------------------------------- */

export interface DueTopic { topicId: string; courseId: string; title: string; course: string; dueAt: string; students: number; done: number }

export interface TeachToday {
  feed: FeedItem[];
  attention: AttentionStudent[];
  attentionTotal: number;
  /** Активность учеников за 12 недель: сдачи и открытые уроки по дням, от старого к сегодня. */
  heat: { days: string[]; values: number[] };
  due: DueTopic[];
  drafts: number;
  unassigned: number;
  activeWeek: number;
  studentsTotal: number;
}

export async function teachToday(
  orgId: string, ownerId: string | null, groupIds: string[],
): Promise<TeachToday> {
  const [feed, students, heat, due, courses] = await Promise.all([
    teachFeed(orgId, ownerId),
    studentActivity(orgId, ownerId, groupIds),
    db().query<{ day: string; n: number }>(
      `WITH ev AS (
         SELECT s.submitted_at AS at FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           JOIN courses c ON c.id = t.course_id WHERE ${COURSE_SCOPE} AND s.submitted_at IS NOT NULL
         UNION ALL
         SELECT v.first_at FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id
           JOIN memberships m ON m.user_id = v.user_id AND m.org_id = c.org_id AND m.role = 'student' WHERE ${COURSE_SCOPE}
         UNION ALL
         SELECT v.last_at FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id
           JOIN memberships m ON m.user_id = v.user_id AND m.org_id = c.org_id AND m.role = 'student'
           WHERE ${COURSE_SCOPE} AND v.last_at::date <> v.first_at::date)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(ev.at)::int AS n
       FROM generate_series(current_date - 83, current_date, interval '1 day') d(day)
       LEFT JOIN ev ON ev.at >= d.day AND ev.at < d.day + interval '1 day'
       GROUP BY d.day ORDER BY d.day`, [orgId, ownerId]),
    db().query<{ id: string; course_id: string; title: string; course: string; due_at: Date; students: number; done: number }>(
      `SELECT t.id, c.id AS course_id, t.title, c.title AS course, t.due_at,
         (SELECT count(DISTINCT gm.user_id)::int FROM course_groups cg JOIN group_members gm ON gm.group_id = cg.group_id
           WHERE cg.course_id = c.id) AS students,
         (SELECT count(DISTINCT s.student_id)::int FROM submissions s JOIN blocks b ON b.id = s.block_id
           WHERE b.topic_id = t.id AND s.status IN ('submitted', 'graded')) AS done
       FROM topics t JOIN courses c ON c.id = t.course_id
       WHERE ${COURSE_SCOPE} AND c.status = 'published'
         AND t.due_at BETWEEN now() - interval '1 day' AND now() + interval '8 days'
       ORDER BY t.due_at LIMIT 6`, [orgId, ownerId]),
    db().query<{ drafts: number; unassigned: number }>(
      `SELECT count(*) FILTER (WHERE c.status = 'draft')::int AS drafts,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM course_groups cg WHERE cg.course_id = c.id))::int AS unassigned
       FROM courses c WHERE ${COURSE_SCOPE}`, [orgId, ownerId]),
  ]);
  const attention = students.map(attentionOf).filter((a): a is AttentionStudent => a !== null)
    .sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name, 'ru'));
  const week = Date.now() - 7 * DAY;
  return {
    feed,
    attention: attention.slice(0, 7),
    attentionTotal: attention.length,
    heat: { days: heat.rows.map((r) => r.day), values: heat.rows.map((r) => r.n) },
    due: due.rows.map((r) => ({
      topicId: r.id, courseId: r.course_id, title: r.title, course: r.course, dueAt: r.due_at.toISOString(),
      students: r.students, done: r.done,
    })),
    drafts: courses.rows[0].drafts,
    unassigned: courses.rows[0].unassigned,
    activeWeek: students.filter((s) => (s.last?.getTime() ?? 0) >= week).length,
    studentsTotal: students.length,
  };
}

/* -------------------------------- группы --------------------------------- */

export interface TeachGroupCard {
  id: string; title: string; students: number; tempPasswords: number; courses: number;
  activeWeek: number; avgPercent: number | null; pending: number; teachers: string[];
  /** Активность за 14 дней: сдачи и открытые уроки. */
  spark: number[];
}

export async function teachGroups(orgId: string, groupIds: string[]): Promise<TeachGroupCard[]> {
  if (groupIds.length === 0) return [];
  const [groups, events] = await Promise.all([
    db().query<{
      id: string; title: string; students: number; temp: number; courses: number; active: number;
      avg: string | null; pending: number; teachers: string[];
    }>(
      `SELECT g.id, g.title,
         (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS students,
         (SELECT count(*)::int FROM group_members gm JOIN users u ON u.id = gm.user_id
           WHERE gm.group_id = g.id AND u.must_change_password AND u.disabled_at IS NULL) AS temp,
         (SELECT count(*)::int FROM course_groups cg JOIN courses c ON c.id = cg.course_id
           WHERE cg.group_id = g.id AND c.status <> 'archived') AS courses,
         (SELECT count(DISTINCT x.uid)::int FROM (
            SELECT v.user_id AS uid FROM topic_views v JOIN group_members gm ON gm.user_id = v.user_id
              JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id
              WHERE gm.group_id = g.id AND c.org_id = $1 AND v.last_at > now() - interval '7 days'
            UNION ALL
            SELECT s.student_id FROM submissions s JOIN group_members gm ON gm.user_id = s.student_id
              JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id JOIN courses c ON c.id = t.course_id
              WHERE gm.group_id = g.id AND c.org_id = $1 AND s.updated_at > now() - interval '7 days') x) AS active,
         (SELECT avg(s.score / ${POINTS}) FROM submissions s JOIN group_members gm ON gm.user_id = s.student_id
            JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            JOIN course_groups cg ON cg.course_id = t.course_id AND cg.group_id = g.id
            WHERE gm.group_id = g.id AND s.status = 'graded') AS avg,
         (SELECT count(*)::int FROM submissions s JOIN group_members gm ON gm.user_id = s.student_id
            JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            JOIN course_groups cg ON cg.course_id = t.course_id AND cg.group_id = g.id
            WHERE gm.group_id = g.id AND s.status = 'submitted') AS pending,
         ARRAY(SELECT coalesce(u.display_name, u.email, u.login) FROM group_teachers gt JOIN users u ON u.id = gt.user_id
               WHERE gt.group_id = g.id ORDER BY 1) AS teachers
       FROM groups g WHERE g.org_id = $1 AND g.id = ANY($2::uuid[]) AND g.archived_at IS NULL
       ORDER BY g.title`, [orgId, groupIds]),
    db().query<{ group_id: string; day: string; n: number }>(
      `SELECT gm.group_id, to_char(ev.at::date, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM (
         SELECT v.user_id AS uid, v.first_at AS at FROM topic_views v WHERE v.first_at > current_date - 13
         UNION ALL
         SELECT s.student_id, s.submitted_at FROM submissions s WHERE s.submitted_at > current_date - 13
       ) ev JOIN group_members gm ON gm.user_id = ev.uid
       WHERE gm.group_id = ANY($1::uuid[]) GROUP BY 1, 2`, [groupIds]),
  ]);
  const days = lastDays(14);
  return groups.rows.map((g) => {
    const byDay = new Map(events.rows.filter((e) => e.group_id === g.id).map((e) => [e.day, e.n]));
    return {
      id: g.id, title: g.title, students: g.students, tempPasswords: g.temp, courses: g.courses,
      activeWeek: g.active, avgPercent: g.avg === null ? null : Math.round(Number(g.avg) * 100),
      pending: g.pending, teachers: g.teachers, spark: days.map((d) => byDay.get(d) ?? 0),
    };
  });
}


export interface GroupCourse {
  id: string; title: string; subject: string; status: string; owner: string;
  topics: number; progress: number; pending: number; mine: boolean;
}

export interface GroupStudentRow {
  id: string; name: string; login: string | null; mustChange: boolean; disabled: boolean;
  lastActive: string | null; opened: number; topics: number; done: number; tasks: number;
  avgPercent: number | null; pending: number; returned: number;
}

export interface TeachGroupDetail { courses: GroupCourse[]; students: GroupStudentRow[]; spark: number[] }

/** Карточка группы для учителя: прогресс каждого ученика по всем курсам, открытым группе. */
export async function teachGroupDetail(groupId: string, userId: string): Promise<TeachGroupDetail> {
  const [courses, students, spark] = await Promise.all([
    db().query<{ id: string; title: string; subject: string; status: string; owner: string; owner_id: string; topics: number; views: number; students: number; pending: number }>(
      `SELECT c.id, c.title, c.subject, c.status, coalesce(u.display_name, u.email, u.login) AS owner, c.owner_id,
         (SELECT count(*)::int FROM topics t WHERE t.course_id = c.id) AS topics,
         (SELECT count(*)::int FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN group_members gm ON gm.user_id = v.user_id
           WHERE t.course_id = c.id AND gm.group_id = $1) AS views,
         (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = $1) AS students,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           JOIN group_members gm ON gm.user_id = s.student_id
           WHERE t.course_id = c.id AND gm.group_id = $1 AND s.status = 'submitted') AS pending
       FROM course_groups cg JOIN courses c ON c.id = cg.course_id JOIN users u ON u.id = c.owner_id
       WHERE cg.group_id = $1 AND c.status <> 'archived' ORDER BY c.status = 'published' DESC, c.title`, [groupId]),
    db().query<{
      id: string; name: string; login: string | null; must_change: boolean; disabled: boolean; last: Date | null;
      opened: number; topics: number; done: number; tasks: number; avg: string | null; pending: number; returned: number;
    }>(
      `WITH gc AS (SELECT c.id FROM course_groups cg JOIN courses c ON c.id = cg.course_id
                   WHERE cg.group_id = $1 AND c.status = 'published')
       SELECT u.id, ${NAME} AS name, u.login, u.must_change_password AS must_change, u.disabled_at IS NOT NULL AS disabled,
         greatest(
           (SELECT max(v.last_at) FROM topic_views v WHERE v.user_id = u.id),
           (SELECT max(s.updated_at) FROM submissions s WHERE s.student_id = u.id)) AS last,
         (SELECT count(*)::int FROM topic_views v JOIN topics t ON t.id = v.topic_id WHERE v.user_id = u.id AND t.course_id IN (SELECT id FROM gc)) AS opened,
         (SELECT count(*)::int FROM topics t WHERE t.course_id IN (SELECT id FROM gc)) AS topics,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM gc) AND s.status IN ('submitted', 'graded')) AS done,
         (SELECT count(*)::int FROM blocks b JOIN topics t ON t.id = b.topic_id WHERE b.kind = 'assignment' AND t.course_id IN (SELECT id FROM gc)) AS tasks,
         (SELECT avg(s.score / ${POINTS}) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM gc) AND s.status = 'graded') AS avg,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM gc) AND s.status = 'submitted') AS pending,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
           WHERE s.student_id = u.id AND t.course_id IN (SELECT id FROM gc) AND s.status = 'returned') AS returned
       FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = $1 ORDER BY name`, [groupId]),
    db().query<{ day: string; n: number }>(
      `SELECT to_char(ev.at::date, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM (
         SELECT v.user_id AS uid, v.first_at AS at FROM topic_views v WHERE v.first_at > current_date - 29
         UNION ALL
         SELECT s.student_id, s.submitted_at FROM submissions s WHERE s.submitted_at > current_date - 29
       ) ev JOIN group_members gm ON gm.user_id = ev.uid WHERE gm.group_id = $1 GROUP BY 1`, [groupId]),
  ]);
  const byDay = new Map(spark.rows.map((r) => [r.day, r.n]));
  return {
    courses: courses.rows.map((c) => ({
      id: c.id, title: c.title, subject: c.subject, status: c.status, owner: c.owner, topics: c.topics, pending: c.pending,
      mine: c.owner_id === userId,
      progress: c.students && c.topics ? Math.min(100, Math.round((c.views / (c.students * c.topics)) * 100)) : 0,
    })),
    students: students.rows.map((s) => ({
      id: s.id, name: s.name, login: s.login, mustChange: s.must_change, disabled: s.disabled,
      lastActive: s.last?.toISOString() ?? null, opened: s.opened, topics: s.topics, done: s.done, tasks: s.tasks,
      avgPercent: s.avg === null ? null : Math.round(Number(s.avg) * 100), pending: s.pending, returned: s.returned,
    })),
    spark: lastDays(30).map((d) => byDay.get(d) ?? 0),
  };
}

/* --------------------------- очередь проверки ---------------------------- */

export interface ReviewItem {
  id: string; blockId: string; courseId: string; course: string; topic: string; title: string;
  student: string; submittedAt: string; late: boolean; points: number;
}

export async function reviewQueue(orgId: string, ownerId: string | null): Promise<ReviewItem[]> {
  const { rows } = await db().query<{
    id: string; block_id: string; course_id: string; course: string; topic: string; prompt: string | null;
    student: string; submitted_at: Date; late: boolean; points: number | null;
  }>(
    `SELECT s.id, b.id AS block_id, c.id AS course_id, c.title AS course, t.title AS topic, b.payload->>'prompt' AS prompt,
       ${NAME} AS student, s.submitted_at, coalesce(t.due_at < s.submitted_at, false) AS late, ${POINTS} AS points
     FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
     JOIN courses c ON c.id = t.course_id JOIN users u ON u.id = s.student_id
     WHERE ${COURSE_SCOPE} AND s.status = 'submitted'
     ORDER BY s.submitted_at, s.id LIMIT 300`, [orgId, ownerId]);
  return rows.map((r) => ({
    id: r.id, blockId: r.block_id, courseId: r.course_id, course: r.course, topic: r.topic,
    title: assignmentTitle(r.prompt ?? '') || 'Задание', student: r.student,
    submittedAt: r.submitted_at.toISOString(), late: r.late, points: r.points ?? 0,
  }));
}
