import { db, hasDb } from './db/client';
import { escapeLike } from './admin/users';
import type { AuthUser } from './auth/users';
import { VISIBLE_TO_STUDENT } from './lms/courses';

/**
 * Поиск для ⌘K. Каждая группа ищет только в том, что человеку и так доступно:
 * свои симуляции, курсы, которые он ведёт или проходит, группы и ученики его
 * организаций, пользователи — только админу платформы. По 5 результатов на группу.
 */

export interface SearchHit {
  kind: 'simulation' | 'course' | 'topic' | 'group' | 'student' | 'user';
  title: string;
  subtitle: string;
  href: string;
}

const LIMIT = 5;

export async function searchEverything(user: AuthUser, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (!hasDb() || q.length < 2) return [];
  const like = `%${escapeLike(q.toLowerCase())}%`;
  const adminOrgs = `SELECT org_id FROM memberships WHERE user_id = $1 AND role = 'org_admin'`;
  const taughtGroups = `SELECT group_id FROM group_teachers WHERE user_id = $1`;
  const [sims, staffCourses, learnCourses, topics, groups, students, users] = await Promise.all([
    db().query<{ id: string; title: string; subject: string }>(
      `SELECT id, title, subject FROM simulations WHERE owner_id = $1 AND lower(title) LIKE $2
       ORDER BY updated_at DESC LIMIT ${LIMIT}`, [user.id, like]),
    db().query<{ id: string; title: string; status: string }>(
      `SELECT c.id, c.title, c.status FROM courses c
       WHERE lower(c.title) LIKE $2 AND c.status <> 'archived' AND (c.owner_id = $1 OR c.org_id IN (${adminOrgs}))
       ORDER BY c.updated_at DESC LIMIT ${LIMIT}`, [user.id, like]),
    db().query<{ id: string; title: string }>(
      `SELECT c.id, c.title FROM courses c
       WHERE c.status = 'published' AND lower(c.title) LIKE $2 AND c.id IN (${VISIBLE_TO_STUDENT}) LIMIT ${LIMIT}`, [user.id, like]),
    db().query<{ id: string; title: string; course_id: string; course: string; staff: boolean }>(
      `SELECT t.id, t.title, c.id AS course_id, c.title AS course, (c.owner_id = $1 OR c.org_id IN (${adminOrgs})) AS staff
       FROM topics t JOIN courses c ON c.id = t.course_id
       WHERE lower(t.title) LIKE $2 AND c.status <> 'archived'
         AND (c.owner_id = $1 OR c.org_id IN (${adminOrgs}) OR (c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})))
       LIMIT ${LIMIT}`, [user.id, like]),
    db().query<{ id: string; title: string; org: string }>(
      `SELECT g.id, g.title, o.name AS org FROM groups g JOIN organizations o ON o.id = g.org_id
       WHERE g.archived_at IS NULL AND lower(g.title) LIKE $2 AND (g.org_id IN (${adminOrgs}) OR g.id IN (${taughtGroups}))
       LIMIT ${LIMIT}`, [user.id, like]),
    db().query<{ id: string; name: string; login: string | null; group_id: string; group_title: string }>(
      `SELECT DISTINCT ON (u.id) u.id, coalesce(u.display_name, u.login) AS name, u.login, g.id AS group_id, g.title AS group_title
       FROM users u JOIN group_members gm ON gm.user_id = u.id JOIN groups g ON g.id = gm.group_id AND g.archived_at IS NULL
       WHERE (lower(coalesce(u.display_name, '')) LIKE $2 OR lower(coalesce(u.login, '')) LIKE $2)
         AND (g.org_id IN (${adminOrgs}) OR g.id IN (${taughtGroups}))
       LIMIT ${LIMIT}`, [user.id, like]),
    user.role === 'admin'
      ? db().query<{ id: string; name: string; contact: string }>(
        `SELECT id, coalesce(display_name, email, login) AS name, coalesce(email, login) AS contact FROM users
         WHERE lower(coalesce(display_name, '')) LIKE $1 OR lower(coalesce(email, '')) LIKE $1 OR lower(coalesce(login, '')) LIKE $1
         LIMIT ${LIMIT}`, [like])
      : Promise.resolve({ rows: [] as { id: string; name: string; contact: string }[] }),
  ]);
  const staffIds = new Set(staffCourses.rows.map((c) => c.id));
  return [
    ...staffCourses.rows.map((c): SearchHit => ({
      kind: 'course', title: c.title, subtitle: c.status === 'published' ? 'курс · опубликован' : 'курс · черновик',
      href: `/teach/courses/${c.id}`,
    })),
    ...learnCourses.rows.filter((c) => !staffIds.has(c.id))
      .map((c): SearchHit => ({ kind: 'course', title: c.title, subtitle: 'мой курс', href: `/learn/courses/${c.id}` })),
    ...topics.rows.map((t): SearchHit => ({
      kind: 'topic', title: t.title, subtitle: `тема · ${t.course}`,
      href: t.staff ? `/teach/courses/${t.course_id}?topic=${t.id}` : `/learn/topics/${t.id}`,
    })),
    ...students.rows.map((s): SearchHit => ({
      kind: 'student', title: s.name, subtitle: `ученик · ${s.group_title}${s.login ? ` · ${s.login}` : ''}`, href: `/org/groups/${s.group_id}`,
    })),
    ...groups.rows.map((g): SearchHit => ({ kind: 'group', title: `Группа ${g.title}`, subtitle: g.org, href: `/org/groups/${g.id}` })),
    ...sims.rows.map((s): SearchHit => ({ kind: 'simulation', title: s.title, subtitle: `симуляция · ${s.subject}`, href: `/?id=${s.id}` })),
    ...users.rows.map((u): SearchHit => ({ kind: 'user', title: u.name, subtitle: `пользователь · ${u.contact}`, href: `/admin/users/${u.id}` })),
  ];
}
