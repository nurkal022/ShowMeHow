import type { AuthUser } from '../auth/users';
import { hasDb, db } from '../db/client';
import { isPlatformAdmin, isUuid, requireOrgRole } from '../org/access';
import { listGroups, teacherGroupIds } from '../org/groups';
import type { Membership } from '../org/types';
import { getBlock, type Block } from './blocks';
import { getCourse, getTopic, isCourseVisibleToStudent } from './courses';
import type { Course, Topic } from './types';

/**
 * Кто что может с курсами. Как и src/lib/org/access.ts, при отказе функции
 * возвращают null/false, а роут и страница отвечают 404.
 */

export interface StaffCourse {
  course: Course;
  membership: Membership;
}

/** Править курс может его владелец и админ организации (в том числе админ платформы). */
export async function staffCourse(user: AuthUser, courseId: string): Promise<StaffCourse | null> {
  const course = await getCourse(courseId);
  if (!course) return null;
  const membership = await requireOrgRole(user, course.orgId, ['teacher']);
  if (!membership) return null;
  if (membership.role !== 'org_admin' && course.ownerId !== user.id) return null;
  return { course, membership };
}

export async function staffTopic(user: AuthUser, topicId: string): Promise<(StaffCourse & { topic: Topic }) | null> {
  const topic = await getTopic(topicId);
  if (!topic) return null;
  const staff = await staffCourse(user, topic.courseId);
  return staff ? { ...staff, topic } : null;
}

/** Опубликованный курс, открытый группе ученика. */
export async function studentCourse(user: AuthUser, courseId: string): Promise<Course | null> {
  const course = await getCourse(courseId);
  if (!course || course.status !== 'published') return null;
  return (await isCourseVisibleToStudent(user.id, course.id)) ? course : null;
}

/** Страницы /learn: ученик — как обычно, учитель — в режиме «Как видит ученик». */
export async function learnerCourse(
  user: AuthUser, courseId: string, preview: boolean,
): Promise<{ course: Course; preview: boolean } | null> {
  if (preview) {
    const staff = await staffCourse(user, courseId);
    return staff ? { course: staff.course, preview: true } : null;
  }
  const course = await studentCourse(user, courseId);
  return course ? { course, preview: false } : null;
}

/** Группы, которым человек может открыть курс: админу — все, учителю — свои. */
export async function allowedGroupIds(user: AuthUser, membership: Membership): Promise<string[]> {
  if (membership.role === 'org_admin') return (await listGroups(membership.orgId)).map((g) => g.id);
  return teacherGroupIds(user.id, membership.orgId);
}

export async function staffBlock(
  user: AuthUser, blockId: string,
): Promise<(StaffCourse & { topic: Topic; block: Block }) | null> {
  const block = await getBlock(blockId);
  if (!block) return null;
  const staff = await staffTopic(user, block.topicId);
  return staff ? { ...staff, block } : null;
}

export async function studentBlock(
  user: AuthUser, blockId: string,
): Promise<{ course: Course; topic: Topic; block: Block } | null> {
  const block = await getBlock(blockId);
  if (!block) return null;
  const topic = await getTopic(block.topicId);
  if (!topic) return null;
  const course = await studentCourse(user, topic.courseId);
  return course ? { course, topic, block } : null;
}

/**
 * Кто видит симуляцию (спецификация §6): владелец, любой вошедший — если она в
 * каталоге, админ платформы, а также ученик опубликованного курса, открытого его
 * группе, и владелец или админ организации курса, куда она вставлена блоком или
 * стендом задания. Правка и удаление по-прежнему только у владельца (storage.ts).
 * Без базы (юнит-тесты на памяти) — только владелец, а его проверяет storage.ts.
 */
export async function canView(user: Pick<AuthUser, 'id' | 'role'>, simulationId: string): Promise<boolean> {
  if (!hasDb() || !isUuid(simulationId)) return false;
  const { rows } = await db().query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM simulations s
       WHERE s.id = $1 AND (
         s.owner_id = $2 OR s.visibility = 'catalog' OR $4
         OR EXISTS (
           SELECT 1 FROM blocks b
           JOIN topics t ON t.id = b.topic_id
           JOIN courses c ON c.id = t.course_id
           JOIN organizations o ON o.id = c.org_id AND o.archived_at IS NULL
           WHERE (b.payload->>'simulationId' = $3 OR b.payload#>>'{stand,simulationId}' = $3)
             AND (
               c.owner_id = $2
               OR EXISTS (SELECT 1 FROM memberships m
                          WHERE m.org_id = c.org_id AND m.user_id = $2 AND m.role = 'org_admin')
               OR (c.status = 'published' AND EXISTS (
                     SELECT 1 FROM course_groups cg
                     JOIN groups g ON g.id = cg.group_id AND g.archived_at IS NULL
                     JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $2
                     WHERE cg.course_id = c.id))
             )))) AS ok`,
    [simulationId, user.id, simulationId.toLowerCase(), isPlatformAdmin(user)]);
  return rows[0].ok;
}

/** Вставить в курс можно свою симуляцию или симуляцию из общего каталога. */
export async function canUseInCourse(userId: string, simulationId: string): Promise<boolean> {
  if (!isUuid(simulationId)) return false;
  const { rowCount } = await db().query(
    `SELECT 1 FROM simulations WHERE id = $1 AND (owner_id = $2 OR visibility = 'catalog')`,
    [simulationId, userId]);
  return (rowCount ?? 0) > 0;
}
