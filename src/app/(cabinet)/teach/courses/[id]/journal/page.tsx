import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { courseJournal } from '@/lib/lms/grading';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import JournalTable from '@/components/teach/JournalTable';
import { IconDownload } from '@/components/icons';
import { getLocale, getT } from '@/i18n/server';
import { teachReview } from '@/i18n/messages/teach-review';

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/journal`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const t = await getT(teachReview);
  return (
    <>
      <CabinetHeader title={t('journalTitle', { title: staff.course.title })} subtitle={t('journalSub')}>
        <a className="btn" href={`/api/teach/courses/${id}/journal`}><IconDownload size={16} />{t('downloadCsv')}</a>
      </CabinetHeader>
      <JournalTable locale={await getLocale()} journal={await courseJournal(id)} studentHref={(sid) => `/teach/courses/${id}/students/${sid}`} />
    </>
  );
}
