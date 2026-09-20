import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { allowedGroupIds, staffCourse } from '@/lib/lms/access';
import { listCourseGroupIds, listTopics } from '@/lib/lms/courses';
import { listGroups } from '@/lib/org/groups';
import { db } from '@/lib/db/client';
import CourseSetup from '@/components/teach/CourseSetup';

/** «О курсе»: паспорт курса — основное, описание, план тем, кому открыт; всё с помощником. */
export default async function CourseSettingsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/settings`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const { course, membership } = staff;
  const [topics, allowed, groups, selected, counts] = await Promise.all([
    listTopics(course.id), allowedGroupIds(user, membership), listGroups(course.orgId), listCourseGroupIds(course.id),
    db().query<{ topic_id: string; blocks: number; tasks: number }>(
      `SELECT t.id AS topic_id, count(b.id)::int AS blocks, count(b.id) FILTER (WHERE b.kind = 'assignment')::int AS tasks
       FROM topics t LEFT JOIN blocks b ON b.topic_id = t.id WHERE t.course_id = $1 GROUP BY t.id`, [course.id]),
  ]);
  const count = new Map(counts.rows.map((r) => [r.topic_id, r]));
  return (
    <CourseSetup
      course={course}
      fresh={firstParam((await searchParams).new) === '1'}
      org={membership.orgSlug}
      topics={topics.map((t) => ({ id: t.id, title: t.title, format: t.format, blocks: count.get(t.id)?.blocks ?? 0, tasks: count.get(t.id)?.tasks ?? 0 }))}
      groups={groups.filter((g) => allowed.includes(g.id)).map((g) => ({ id: g.id, title: g.title, students: g.studentCount }))}
      lockedGroups={groups.filter((g) => selected.includes(g.id) && !allowed.includes(g.id)).map((g) => ({ id: g.id, title: g.title, students: g.studentCount }))}
      selectedGroupIds={selected.filter((g) => allowed.includes(g))}
    />
  );
}
