import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { courseProgress } from '@/lib/lms/grading';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import ProgressTable from '@/components/teach/ProgressTable';
import { getLocale, getT } from '@/i18n/server';
import { teachReview } from '@/i18n/messages/teach-review';

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/progress`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const t = await getT(teachReview);
  return (
    <>
      <CabinetHeader title={t('progressTitle', { title: staff.course.title })} subtitle={t('progressSub')} />
      <ProgressTable locale={await getLocale()} progress={await courseProgress(id)} />
    </>
  );
}
