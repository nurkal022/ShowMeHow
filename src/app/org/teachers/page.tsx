import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { listOrgPeople } from '@/lib/org/people';
import { userLabel } from '@/lib/auth/identifier';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { PeopleTable } from '@/components/admin/AdminTables';
import AddTeacherForm from '@/components/org/AddTeacherForm';
import MemberActions from '@/components/org/MemberActions';

export default async function OrgTeachersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/teachers', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const people = await listOrgPeople(m.orgId, ['org_admin', 'teacher']);
  return (
    <>
      <CabinetHeader title="Учителя" subtitle={m.orgName} org={m.orgSlug} choices={ctx.cabinet.choices} />
      <section className="panel">
        <h2>Добавить учителя</h2>
        <AddTeacherForm slug={m.orgSlug} />
      </section>
      <PeopleTable people={people} actions={(p) => (p.role === 'teacher'
        ? <MemberActions slug={m.orgSlug} userId={p.userId} label={userLabel(p)} disabled={p.disabled} canBlock canRemove />
        : null)} />
    </>
  );
}
