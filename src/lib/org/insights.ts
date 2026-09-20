import { db } from '../db/client';
import { lastDays } from '../cabinet/daily';
import { assignmentTitle } from '../lms/block-schema';

/**
 * Обзор организации глазами админа: где застревают ученики, как работают
 * учителя и что происходит в школе прямо сейчас.
 */

/* --------------------------------- воронка -------------------------------- */

/** Шаги: добавлен → вошёл (сменил временный пароль) → открыл урок → сдал работу. */
export interface FunnelCounts { added: number; loggedIn: number; opened: number; submitted: number }
export interface GroupFunnel extends FunnelCounts { id: string; title: string }
export interface OrgFunnel { total: FunnelCounts; groups: GroupFunnel[] }

export async function orgFunnel(orgId: string): Promise<OrgFunnel> {
  const { rows } = await db().query<{ id: string | null; title: string | null; added: number; logged: number; opened: number; submitted: number }>(
    `WITH st AS (
       SELECT u.id, NOT u.must_change_password AS logged,
         EXISTS (SELECT 1 FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id
                 WHERE v.user_id = u.id AND c.org_id = $1) AS opened,
         EXISTS (SELECT 1 FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
                 JOIN courses c ON c.id = t.course_id WHERE s.student_id = u.id AND c.org_id = $1 AND s.status <> 'draft') AS submitted
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.role = 'student' AND u.disabled_at IS NULL)
     SELECT NULL AS id, NULL AS title, count(*)::int AS added, count(*) FILTER (WHERE logged)::int AS logged,
       count(*) FILTER (WHERE opened)::int AS opened, count(*) FILTER (WHERE submitted)::int AS submitted
     FROM st
     UNION ALL
     SELECT g.id, g.title, count(st.id)::int, count(st.id) FILTER (WHERE st.logged)::int,
       count(st.id) FILTER (WHERE st.opened)::int, count(st.id) FILTER (WHERE st.submitted)::int
     FROM groups g LEFT JOIN group_members gm ON gm.group_id = g.id LEFT JOIN st ON st.id = gm.user_id
     WHERE g.org_id = $1 AND g.archived_at IS NULL GROUP BY g.id, g.title`, [orgId]);
  const pick = (r: typeof rows[number]): FunnelCounts => ({ added: r.added, loggedIn: r.logged, opened: r.opened, submitted: r.submitted });
  const total = rows.find((r) => r.id === null);
  return {
    total: total ? pick(total) : { added: 0, loggedIn: 0, opened: 0, submitted: 0 },
    groups: rows.filter((r) => r.id !== null)
      .map((r) => ({ id: r.id as string, title: r.title as string, ...pick(r) }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true })),
  };
}

/* --------------------------- активность учителей -------------------------- */

export interface TeacherActivity {
  userId: string; name: string; admin: boolean; groups: string[];
  courses: number; published: number; pending: number; graded7d: number; lastActive: string | null;
  /** Проверенные работы по дням за 14 дней. */
  spark: number[];
}

export async function teacherActivity(orgId: string): Promise<TeacherActivity[]> {
  const [people, graded] = await Promise.all([
    db().query<{
      id: string; name: string; role: string; groups: string[]; courses: number; published: number;
      pending: number; graded7d: number; last: Date | null;
    }>(
      `SELECT u.id, coalesce(u.display_name, u.email, u.login) AS name, m.role,
         ARRAY(SELECT g.title FROM group_teachers gt JOIN groups g ON g.id = gt.group_id
               WHERE gt.user_id = u.id AND g.org_id = $1 AND g.archived_at IS NULL ORDER BY g.title) AS groups,
         (SELECT count(*)::int FROM courses c WHERE c.owner_id = u.id AND c.org_id = $1 AND c.status <> 'archived') AS courses,
         (SELECT count(*)::int FROM courses c WHERE c.owner_id = u.id AND c.org_id = $1 AND c.status = 'published') AS published,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            JOIN courses c ON c.id = t.course_id WHERE c.owner_id = u.id AND c.org_id = $1 AND s.status = 'submitted') AS pending,
         (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
            JOIN courses c ON c.id = t.course_id
            WHERE s.graded_by = u.id AND c.org_id = $1 AND s.graded_at > now() - interval '7 days') AS graded7d,
         greatest(
           (SELECT max(se.created_at) FROM sessions se WHERE se.user_id = u.id AND se.impersonator_id IS NULL),
           (SELECT max(s.graded_at) FROM submissions s WHERE s.graded_by = u.id),
           (SELECT max(c.updated_at) FROM courses c WHERE c.owner_id = u.id AND c.org_id = $1)) AS last
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.role IN ('teacher', 'org_admin') AND u.disabled_at IS NULL
       ORDER BY m.role = 'teacher' DESC, name`, [orgId]),
    db().query<{ uid: string; day: string; n: number }>(
      `SELECT s.graded_by AS uid, to_char(s.graded_at::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
       JOIN courses c ON c.id = t.course_id
       WHERE c.org_id = $1 AND s.graded_at > current_date - 13 AND s.graded_by IS NOT NULL GROUP BY 1, 2`, [orgId]),
  ]);
  const days = lastDays(14);
  return people.rows
    // Админ без групп и курсов — не учитель: в карточках он был бы пустым.
    .filter((p) => p.role === 'teacher' || p.groups.length > 0 || p.courses > 0)
    .map((p) => {
      const mine = new Map(graded.rows.filter((g) => g.uid === p.id).map((g) => [g.day, g.n]));
      return {
        userId: p.id, name: p.name, admin: p.role === 'org_admin', groups: p.groups, courses: p.courses,
        published: p.published, pending: p.pending, graded7d: p.graded7d, lastActive: p.last?.toISOString() ?? null,
        spark: days.map((d) => mine.get(d) ?? 0),
      };
    });
}

/* ------------------------------ лента событий ----------------------------- */

export type OrgEventKind = 'student' | 'teacher' | 'group' | 'course' | 'submitted' | 'graded';
export interface OrgEvent { kind: OrgEventKind; at: string; who: string; what: string; href: string | null }

export async function orgFeed(orgId: string, limit = 10): Promise<OrgEvent[]> {
  const { rows } = await db().query<{ kind: OrgEventKind; at: Date; who: string; what: string | null; prompt: string | null; ref: string | null }>(
    `SELECT * FROM (
       SELECT CASE WHEN m.role = 'student' THEN 'student' ELSE 'teacher' END AS kind, m.created_at AS at,
         coalesce(u.display_name, u.login, u.email) AS who,
         (SELECT string_agg(g.title, ', ') FROM group_members gm JOIN groups g ON g.id = gm.group_id
           WHERE gm.user_id = u.id AND g.org_id = $1) AS what, NULL AS prompt, NULL AS ref
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND m.role <> 'org_admin'
       UNION ALL
       SELECT 'group', g.created_at, g.title, NULL, NULL, g.id::text FROM groups g WHERE g.org_id = $1 AND g.archived_at IS NULL
       UNION ALL
       SELECT 'course', c.created_at, coalesce(u.display_name, u.email, u.login), c.title, NULL, c.id::text
       FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.org_id = $1 AND c.status <> 'archived'
       UNION ALL
       SELECT 'submitted', s.submitted_at, coalesce(u.display_name, u.login, u.email), c.title, b.payload->>'prompt', c.id::text
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
       JOIN courses c ON c.id = t.course_id JOIN users u ON u.id = s.student_id
       WHERE c.org_id = $1 AND s.submitted_at IS NOT NULL AND s.status <> 'draft'
       UNION ALL
       SELECT 'graded', s.graded_at, coalesce(u.display_name, u.email, u.login), c.title, b.payload->>'prompt', c.id::text
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
       JOIN courses c ON c.id = t.course_id JOIN users u ON u.id = s.graded_by
       WHERE c.org_id = $1 AND s.graded_at IS NOT NULL
     ) e WHERE at IS NOT NULL AND at <= now() ORDER BY at DESC LIMIT $2`, [orgId, limit]);
  return rows.map((r) => {
    const task = r.prompt !== null ? assignmentTitle(r.prompt) || 'задание' : null;
    const what = {
      student: r.what ? `новый ученик · ${r.what}` : 'новый ученик',
      teacher: 'присоединился к школе как учитель',
      group: 'создана группа',
      course: `создал курс «${r.what}»`,
      submitted: `сдал «${task}» · ${r.what}`,
      graded: `проверил «${task}» · ${r.what}`,
    }[r.kind];
    const href = r.kind === 'group' && r.ref ? `/org/groups/${r.ref}`
      : r.ref && r.kind !== 'student' && r.kind !== 'teacher' ? `/teach/courses/${r.ref}` : null;
    return { kind: r.kind, at: r.at.toISOString(), who: r.who, what, href };
  });
}
