import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { courseJournal } from '@/lib/lms/grading';
import { answersHref, courseEditorHref } from '@/lib/lms/links';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatusPill from '@/components/cabinet/StatusPill';
import EmptyState from '@/components/cabinet/EmptyState';
import { IconInbox } from '@/components/cabinet/icons';

/** Задания курса со счётчиками ответов: отсюда учитель идёт проверять. */
export default async function CourseAnswersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/answers`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const journal = await courseJournal(id);
  const rows = journal.assignments.map((a, i) => {
    const cells = journal.rows.map((r) => r.cells[i]);
    const count = (state: string) => cells.filter((c) => c?.state === state).length;
    return { ...a, submitted: count('submitted'), graded: count('graded'), returned: count('returned'), students: journal.rows.length };
  });
  return (
    <>
      <CabinetHeader title={`Ответы: ${staff.course.title}`} subtitle="Задания курса и сколько работ ждёт проверки" />
      {rows.length === 0 ? (
        <div className="cab-card">
          <EmptyState icon={<IconInbox size={24} />} text="В курсе пока нет заданий — добавьте блок «Задание» в редакторе.">
            <Link className="btn btn-primary" href={courseEditorHref(id)}>Открыть редактор</Link>
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Задание</th><th>Тема</th><th className="center">Баллов</th><th className="center">Ждут проверки</th>
                <th className="center">Проверено</th><th className="center">Возвращено</th><th className="actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.blockId}>
                  <td data-label="Задание"><Link href={answersHref(id, r.blockId)}>{r.title || 'Задание'}</Link></td>
                  <td data-label="Тема">{r.topicTitle}</td>
                  <td data-label="Баллов" className="center num">{r.points}</td>
                  <td data-label="Ждут проверки" className="center">
                    {r.submitted > 0 ? <StatusPill tone="warn">{r.submitted}</StatusPill> : <span className="muted">0</span>}
                  </td>
                  <td data-label="Проверено" className="center num">{r.graded} из {r.students}</td>
                  <td data-label="Возвращено" className="center num">{r.returned}</td>
                  <td className="actions">
                    <Link className={r.submitted > 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                      href={answersHref(id, r.blockId, { pending: r.submitted > 0 })}>
                      {r.submitted > 0 ? 'Проверить' : 'Открыть'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
