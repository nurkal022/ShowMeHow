import type { AuthUser } from '../auth/users';
import { requireOrgRole } from '../org/access';
import { listGroups, teacherGroupIds } from '../org/groups';
import type { Membership } from '../org/types';
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
