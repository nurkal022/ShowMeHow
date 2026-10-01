import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/http/page-guards';
import { getOrgById, orgOverview } from '@/lib/org/orgs';
import { listOrgPeople } from '@/lib/org/people';
import { listGroups } from '@/lib/org/groups';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { Stat, StatGrid } from '@/components/cabinet/Stat';
import OrgSettingsForm from '@/components/cabinet/OrgSettingsForm';
import OrgArchiveButton from '@/components/admin/OrgArchiveButton';
import { PeopleTable } from '@/components/admin/AdminTables';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { admin } from '@/i18n/messages/admin';
import { cabinet } from '@/i18n/messages/cabinet';

export default async function AdminOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage('/admin/orgs');
  if (!user) return null;
  const { id } = await params;
  const org = await getOrgById(id);
  if (!org) notFound();
  const [overview, people, groups] = await Promise.all([
    orgOverview(org.id), listOrgPeople(org.id, ['org_admin', 'teacher', 'student']), listGroups(org.id),
  ]);
  const locale = await getLocale();
  const t = translator(admin, locale);
  const kind = translator(cabinet, locale)(`kind_${org.kind}`);
  return (
    <>
      <CabinetHeader title={org.name}
        subtitle={t(org.archivedAt ? 'orgSubArchived' : 'orgSub', { kind, slug: org.slug })}>
        <Link className="btn" href={`/org?org=${org.slug}`}>{t('openOrgCabinet')}</Link>
        <OrgArchiveButton orgId={org.id} archived={org.archivedAt !== null} />
      </CabinetHeader>
      <StatGrid>
        <Stat value={overview.admins} label={t('st_admins')} />
        <Stat value={overview.teachers} label={t('st_teachers')} />
        <Stat value={overview.students} label={t('st_students')} />
        <Stat value={overview.groups} label={t('st_groups')} />
        <Stat value={overview.courses} label={t('st_courses')} />
      </StatGrid>
      <section className="panel">
        <h2>{t('settings')}</h2>
        <OrgSettingsForm endpoint={`/api/admin/orgs/${org.id}`} settings={org.settings} />
      </section>
      <section className="panel">
        <h2>{t('groups')}</h2>
        {groups.length === 0
          ? <p className="muted">{t('noGroups')}</p>
          : <p>{groups.map((g) => `${g.title} (${g.studentCount})`).join(', ')}</p>}
      </section>
      <section className="panel">
        <h2>{t('members')}</h2>
        <PeopleTable people={people} locale={locale} />
      </section>
    </>
  );
}
