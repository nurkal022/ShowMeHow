import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { canManageGroup, requireOrgRole } from '@/lib/org/access';
import { getGroup, listGroups, listGroupStudents, listGroupTeachers, type GroupSummary } from '@/lib/org/groups';
import { getOrgById } from '@/lib/org/orgs';
import { listOrgPeople, type OrgPerson } from '@/lib/org/people';
import { userLabel } from '@/lib/auth/identifier';
import { withOrgParam } from '@/lib/lms/links';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StudentsTable from '@/components/org/StudentsTable';
import MemberActions from '@/components/org/MemberActions';
import BulkStudents from '@/components/org/BulkStudents';
import GroupTeachers from '@/components/org/GroupTeachers';
import GroupAdminActions from '@/components/org/GroupAdminActions';
import { IconPrint } from '@/components/icons';

/** Админ организации — всё; учитель группы — список учеников, сброс пароля и лист. */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/org/groups/${id}`);
  if (!user) return null;
  if (!(await canManageGroup(user, id))) notFound();
  const group = await getGroup(id);
  const org = group ? await getOrgById(group.orgId) : null;
  if (!group || !org) notFound();
  const isAdmin = (await requireOrgRole(user, org.id, ['org_admin'])) !== null;
  const [students, teachers, staff, groups] = await Promise.all([
    listGroupStudents(group.id),
    listGroupTeachers(group.id),
    isAdmin ? listOrgPeople(org.id, ['org_admin', 'teacher']) : Promise.resolve([] as OrgPerson[]),
    isAdmin ? listGroups(org.id) : Promise.resolve([] as GroupSummary[]),
  ]);
  const moveTargets = groups.filter((g) => g.id !== group.id).map((g) => ({ id: g.id, title: g.title }));
  return (
    <>
      <CabinetHeader title={`Группа ${group.title}`} subtitle={org.name}>
        {isAdmin && <Link className="btn btn-ghost" href={withOrgParam('/org/groups', org.slug)}>← Все группы</Link>}
        <Link className="btn" href={`/org/groups/${group.id}/credentials`}><IconPrint size={16} />Лист паролей</Link>
        {isAdmin && <GroupAdminActions slug={org.slug} groupId={group.id} title={group.title} />}
      </CabinetHeader>

      <section className="panel">
        <h2>Учителя группы</h2>
        {isAdmin
          ? <GroupTeachers slug={org.slug} groupId={group.id} assigned={teachers}
              candidates={staff.map((p) => ({ userId: p.userId, label: userLabel(p) }))} />
          : <p>{teachers.map((t) => t.label).join(', ') || 'не назначены'}</p>}
      </section>

      {isAdmin && (
        <section className="panel">
          <h2>Добавить учеников</h2>
          <BulkStudents slug={org.slug} groupId={group.id} />
        </section>
      )}

      <section className="panel">
        <h2>Ученики ({students.length})</h2>
        {students.length === 0
          ? <p className="empty-state">
              В группе пока нет учеников. {isAdmin
                ? 'Вставьте список выше — по одному человеку на строку.'
                : 'Их добавляет администратор организации.'}
            </p>
          : <StudentsTable students={students} actions={(s) => (
              <MemberActions slug={org.slug} userId={s.userId} label={s.displayName} disabled={s.disabled}
                groupId={group.id} canBlock={isAdmin} moveTargets={isAdmin ? moveTargets : undefined} />
            )} />}
      </section>
    </>
  );
}
