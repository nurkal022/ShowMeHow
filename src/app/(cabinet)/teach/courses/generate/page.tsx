import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { allowedGroupIds } from '@/lib/lms/access';
import { listGroups } from '@/lib/org/groups';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import CourseFromProgram from '@/components/teach/CourseFromProgram';
import { getT } from '@/i18n/server';
import { teachHome } from '@/i18n/messages/teach-home';

export default async function CourseFromProgramPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach/courses/generate', ['teacher'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const t = await getT(teachHome);
  const [allowed, groups] = await Promise.all([allowedGroupIds(ctx.user, m), listGroups(m.orgId)]);
  return (
    <>
      <CabinetHeader title={t('fromProgram')} subtitle={t('generateSub')} />
      <CourseFromProgram org={m.orgSlug} groups={groups.filter((g) => allowed.includes(g.id)).map((g) => ({ id: g.id, title: g.title }))} />
    </>
  );
}
