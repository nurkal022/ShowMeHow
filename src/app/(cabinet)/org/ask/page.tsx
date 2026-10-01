import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import AskBoard from '@/components/org/AskBoard';
import { getT } from '@/i18n/server';
import { orgAsk } from '@/i18n/messages/org-ask';

export default async function AskPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/ask', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const t = await getT(orgAsk);
  return (
    <>
      <CabinetHeader title={t('title')} subtitle={t('subtitle', { org: m.orgName })} />
      <AskBoard slug={m.orgSlug} />
    </>
  );
}
