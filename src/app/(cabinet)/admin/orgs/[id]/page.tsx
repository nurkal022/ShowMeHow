import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/http/page-guards';
import { getOrgById, orgOverview } from '@/lib/org/orgs';
import { listOrgPeople } from '@/lib/org/people';
import { listGroups } from '@/lib/org/groups';
import { ORG_KIND_LABELS } from '@/lib/org/types';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { Stat, StatGrid } from '@/components/cabinet/Stat';
import OrgSettingsForm from '@/components/cabinet/OrgSettingsForm';
import OrgArchiveButton from '@/components/admin/OrgArchiveButton';
import { PeopleTable } from '@/components/admin/AdminTables';

export default async function AdminOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage('/admin/orgs');
  if (!user) return null;
  const { id } = await params;
  const org = await getOrgById(id);
  if (!org) notFound();
  const [overview, people, groups] = await Promise.all([
    orgOverview(org.id), listOrgPeople(org.id, ['org_admin', 'teacher', 'student']), listGroups(org.id),
  ]);
  return (
    <>
      <CabinetHeader title={org.name}
        subtitle={`${ORG_KIND_LABELS[org.kind]} · слаг ${org.slug}${org.archivedAt ? ' · в архиве' : ''}`}>
        <Link className="btn" href={`/org?org=${org.slug}`}>Открыть кабинет организации</Link>
        <OrgArchiveButton orgId={org.id} archived={org.archivedAt !== null} />
      </CabinetHeader>
      <StatGrid>
        <Stat value={overview.admins} label="администраторов" />
        <Stat value={overview.teachers} label="учителей" />
        <Stat value={overview.students} label="учеников" />
        <Stat value={overview.groups} label="групп" />
        <Stat value={overview.courses} label="курсов" />
      </StatGrid>
      <section className="panel">
        <h2>Настройки</h2>
        <OrgSettingsForm endpoint={`/api/admin/orgs/${org.id}`} settings={org.settings} />
      </section>
      <section className="panel">
        <h2>Группы</h2>
        {groups.length === 0
          ? <p className="muted">Групп пока нет. Их заводит администратор организации в своём кабинете.</p>
          : <p>{groups.map((g) => `${g.title} (${g.studentCount})`).join(', ')}</p>}
      </section>
      <section className="panel">
        <h2>Участники</h2>
        <PeopleTable people={people} />
      </section>
    </>
  );
}
