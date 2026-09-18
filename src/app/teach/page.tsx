import Link from 'next/link';
import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { listStaffCourses } from '@/lib/lms/courses';
import { allowedGroupIds } from '@/lib/lms/access';
import { listGroups } from '@/lib/org/groups';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import CoursesTable from '@/components/teach/CoursesTable';
import NewCourseForm from '@/components/teach/NewCourseForm';

export default async function TeachPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach', ['teacher'], searchParams);
  if (!ctx) return null;
  const { user } = ctx;
  const m = ctx.cabinet.membership;
  const isAdmin = m.role === 'org_admin';
  const [courses, allowed, groups] = await Promise.all([
    listStaffCourses(m.orgId, isAdmin ? null : user.id),
    allowedGroupIds(user, m),
    listGroups(m.orgId),
  ]);
  const mine = groups.filter((g) => allowed.includes(g.id));
  return (
    <>
      <CabinetHeader title="Преподавание" subtitle={m.orgName} org={m.orgSlug} choices={ctx.cabinet.choices} />
      <CoursesTable courses={courses} showOwner={isAdmin} />
      <section className="panel">
        <h2>Новый курс</h2>
        <NewCourseForm org={m.orgSlug} />
      </section>
      <section className="panel">
        <h2>{isAdmin ? 'Группы организации' : 'Мои группы'}</h2>
        {mine.length === 0
          ? <p className="muted">Вам пока не назначены группы. Их назначает администратор организации.</p>
          : (
            <ul className="topic-toc">
              {mine.map((g) => (
                <li key={g.id}>
                  <Link href={`/org/groups/${g.id}`}>{g.title}</Link>
                  <span className="muted">учеников: {g.studentCount}</span>
                  <Link className="btn btn-sm btn-ghost" href={`/org/groups/${g.id}/credentials`}>Лист паролей</Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
