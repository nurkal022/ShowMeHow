import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { courseProgress } from '@/lib/lms/grading';
import { courseEditorHref } from '@/lib/lms/links';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import ProgressTable from '@/components/teach/ProgressTable';

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/progress`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  return (
    <>
      <CabinetHeader title={`Прогресс: ${staff.course.title}`} subtitle="Какие темы ученики открывали">
        <Link className="btn btn-ghost" href={courseEditorHref(id)}>← К курсу</Link>
      </CabinetHeader>
      <ProgressTable progress={await courseProgress(id)} />
    </>
  );
}
