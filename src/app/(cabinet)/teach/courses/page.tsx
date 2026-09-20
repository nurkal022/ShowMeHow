import Link from 'next/link';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { listStaffCourses } from '@/lib/lms/courses';
import { allowedGroupIds } from '@/lib/lms/access';
import { progressPercent, teachDashboard } from '@/lib/lms/overview';
import { listGroups } from '@/lib/org/groups';
import { answersHref, withOrgParam } from '@/lib/lms/links';
import { IconSpark } from '@/components/icons';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import NewCourseDialog from '@/components/cabinet/NewCourseDialog';
import CoursesBoard, { type BoardCourse } from '@/components/teach/CoursesBoard';

export default async function TeachCoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach/courses', ['teacher'], searchParams);
  if (!ctx) return null;
  const { user } = ctx;
  const m = ctx.cabinet.membership;
  const isAdmin = m.role === 'org_admin';
  const ownerId = isAdmin ? null : user.id;
  const sp = await searchParams;
  const [courses, allowed, orgGroups] = await Promise.all([listStaffCourses(m.orgId, ownerId), allowedGroupIds(user, m), listGroups(m.orgId)]);
  const d = await teachDashboard(m.orgId, ownerId, allowed);

  const rows: BoardCourse[] = courses.map((c) => {
    const p = d.progress[c.id];
    const pending = d.pendingBlocks.find((b) => b.courseId === c.id);
    return {
      id: c.id, title: c.title, subject: c.subject, status: c.status, groups: c.groupTitles,
      owner: isAdmin ? c.ownerLabel : null, topics: c.topicCount, students: p?.students ?? 0,
      percent: progressPercent(p), graded: p?.graded ?? 0, ungraded: c.ungraded, updatedAt: c.updatedAt,
      reviewHref: pending ? answersHref(c.id, pending.blockId, { pending: true }) : null,
    };
  });

  return (
    <>
      <CabinetHeader title={isAdmin ? 'Курсы организации' : 'Мои курсы'}
        subtitle={`${m.orgName} · ${courses.filter((c) => c.status !== 'archived').length} в работе`}>
        <Link className="btn ai-btn" href={withOrgParam('/teach/courses/generate', m.orgSlug)}><IconSpark size={16} />Курс из программы</Link>
        <NewCourseDialog org={m.orgSlug} openInitially={firstParam(sp.new) === '1'}
          groups={orgGroups.filter((g) => allowed.includes(g.id)).map((g) => ({ id: g.id, title: g.title }))} />
      </CabinetHeader>
      <CoursesBoard courses={rows} org={m.orgSlug} initialStatus={firstParam(sp.status) ?? 'all'} />
    </>
  );
}
