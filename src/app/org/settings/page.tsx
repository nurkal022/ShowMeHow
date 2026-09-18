import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import OrgSettingsForm from '@/components/cabinet/OrgSettingsForm';

export default async function OrgSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/settings', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  return (
    <>
      <CabinetHeader title="Настройки" subtitle={m.orgName} org={m.orgSlug} choices={ctx.cabinet.choices} />
      <section className="panel">
        <OrgSettingsForm endpoint={`/api/org/${m.orgSlug}/settings`} settings={m.settings} />
      </section>
    </>
  );
}
