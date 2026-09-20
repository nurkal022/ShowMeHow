import { db } from '../db/client';

/**
 * Данные отчётов администрации: работа учителей, риски учеников, наборы для вопросов
 * на естественном языке. Все выборки — по одной организации; тексты делает org/ai.ts.
 */

const POINTS = `NULLIF(CASE WHEN b.payload->>'points' ~ '^[0-9]+$' THEN (b.payload->>'points')::int ELSE 0 END, 0)`;
const DAY = 86_400_000;
const pct = (v: string | number | null) => (v === null ? null : Math.round(Number(v) * 100));

/* ------------------------------ работа учителей ----------------------------- */

export interface TeacherScore {
  userId: string; name: string; groups: string[];
  courses: number; published: number; students: number;
  /** Средний результат учеников в курсах учителя, %. */
  avgPercent: number | null;
  graded: number;
  /** Медиана часов от сдачи до проверки за период. */
  medianHours: number | null;
  /** Доля проверенных работ с комментарием ученику, %. */
  commentShare: number | null;
  pending: number;
  /** Сколько дней ждёт самая давняя непроверенная работа. */
  oldestPendingDays: number | null;
  debriefs: number;
  /** Доля учеников курсов, активных за 7 дней, %. */
  activeShare: number | null;
  lastActive: string | null;
}

/** Период — последние `days` дней или календарный отрезок range (для недельного отчёта). */
export async function teacherScorecard(orgId: string, days = 30, range?: { from: string; to: string }): Promise<TeacherScore[]> {
  const { rows } = await db().query<{
    id: string; name: string; groups: string[]; courses: number; published: number; students: number; avg: string | null;
    graded: number; median: string | null; commented: number; pending: number; oldest: Date | null; debriefs: number;
    active: number; last: Date | null;
  }>(
    `WITH t AS (
       SELECT u.id, coalesce(u.display_name, u.email, u.login) AS name FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.role IN ('teacher', 'org_admin') AND u.disabled_at IS NULL),
     sub AS (
       SELECT c.owner_id, s.*, ${POINTS} AS pts FROM submissions s JOIN blocks b ON b.id = s.block_id
       JOIN topics tp ON tp.id = b.topic_id JOIN courses c ON c.id = tp.course_id
       WHERE c.org_id = $1 AND c.status <> 'archived'),
     st AS (
       SELECT DISTINCT c.owner_id, gm.user_id FROM courses c JOIN course_groups cg ON cg.course_id = c.id
       JOIN group_members gm ON gm.group_id = cg.group_id WHERE c.org_id = $1 AND c.status <> 'archived')
     SELECT t.id, t.name,
       ARRAY(SELECT g.title FROM group_teachers gt JOIN groups g ON g.id = gt.group_id
             WHERE gt.user_id = t.id AND g.org_id = $1 AND g.archived_at IS NULL ORDER BY g.title) AS groups,
       (SELECT count(*)::int FROM courses c WHERE c.owner_id = t.id AND c.org_id = $1 AND c.status <> 'archived') AS courses,
       (SELECT count(*)::int FROM courses c WHERE c.owner_id = t.id AND c.org_id = $1 AND c.status = 'published') AS published,
       (SELECT count(*)::int FROM st WHERE st.owner_id = t.id) AS students,
       (SELECT avg(sub.score / sub.pts) FROM sub WHERE sub.owner_id = t.id AND sub.status = 'graded') AS avg,
       (SELECT count(*)::int FROM sub WHERE sub.graded_by = t.id AND sub.graded_at > coalesce($3::timestamptz, now() - make_interval(days => $2)) AND sub.graded_at < coalesce($4::timestamptz, 'infinity')) AS graded,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM sub.graded_at - sub.submitted_at) / 3600)
          FROM sub WHERE sub.graded_by = t.id AND sub.graded_at > coalesce($3::timestamptz, now() - make_interval(days => $2)) AND sub.graded_at < coalesce($4::timestamptz, 'infinity') AND sub.submitted_at IS NOT NULL) AS median,
       (SELECT count(*)::int FROM sub WHERE sub.graded_by = t.id AND sub.graded_at > coalesce($3::timestamptz, now() - make_interval(days => $2)) AND sub.graded_at < coalesce($4::timestamptz, 'infinity')
          AND coalesce(trim(sub.comment), '') <> '') AS commented,
       (SELECT count(*)::int FROM sub WHERE sub.owner_id = t.id AND sub.status = 'submitted') AS pending,
       (SELECT min(sub.submitted_at) FROM sub WHERE sub.owner_id = t.id AND sub.status = 'submitted') AS oldest,
       (SELECT count(*)::int FROM lesson_debriefs d WHERE d.author_id = t.id AND d.org_id = $1
          AND d.created_at > coalesce($3::timestamptz, now() - make_interval(days => $2)) AND d.created_at < coalesce($4::timestamptz, 'infinity')) AS debriefs,
       (SELECT count(DISTINCT st.user_id)::int FROM st WHERE st.owner_id = t.id AND (
          EXISTS (SELECT 1 FROM topic_views v WHERE v.user_id = st.user_id AND v.last_at > now() - interval '7 days')
          OR EXISTS (SELECT 1 FROM submissions s WHERE s.student_id = st.user_id AND s.updated_at > now() - interval '7 days'))) AS active,
       greatest(
         (SELECT max(se.created_at) FROM sessions se WHERE se.user_id = t.id AND se.impersonator_id IS NULL),
         (SELECT max(s.graded_at) FROM submissions s WHERE s.graded_by = t.id),
         (SELECT max(c.updated_at) FROM courses c WHERE c.owner_id = t.id AND c.org_id = $1)) AS last
     FROM t ORDER BY t.name`, [orgId, days, range?.from ?? null, range?.to ?? null]);
  return rows
    .filter((r) => r.courses > 0 || r.groups.length > 0)
    .map((r) => ({
      userId: r.id, name: r.name, groups: r.groups, courses: r.courses, published: r.published, students: r.students,
      avgPercent: pct(r.avg), graded: r.graded, medianHours: r.median === null ? null : Math.round(Number(r.median) * 10) / 10,
      commentShare: r.graded ? Math.round((r.commented / r.graded) * 100) : null,
      pending: r.pending, oldestPendingDays: r.oldest ? Math.floor((Date.now() - r.oldest.getTime()) / DAY) : null,
      debriefs: r.debriefs, activeShare: r.students ? Math.round((r.active / r.students) * 100) : null,
      lastActive: r.last?.toISOString() ?? null,
    }));
}

/* ------------------------------ риски учеников ------------------------------ */

export type RiskLevel = 'high' | 'medium' | 'low' | 'ok';
export const RISK_LABELS: Record<RiskLevel, string> = { high: 'высокий', medium: 'средний', low: 'низкий', ok: 'нет' };

export interface RiskFactor { label: string; weight: number }
export interface StudentRisk {
  id: string; name: string; login: string | null; groups: string[]; groupIds: string[];
  score: number; level: RiskLevel; factors: RiskFactor[];
  lastActive: string | null; avgPercent: number | null; recentPercent: number | null;
  done: number; tasks: number; missed: number; neverLoggedIn: boolean;
}

/**
 * Раннее предупреждение: балл риска 0–100 из понятных причин — не заходит, пропускает сроки,
 * балл падает, работы на доработке. Каждая причина видна: это подсказка учителю, а не ярлык.
 */
export async function studentRisks(orgId: string, groupIds?: string[]): Promise<StudentRisk[]> {
  const { rows } = await db().query<{
    id: string; name: string; login: string | null; must_change: boolean; groups: string[]; group_ids: string[];
    last: Date | null; avg: string | null; recent: string | null; earlier: string | null;
    done: number; tasks: number; missed: number; returned: number;
  }>(
    `WITH st AS (
       SELECT u.id, coalesce(u.display_name, u.login, u.email) AS name, u.login, u.must_change_password AS must_change
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.role = 'student' AND u.disabled_at IS NULL
         AND ($2::uuid[] IS NULL OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id AND gm.group_id = ANY($2::uuid[])))),
     vis AS (
       SELECT DISTINCT gm.user_id, c.id AS course_id FROM group_members gm JOIN course_groups cg ON cg.group_id = gm.group_id
       JOIN courses c ON c.id = cg.course_id WHERE c.org_id = $1 AND c.status = 'published'),
     graded AS (
       SELECT s.student_id, s.score / ${POINTS} AS r, row_number() OVER (PARTITION BY s.student_id ORDER BY s.graded_at DESC) AS n
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id JOIN courses c ON c.id = t.course_id
       WHERE c.org_id = $1 AND s.status = 'graded' AND s.score IS NOT NULL)
     SELECT st.id, st.name, st.login, st.must_change,
       ARRAY(SELECT g.title FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = st.id AND g.org_id = $1 AND g.archived_at IS NULL ORDER BY g.title) AS groups,
       ARRAY(SELECT g.id FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = st.id AND g.org_id = $1 AND g.archived_at IS NULL) AS group_ids,
       greatest((SELECT max(v.last_at) FROM topic_views v WHERE v.user_id = st.id),
                (SELECT max(s.updated_at) FROM submissions s WHERE s.student_id = st.id)) AS last,
       (SELECT avg(r) FROM graded WHERE graded.student_id = st.id) AS avg,
       (SELECT avg(r) FROM graded WHERE graded.student_id = st.id AND n <= 3) AS recent,
       (SELECT avg(r) FROM graded WHERE graded.student_id = st.id AND n BETWEEN 4 AND 8) AS earlier,
       (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
          WHERE s.student_id = st.id AND s.status IN ('submitted', 'graded') AND t.course_id IN (SELECT course_id FROM vis WHERE vis.user_id = st.id)) AS done,
       (SELECT count(*)::int FROM blocks b JOIN topics t ON t.id = b.topic_id
          WHERE b.kind = 'assignment' AND t.course_id IN (SELECT course_id FROM vis WHERE vis.user_id = st.id)) AS tasks,
       (SELECT count(*)::int FROM topics t
          WHERE t.course_id IN (SELECT course_id FROM vis WHERE vis.user_id = st.id) AND t.due_at < now()
            AND EXISTS (SELECT 1 FROM blocks b WHERE b.topic_id = t.id AND b.kind = 'assignment')
            AND NOT EXISTS (SELECT 1 FROM submissions s JOIN blocks b ON b.id = s.block_id
                            WHERE b.topic_id = t.id AND s.student_id = st.id AND s.status IN ('submitted', 'graded'))) AS missed,
       (SELECT count(*)::int FROM submissions s WHERE s.student_id = st.id AND s.status = 'returned') AS returned
     FROM st ORDER BY st.name`, [orgId, groupIds && groupIds.length ? groupIds : null]);

  return rows.map((r) => {
    const factors: RiskFactor[] = [];
    const last = r.last?.getTime() ?? null;
    const idle = last === null ? null : Math.floor((Date.now() - last) / DAY);
    const avg = pct(r.avg);
    const recent = pct(r.recent);
    const earlier = pct(r.earlier);
    if (r.must_change && last === null) factors.push({ label: 'ни разу не входил', weight: 40 });
    else if (last === null) factors.push({ label: 'не открывал уроки', weight: 30 });
    else if (idle !== null && idle > 14) factors.push({ label: `не заходит ${idle} дн.`, weight: 35 });
    else if (idle !== null && idle > 7) factors.push({ label: `не заходит ${idle} дн.`, weight: 20 });
    if (r.missed > 0) factors.push({ label: `пропущено сроков: ${r.missed}`, weight: Math.min(30, r.missed * 10) });
    if (avg !== null && avg < 40) factors.push({ label: `средний балл ${avg}%`, weight: 30 });
    else if (avg !== null && avg < 55) factors.push({ label: `средний балл ${avg}%`, weight: 20 });
    if (recent !== null && earlier !== null && earlier - recent >= 15) {
      factors.push({ label: `балл упал: ${earlier}% → ${recent}%`, weight: earlier - recent >= 35 ? 30 : earlier - recent >= 25 ? 20 : 15 });
    }
    if (r.returned > 0) factors.push({ label: `на доработке: ${r.returned}`, weight: Math.min(10, r.returned * 5) });
    if (r.tasks >= 4 && r.done / r.tasks < 0.5 && last !== null) factors.push({ label: `сдано ${r.done} из ${r.tasks}`, weight: 10 });
    const score = Math.min(100, factors.reduce((a, f) => a + f.weight, 0));
    const level: RiskLevel = score >= 60 ? 'high' : score >= 35 ? 'medium' : score >= 15 ? 'low' : 'ok';
    return {
      id: r.id, name: r.name, login: r.login, groups: r.groups, groupIds: r.group_ids, score, level,
      factors: factors.sort((a, b) => b.weight - a.weight), lastActive: r.last?.toISOString() ?? null,
      avgPercent: avg, recentPercent: recent, done: r.done, tasks: r.tasks, missed: r.missed,
      neverLoggedIn: r.must_change && last === null,
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'));
}

/* ----------------------------- недельные цифры ------------------------------ */

export interface WeekNumbers {
  activeStudents: number; submitted: number; graded: number; opened: number; newStudents: number;
  avgPercent: number | null; medianHours: number | null;
}
export interface GroupWeek { id: string; title: string; students: number; active: number; submitted: number; avgPercent: number | null; prevActive: number; prevSubmitted: number }
export interface WeekFacts {
  weekStart: string; weekEnd: string; students: number;
  now: WeekNumbers; prev: WeekNumbers;
  groups: GroupWeek[];
  teachers: TeacherScore[];
  risk: { high: number; medium: number; low: number; top: { name: string; groups: string[]; factors: string[] }[] };
  courses: { id: string; title: string; owner: string; submitted: number; opened: number }[];
}

/** Понедельник недели, в которую попадает дата (локальная дата сервера), 'YYYY-MM-DD'. */
export function weekStartOf(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

async function weekNumbers(orgId: string, from: string, to: string): Promise<WeekNumbers> {
  const { rows } = await db().query<{ active: number; submitted: number; graded: number; opened: number; fresh: number; avg: string | null; median: string | null }>(
    `WITH sub AS (SELECT s.*, ${POINTS} AS pts FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
                  JOIN courses c ON c.id = t.course_id WHERE c.org_id = $1),
          vw AS (SELECT v.* FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id
                 JOIN memberships m ON m.user_id = v.user_id AND m.org_id = c.org_id AND m.role = 'student' WHERE c.org_id = $1)
     SELECT
       (SELECT count(DISTINCT x)::int FROM (SELECT student_id AS x FROM sub WHERE updated_at >= $2::date AND updated_at < $3::date
                                            UNION SELECT user_id FROM vw WHERE last_at >= $2::date AND last_at < $3::date) q) AS active,
       (SELECT count(*)::int FROM sub WHERE submitted_at >= $2::date AND submitted_at < $3::date) AS submitted,
       (SELECT count(*)::int FROM sub WHERE graded_at >= $2::date AND graded_at < $3::date) AS graded,
       (SELECT count(*)::int FROM vw WHERE first_at >= $2::date AND first_at < $3::date) AS opened,
       (SELECT count(*)::int FROM memberships WHERE org_id = $1 AND role = 'student' AND created_at >= $2::date AND created_at < $3::date) AS fresh,
       (SELECT avg(score / pts) FROM sub WHERE status = 'graded' AND graded_at >= $2::date AND graded_at < $3::date) AS avg,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM graded_at - submitted_at) / 3600)
          FROM sub WHERE graded_by IS NOT NULL AND graded_at >= $2::date AND graded_at < $3::date) AS median`, [orgId, from, to]);
  const r = rows[0];
  return {
    activeStudents: r.active, submitted: r.submitted, graded: r.graded, opened: r.opened, newStudents: r.fresh,
    avgPercent: pct(r.avg), medianHours: r.median === null ? null : Math.round(Number(r.median) * 10) / 10,
  };
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function weekFacts(orgId: string, weekStart: string): Promise<WeekFacts> {
  const end = addDays(weekStart, 7);
  const prevStart = addDays(weekStart, -7);
  const [now, prev, groups, teachers, risks, courses, total] = await Promise.all([
    weekNumbers(orgId, weekStart, end),
    weekNumbers(orgId, prevStart, weekStart),
    db().query<{ id: string; title: string; students: number; active: number; submitted: number; avg: string | null; pactive: number; psubmitted: number }>(
      `WITH ev AS (
         SELECT s.student_id AS uid, s.updated_at AS at, s.submitted_at, NULL::numeric AS r FROM submissions s
         UNION ALL SELECT v.user_id, v.last_at, NULL, NULL FROM topic_views v)
       SELECT g.id, g.title,
         (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS students,
         (SELECT count(DISTINCT ev.uid)::int FROM ev JOIN group_members gm ON gm.user_id = ev.uid AND gm.group_id = g.id WHERE ev.at >= $2::date AND ev.at < $3::date) AS active,
         (SELECT count(*)::int FROM submissions s JOIN group_members gm ON gm.user_id = s.student_id AND gm.group_id = g.id WHERE s.submitted_at >= $2::date AND s.submitted_at < $3::date) AS submitted,
         (SELECT avg(s.score / ${POINTS}) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN group_members gm ON gm.user_id = s.student_id AND gm.group_id = g.id
            WHERE s.status = 'graded' AND s.graded_at >= $2::date AND s.graded_at < $3::date) AS avg,
         (SELECT count(DISTINCT ev.uid)::int FROM ev JOIN group_members gm ON gm.user_id = ev.uid AND gm.group_id = g.id WHERE ev.at >= $4::date AND ev.at < $2::date) AS pactive,
         (SELECT count(*)::int FROM submissions s JOIN group_members gm ON gm.user_id = s.student_id AND gm.group_id = g.id WHERE s.submitted_at >= $4::date AND s.submitted_at < $2::date) AS psubmitted
       FROM groups g WHERE g.org_id = $1 AND g.archived_at IS NULL ORDER BY g.title`, [orgId, weekStart, end, prevStart]),
    teacherScorecard(orgId, 7, { from: weekStart, to: end }),
    studentRisks(orgId),
    db().query<{ id: string; title: string; owner: string; submitted: number; opened: number }>(
      `SELECT c.id, c.title, coalesce(u.display_name, u.email, u.login) AS owner,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            WHERE t.course_id = c.id AND s.submitted_at >= $2::date AND s.submitted_at < $3::date) AS submitted,
         (SELECT count(*)::int FROM topic_views v JOIN topics t ON t.id = v.topic_id
            WHERE t.course_id = c.id AND v.first_at >= $2::date AND v.first_at < $3::date) AS opened
       FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.org_id = $1 AND c.status = 'published'
       ORDER BY submitted DESC, opened DESC LIMIT 10`, [orgId, weekStart, end]),
    db().query<{ n: number }>("SELECT count(*)::int AS n FROM memberships WHERE org_id = $1 AND role = 'student'", [orgId]),
  ]);
  return {
    weekStart, weekEnd: addDays(weekStart, 6), students: total.rows[0].n, now, prev,
    groups: groups.rows.map((g) => ({
      id: g.id, title: g.title, students: g.students, active: g.active, submitted: g.submitted, avgPercent: pct(g.avg),
      prevActive: g.pactive, prevSubmitted: g.psubmitted,
    })),
    teachers,
    risk: {
      high: risks.filter((r) => r.level === 'high').length,
      medium: risks.filter((r) => r.level === 'medium').length,
      low: risks.filter((r) => r.level === 'low').length,
      top: risks.filter((r) => r.level === 'high' || r.level === 'medium').slice(0, 8)
        .map((r) => ({ name: r.name, groups: r.groups, factors: r.factors.map((f) => f.label) })),
    },
    courses: courses.rows,
  };
}
