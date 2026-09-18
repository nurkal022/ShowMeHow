import Link from 'next/link';
import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { orgOverview } from '@/lib/org/orgs';
import { ORG_KIND_LABELS } from '@/lib/org/types';
import { withOrgParam } from '@/lib/lms/links';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { Stat, StatGrid } from '@/components/cabinet/Stat';

export default async function OrgOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const o = await orgOverview(m.orgId);
  return (
    <>
      <CabinetHeader title={m.orgName} subtitle={ORG_KIND_LABELS[m.orgKind]} org={m.orgSlug} choices={ctx.cabinet.choices} />
      <StatGrid>
        <Stat value={o.teachers} label="учителей" />
        <Stat value={o.students} label="учеников" />
        <Stat value={o.groups} label="групп" />
        <Stat value={o.courses} label="курсов" />
      </StatGrid>
      {o.groups === 0 && (
        <p className="empty-state">
          Пока нет групп. <Link href={withOrgParam('/org/groups', m.orgSlug)}>Создайте первую</Link> — например, «7А».
        </p>
      )}
      {o.teachers === 0 && (
        <p className="empty-state">
          Учителей пока нет. <Link href={withOrgParam('/org/teachers', m.orgSlug)}>Добавьте учителя</Link> — по почте или логину.
        </p>
      )}
    </>
  );
}
