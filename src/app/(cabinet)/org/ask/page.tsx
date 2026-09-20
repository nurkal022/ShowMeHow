import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import AskBoard from '@/components/org/AskBoard';

export default async function AskPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/ask', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  return (
    <>
      <CabinetHeader title="Спросить ИИ" subtitle={`${m.orgName} · вопрос обычными словами — ответ таблицей, графиком и выводом`} />
      <AskBoard slug={m.orgSlug} />
    </>
  );
}
