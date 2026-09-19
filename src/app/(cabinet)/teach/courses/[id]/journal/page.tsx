import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { courseJournal } from '@/lib/lms/grading';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import JournalTable from '@/components/teach/JournalTable';
import { IconDownload } from '@/components/icons';

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/journal`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  return (
    <>
      <CabinetHeader title={`Журнал: ${staff.course.title}`} subtitle="В клетке — балл после проверки или статус работы">
        <a className="btn" href={`/api/teach/courses/${id}/journal`}><IconDownload size={16} />Скачать CSV</a>
      </CabinetHeader>
      <JournalTable journal={await courseJournal(id)} studentHref={(sid) => `/teach/courses/${id}/students/${sid}`} />
    </>
  );
}
