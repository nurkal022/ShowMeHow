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
import { getT } from '@/i18n/server';
import { teachReview } from '@/i18n/messages/teach-review';

/** Задания курса со счётчиками ответов: отсюда учитель идёт проверять. */
export default async function CourseAnswersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/answers`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const t = await getT(teachReview);
  const journal = await courseJournal(id);
  const rows = journal.assignments.map((a, i) => {
    const cells = journal.rows.map((r) => r.cells[i]);
    const count = (state: string) => cells.filter((c) => c?.state === state).length;
    return { ...a, submitted: count('submitted'), graded: count('graded'), returned: count('returned'), students: journal.rows.length };
  });
  return (
    <>
      <CabinetHeader title={t('answersTitle', { title: staff.course.title })} subtitle={t('answersSub')} />
      {rows.length === 0 ? (
        <div className="cab-card">
          <EmptyState icon={<IconInbox size={24} />} text={t('answersEmpty')}>
            <Link className="btn btn-primary" href={courseEditorHref(id)}>{t('openEditor')}</Link>
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('assignment')}</th><th>{t('topic')}</th><th className="center">{t('points')}</th><th className="center">{t('awaiting')}</th>
                <th className="center">{t('graded')}</th><th className="center">{t('returned')}</th><th className="actions">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.blockId}>
                  <td data-label={t('assignment')}><Link href={answersHref(id, r.blockId)}>{r.title || t('assignment')}</Link></td>
                  <td data-label={t('topic')}>{r.topicTitle}</td>
                  <td data-label={t('points')} className="center num">{r.points}</td>
                  <td data-label={t('awaiting')} className="center">
                    {r.submitted > 0 ? <StatusPill tone="warn">{r.submitted}</StatusPill> : <span className="muted">0</span>}
                  </td>
                  <td data-label={t('graded')} className="center num">{t('ofMax', { a: r.graded, b: r.students })}</td>
                  <td data-label={t('returned')} className="center num">{r.returned}</td>
                  <td className="actions">
                    <Link className={r.submitted > 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                      href={answersHref(id, r.blockId, { pending: r.submitted > 0 })}>
                      {r.submitted > 0 ? t('review') : t('open')}
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
