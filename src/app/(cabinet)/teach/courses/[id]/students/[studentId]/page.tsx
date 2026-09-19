import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { studentCard } from '@/lib/lms/analytics';
import { answersHref } from '@/lib/lms/links';
import { formatDate, formatScore } from '@/lib/lms/format';
import { ANSWER_STATE_LABELS } from '@/lib/lms/types';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatusPill from '@/components/cabinet/StatusPill';
import { stateTone } from '@/components/teach/AnswersTable';

export default async function StudentCardPage({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { id, studentId } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/students/${studentId}`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  const card = staff ? await studentCard(id, studentId) : null;
  if (!staff || !card) notFound();
  const topics = [...new Set(card.answers.map((a) => a.topicId))];
  const pct = card.total ? Math.round((card.done / card.total) * 100) : 0;
  return (
    <>
      <CabinetHeader title={card.name} subtitle={`${card.groups.join(', ')}${card.login ? ` · ${card.login}` : ''} · ${staff.course.title}`} />
      <div className="st-summary">
        <div className="st-ring" style={{ ['--p' as string]: `${card.avgPercent ?? 0}%` }}>
          <strong>{card.avgPercent === null ? '—' : `${card.avgPercent}%`}</strong><span>средний балл</span>
        </div>
        <dl className="st-facts">
          <div><dt>Сдано заданий</dt><dd>{`${card.done} из ${card.total}`}<span className="meter"><i style={{ width: `${pct}%` }} /></span></dd></div>
          <div><dt>Набрано баллов</dt><dd>{`${formatScore(card.earned)} из ${card.max}`}</dd></div>
          <div><dt>Последний раз в курсе</dt><dd>{card.lastActive ? formatDate(card.lastActive) : 'не заходил'}</dd></div>
        </dl>
      </div>
      {topics.map((tid) => {
        const rows = card.answers.filter((a) => a.topicId === tid);
        return (
          <section key={tid} className="cab-card">
            <header className="cab-card-head"><h2>{rows[0].topicTitle}</h2></header>
            <ul className="cab-list">
              {rows.map((r) => (
                <li key={r.blockId}>
                  <div>
                    <Link href={answersHref(id, r.blockId)}>{r.title}</Link>
                    <span className="muted">{r.typeLabel}{r.comment ? ` · «${r.comment.split('\n')[0].slice(0, 100)}»` : ''}</span>
                  </div>
                  <span className="st-cell">
                    {r.status === 'graded'
                      ? <strong className="num">{`${formatScore(r.score)} / ${r.points}`}</strong>
                      : <StatusPill tone={stateTone(r.status)}>{ANSWER_STATE_LABELS[r.status]}</StatusPill>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
