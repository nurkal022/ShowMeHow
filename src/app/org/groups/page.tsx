import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { listGroups } from '@/lib/org/groups';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import GroupsTable from '@/components/org/GroupsTable';
import CreateGroupForm from '@/components/org/CreateGroupForm';

export default async function OrgGroupsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/groups', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  return (
    <>
      <CabinetHeader title="Группы" subtitle={m.orgName} org={m.orgSlug} choices={ctx.cabinet.choices} />
      <section className="panel">
        <h2>Новая группа</h2>
        <CreateGroupForm slug={m.orgSlug} />
      </section>
      <GroupsTable groups={await listGroups(m.orgId)} org={m.orgSlug} />
    </>
  );
}
