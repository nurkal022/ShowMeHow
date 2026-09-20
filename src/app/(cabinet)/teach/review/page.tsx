import Link from 'next/link';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { staffBlock } from '@/lib/lms/access';
import { listBlockAnswers } from '@/lib/lms/submissions';
import { reviewQueue } from '@/lib/lms/teach-home';
import { answersHref, courseEditorHref, withOrgParam } from '@/lib/lms/links';
import { formatAgo, formatScore, ruPlural } from '@/lib/lms/format';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import EmptyState from '@/components/cabinet/EmptyState';
import Markup from '@/components/lms/Markup';
import AnswerView from '@/components/lms/AnswerView';
import GradeForm from '@/components/teach/GradeForm';
import { Avatar } from '@/components/cabinet/viz';
import { IconCheck } from '@/components/icons';

/**
 * Общая очередь проверки: все сданные работы из всех курсов, от самой старой.
 * Слева очередь, справа работа и оценка; «Сохранить и к следующему» идёт по очереди.
 */
export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach/review', ['teacher'], searchParams);
  if (!ctx) return null;
  const { user } = ctx;
  const m = ctx.cabinet.membership;
  const ownerId = m.role === 'org_admin' ? null : user.id;
  const sp = await searchParams;
  const courseFilter = firstParam(sp.course) ?? '';
  const all = await reviewQueue(m.orgId, ownerId);
  const courses = [...new Map(all.map((i) => [i.courseId, i.course])).entries()];
  const queue = courseFilter ? all.filter((i) => i.courseId === courseFilter) : all;
  // Уже проверенная работа из адреса ушла из очереди — открываем первую оставшуюся.
  const picked = queue.findIndex((i) => i.id === firstParam(sp.s));
  const at = picked >= 0 ? picked : queue.length ? 0 : -1;
  const item = at >= 0 ? queue[at] : null;
  const selectedId = item?.id ?? null;
  const next = at >= 0 ? queue[at + 1] ?? queue.find((_, i) => i < at) ?? null : null;
  const prev = at > 0 ? queue[at - 1] : null;
  const href = (s: string | null, course = courseFilter) => {
    const q = new URLSearchParams();
    if (course) q.set('course', course);
    if (s) q.set('s', s);
    return withOrgParam(`/teach/review${q.size ? `?${q}` : ''}`, m.orgSlug);
  };

  const staff = item ? await staffBlock(user, item.blockId) : null;
  const payload = staff?.block.body.kind === 'assignment' ? staff.block.body.payload : null;
  const submission = item && staff && payload
    ? (await listBlockAnswers(item.blockId, item.courseId)).find((r) => r.submission?.id === item.id)?.submission ?? null
    : null;
  const oldest = all[0];

  return (
    <>
      <CabinetHeader title="Проверка работ"
        subtitle={all.length
          ? `${all.length} ${ruPlural(all.length, 'работа ждёт', 'работы ждут', 'работ ждут')} · самая давняя — ${formatAgo(oldest.submittedAt)}`
          : 'Все работы проверены'} />

      {all.length === 0 ? (
        <div className="cab-card review-done">
          <EmptyState icon={<IconCheck size={28} />} text="Очередь пуста — все сданные работы проверены. Отличная работа!">
            <Link className="btn" href={withOrgParam('/teach', m.orgSlug)}>На главную</Link>
          </EmptyState>
        </div>
      ) : (
        <div className="review">
          <aside className="cab-card review-queue">
            {courses.length > 1 && (
              <nav className="review-courses" aria-label="Курс">
                <Link href={href(null, '')} className={courseFilter ? '' : 'active'}>Все<span>{all.length}</span></Link>
                {courses.map(([id, title]) => (
                  <Link key={id} href={href(null, id)} className={courseFilter === id ? 'active' : ''}>
                    {title}<span>{all.filter((i) => i.courseId === id).length}</span>
                  </Link>
                ))}
              </nav>
            )}
            <ol className="review-list">
              {queue.map((i) => (
                <li key={i.id}>
                  <Link href={href(i.id)} className={i.id === selectedId ? 'active' : ''} aria-current={i.id === selectedId ? 'true' : undefined}
                    scroll={false}>
                    <Avatar name={i.student} size={30} />
                    <span className="review-item-text">
                      <b>{i.student}</b>
                      <span>{i.title}</span>
                      <small className="muted">{i.course} · {formatAgo(i.submittedAt)}{i.late ? ' · после срока' : ''}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </aside>

          <section className="cab-card review-work" key={item?.id}>
            {item && payload && submission ? (
              <>
                <header className="review-work-head">
                  <Avatar name={item.student} size={44} />
                  <div>
                    <h2>{item.student}</h2>
                    <span className="muted">{item.course} · {item.topic} · сдано {formatAgo(item.submittedAt)}</span>
                  </div>
                  <span className="review-pos">{at + 1} из {queue.length}</span>
                </header>
                {item.late && <p className="warn-banner">Работа сдана после срока.</p>}
                <div className="review-prompt"><Markup text={payload.prompt} /></div>
                <div className="review-answer"><AnswerView spec={payload.spec} answer={submission.answer} /></div>
                {submission.autoScore !== null && (
                  <p className="muted">{`Автопроверка: ${formatScore(submission.autoScore)} из ${payload.points}.`}</p>
                )}
                {staff && submission.blockRevision < staff.block.revision && (
                  <p className="warn-banner">Ответ сдан до правки задания. Пересчитать можно в редакторе курса.</p>
                )}
                {payload.reference && (
                  <details className="reference-box">
                    <summary>Эталонный ответ</summary>
                    <Markup text={payload.reference} />
                  </details>
                )}
                <GradeForm key={submission.id} submissionId={submission.id} points={payload.points}
                  score={submission.score} comment={submission.comment} rubric={payload.rubric}
                  suggested={submission.autoScore}
                  canSuggest={payload.spec.type === 'text' || payload.spec.type === 'table'}
                  nextHref={next ? href(next.id) : null}
                  prevHref={prev ? href(prev.id) : null} nextAnyHref={next ? href(next.id) : null} />
                <footer className="review-links">
                  <Link className="btn btn-sm btn-ghost" href={withOrgParam(answersHref(item.courseId, item.blockId), m.orgSlug)}>Все ответы на задание</Link>
                  {staff && <Link className="btn btn-sm btn-ghost" href={withOrgParam(courseEditorHref(item.courseId, staff.topic.id), m.orgSlug)}>Задание в редакторе</Link>}
                </footer>
              </>
            ) : (
              <EmptyState icon={<IconCheck size={24} />} text="Выберите работу в очереди слева." />
            )}
          </section>
        </div>
      )}
    </>
  );
}
