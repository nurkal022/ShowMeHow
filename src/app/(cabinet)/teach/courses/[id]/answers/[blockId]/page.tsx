import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { staffBlock } from '@/lib/lms/access';
import { listBlockAnswers } from '@/lib/lms/submissions';
import { assignmentTitle } from '@/lib/lms/block-schema';
import { answersHref, courseEditorHref, neighbours } from '@/lib/lms/links';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import Markup from '@/components/lms/Markup';
import AnswerView from '@/components/lms/AnswerView';
import AnswersTable from '@/components/teach/AnswersTable';
import GradeForm from '@/components/teach/GradeForm';
import { formatScore } from '@/lib/lms/format';
import { getLocale, getT } from '@/i18n/server';
import { teachReview } from '@/i18n/messages/teach-review';

export default async function AnswersPage({ params, searchParams }: {
  params: Promise<{ id: string; blockId: string }>; searchParams: SearchParams;
}) {
  const { id, blockId } = await params;
  const user = await requirePageUser(answersHref(id, blockId));
  if (!user) return null;
  const staff = await staffBlock(user, blockId);
  if (!staff || staff.course.id !== id || staff.block.body.kind !== 'assignment') notFound();
  const payload = staff.block.body.payload;
  const sp = await searchParams;
  const t = await getT(teachReview);
  const locale = await getLocale();
  const pending = firstParam(sp.pending) === '1';
  const picked = firstParam(sp.s) ?? null;

  const rows = await listBlockAnswers(blockId, id);
  const shown = pending ? rows.filter((r) => r.submission?.status === 'submitted') : rows;
  const openable = shown.flatMap((r) => (r.submission && r.submission.status !== 'draft' ? [r.submission.id] : []));
  // «Проверить» без выбранной работы открывает первую непроверенную: лишнего клика быть не должно.
  const selected = picked ?? shown.find((r) => r.submission?.status === 'submitted')?.submission?.id ?? null;
  const current = shown.find((r) => r.submission?.id === selected) ?? null;
  const nav = neighbours(openable, selected);
  const href = (s: string | null) => answersHref(id, blockId, { pending, s });

  return (
    <>
      <CabinetHeader title={t('answersTitle', { title: assignmentTitle(payload.prompt) })} subtitle={`${staff.course.title} · ${staff.topic.title}`}>
        <Link className="btn btn-ghost" href={courseEditorHref(id, staff.topic.id)}>{t('toEditor')}</Link>
        <Link className={pending ? 'btn btn-secondary' : 'btn'} href={answersHref(id, blockId, { pending: !pending })}>
          {pending ? t('showAll') : t('onlyPending')}
        </Link>
      </CabinetHeader>
      <div className="grading">
        <AnswersTable locale={locale} rows={shown} points={payload.points} selectedId={selected} hrefFor={(s) => href(s)} dueAt={staff.topic.dueAt} />
        <section className="panel">
          {current?.submission ? (
            <>
              <h2>{current.student.name}</h2>
              <Markup text={payload.prompt} />
              <AnswerView spec={payload.spec} answer={current.submission.answer} />
              {current.submission.autoScore !== null && (
                <p className="muted">{t('autoCheck', { score: formatScore(current.submission.autoScore, locale), points: payload.points })}</p>
              )}
              {current.submission.blockRevision < staff.block.revision && (
                <p className="warn-banner">{t('staleBanner')}</p>
              )}
              {payload.reference && (
                <details className="reference-box">
                  <summary>{t('reference')}</summary>
                  <Markup text={payload.reference} />
                </details>
              )}
              <GradeForm key={current.submission.id} submissionId={current.submission.id} points={payload.points}
                score={current.submission.score} comment={current.submission.comment} rubric={payload.rubric}
                suggested={current.submission.autoScore}
                canSuggest={payload.spec.type === 'text' || payload.spec.type === 'table'}
                prevHref={nav.prev ? href(nav.prev) : null} nextAnyHref={nav.next ? href(nav.next) : null} />
            </>
          ) : (
            <p className="muted">{t('pickAnswer')}</p>
          )}
          <div className="row">
            {nav.prev && <Link className="btn btn-sm" href={href(nav.prev)}>{t('prev')}</Link>}
            <span className="spacer" />
            {nav.next && <Link className="btn btn-sm" href={href(nav.next)}>{t('next')}</Link>}
          </div>
        </section>
      </div>
    </>
  );
}
