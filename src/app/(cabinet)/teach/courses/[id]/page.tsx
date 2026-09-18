import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { allowedGroupIds, staffCourse } from '@/lib/lms/access';
import { listCourseGroupIds, listTopics } from '@/lib/lms/courses';
import { existingSimulationIds, listBlocks, simulationTitles, staleSubmissionCount } from '@/lib/lms/blocks';
import { simulationIdsOf } from '@/lib/lms/block-schema';
import { listGroups } from '@/lib/org/groups';
import CourseEditor from '@/components/teach/CourseEditor';

export default async function CourseEditorPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const { course, membership } = staff;
  const topics = await listTopics(course.id);
  const wanted = firstParam((await searchParams).topic);
  const topic = topics.find((t) => t.id === wanted) ?? topics[0] ?? null;
  const blocks = topic ? await listBlocks(topic.id) : [];
  const simIds = blocks.flatMap((b) => simulationIdsOf(b.body));
  const [titles, existing, allowed, groups, selected, staleCounts] = await Promise.all([
    simulationTitles(simIds),
    existingSimulationIds(simIds),
    allowedGroupIds(user, membership),
    listGroups(course.orgId),
    listCourseGroupIds(course.id),
    Promise.all(blocks.filter((b) => b.body.kind === 'assignment')
      .map(async (b) => [b.id, await staleSubmissionCount(b.id)] as const)),
  ]);
  const option = (g: { id: string; title: string }) => ({ id: g.id, title: g.title });
  return (
    <CourseEditor
      course={course}
      topics={topics}
      activeTopicId={topic?.id ?? null}
      blocks={blocks}
      simulationTitles={Object.fromEntries(titles)}
      missingSimulations={simIds.filter((s) => !existing.has(s))}
      groups={groups.filter((g) => allowed.includes(g.id)).map(option)}
      lockedGroups={groups.filter((g) => selected.includes(g.id) && !allowed.includes(g.id)).map(option)}
      selectedGroupIds={selected.filter((g) => allowed.includes(g))}
      stale={Object.fromEntries(staleCounts)}
    />
  );
}
