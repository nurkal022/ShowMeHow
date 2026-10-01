import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import OrgSettingsForm from '@/components/cabinet/OrgSettingsForm';
import { getT } from '@/i18n/server';
import { cabinet } from '@/i18n/messages/cabinet';

export default async function OrgSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/settings', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const t = await getT(cabinet);
  return (
    <>
      <CabinetHeader title={t('item_settings')} subtitle={m.orgName} org={m.orgSlug} choices={ctx.cabinet.choices} />
      <section className="panel">
        <OrgSettingsForm endpoint={`/api/org/${m.orgSlug}/settings`} settings={m.settings} />
      </section>
    </>
  );
}
