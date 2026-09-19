import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { learnerCourse } from '@/lib/lms/access';
import { examFinished, examWindow, getTopic, listTopics, recordTopicView } from '@/lib/lms/courses';
import { existingSimulationIds, listBlocks } from '@/lib/lms/blocks';
import { listOwnSubmissions, type Submission } from '@/lib/lms/submissions';
import { revealFor, simulationIdsOf, toStudentBody } from '@/lib/lms/block-schema';
import { toStudentSubmission } from '@/lib/lms/answers';
import { learnCourseHref, learnTopicHref } from '@/lib/lms/links';
import LessonBlock from '@/components/learn/LessonBlock';
import SlideDeck from '@/components/learn/SlideDeck';
import ExamTimer from '@/components/learn/ExamTimer';
import { ruPlural } from '@/lib/lms/format';
import { dueLabel } from '@/lib/lms/learn';
import { IconBack } from '@/components/icons';

export default async function LearnTopicPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/learn/topics/${id}`);
  if (!user) return null;
  const topic = await getTopic(id);
  const ctx = topic ? await learnerCourse(user, topic.courseId, firstParam((await searchParams).preview) === '1') : null;
  if (!topic || !ctx) notFound();
  const { course, preview } = ctx;
  const sp = await searchParams;
  const exam = topic.format === 'exam' && !preview;
  // Контрольная начинается с кнопки «Начать»: до неё тема не считается открытой и время не идёт.
  const startedBefore = exam ? (await examWindow(topic, user.id)).startedAt !== null : true;
  const begin = firstParam(sp.start) === '1';
  if (!preview && (!exam || startedBefore || begin)) await recordTopicView(topic.id, user.id);
  const window = exam ? await examWindow(topic, user.id) : null;
  const waiting = exam && !window?.startedAt;
  const finished = exam && window ? await examFinished(topic, user.id, window) : true;

  const [blocks, topics] = await Promise.all([listBlocks(topic.id), listTopics(course.id)]);
  const [existing, subs] = await Promise.all([
    existingSimulationIds(blocks.flatMap((b) => simulationIdsOf(b.body))),
    preview ? Promise.resolve(new Map<string, Submission>()) : listOwnSubmissions(user.id, blocks.map((b) => b.id)),
  ]);
  // Дальше в клиентские компоненты уходит только студенческий вид блока; ключ — лишь к проверенной работе.
  const bodies = blocks.map((b) => ({
    id: b.id,
    body: toStudentBody(b.body, finished && b.body.kind === 'assignment' && revealFor(b.body.payload, subs.get(b.id))),
  }));
  const index = topics.findIndex((t) => t.id === topic.id);
  const prev = topics[index - 1];
  const next = topics[index + 1];

  const assignmentIds = bodies.filter((b) => b.body.kind === 'assignment').map((b) => b.id);
  const doneCount = assignmentIds.filter((bid) => {
    const st = subs.get(bid)?.status;
    return st === 'submitted' || st === 'graded';
  }).length;
  const share = topics.length ? Math.round(((index + 1) / topics.length) * 100) : 0;

  return (
    <div className={`learn-lesson format-${topic.format}`}>
      <div className="learn-sticky">
        <div className="learn-sticky-row">
          <Link href={learnCourseHref(course.id, preview)} className="learn-sticky-course" title={course.title}>
            <IconBack size={16} /><span>{course.title}</span>
          </Link>
          <span className="learn-sticky-count">
            {`Тема ${index + 1} из ${topics.length}`}
            {assignmentIds.length > 0 && !preview && ` · задания ${doneCount}/${assignmentIds.length}`}
          </span>
          {exam && window?.deadline && !finished && <ExamTimer deadline={window.deadline} />}
          {topic.dueAt && !preview && doneCount < assignmentIds.length && (() => { const d = dueLabel(topic.dueAt); return <span className={`learn-due ${d.tone}`}>{d.text}</span>; })()}
          <span className="learn-sticky-nav">
            {prev
              ? <Link className="btn btn-sm btn-ghost" href={learnTopicHref(prev.id, preview)} aria-label={`Предыдущая тема: ${prev.title}`} title={prev.title}>←</Link>
              : <span className="btn btn-sm btn-ghost learn-off" aria-hidden="true">←</span>}
            {next
              ? <Link className="btn btn-sm btn-ghost" href={learnTopicHref(next.id, preview)} aria-label={`Следующая тема: ${next.title}`} title={next.title}>→</Link>
              : <span className="btn btn-sm btn-ghost learn-off" aria-hidden="true">→</span>}
          </span>
        </div>
        <div className="learn-sticky-bar" aria-hidden="true"><div style={{ width: `${share}%` }} /></div>
      </div>
      <div className="learn-column">
        {preview && <p className="warn-banner">Так тему видит ученик. Ответы в этом режиме не сохраняются.</p>}
        <header className="learn-lesson-head">
          <span className="learn-eyebrow">{`Тема ${index + 1}${topic.format === 'exam' ? ' · контрольная' : ''}`}</span>
          <h1>{topic.title}</h1>
        </header>
        {bodies.length === 0 && <p className="empty-state">В теме пока нет материалов.</p>}
        {(() => {
          const items = bodies.map(({ id: blockId, body }) => {
            const simId = simulationIdsOf(body)[0];
            return (
              <LessonBlock key={blockId} blockId={blockId} body={body} preview={preview || (exam && (window?.over ?? false))}
                missing={simId !== undefined && !existing.has(simId)}
                submission={toStudentSubmission(subs.get(blockId), !finished)} />
            );
          });
          if (waiting) {
            return (
              <section className="learn-exam-start">
                <span className="learn-eyebrow">Контрольная</span>
                <h2>{`${assignmentIds.length} ${ruPlural(assignmentIds.length, 'задание', 'задания', 'заданий')}${topic.timeLimitMin ? ` · ${topic.timeLimitMin} ${ruPlural(topic.timeLimitMin, 'минута', 'минуты', 'минут')}` : ''}`}</h2>
                <p className="muted">
                  {topic.timeLimitMin ? 'Время пойдёт сразу после нажатия и не остановится, даже если закрыть вкладку. ' : ''}
                  Баллы и правильные ответы откроются, когда вы сдадите все задания{topic.timeLimitMin ? ' или выйдет время' : ''}.
                </p>
                <Link className="btn btn-primary learn-exam-go" href={`${learnTopicHref(topic.id, false)}?start=1`}>Начать контрольную</Link>
              </section>
            );
          }
          return (
            <>
              {exam && window?.over && <p className="warn-banner">Время вышло. Ответы больше не принимаются — ниже ваши результаты.</p>}
              {exam && finished && !window?.over && <p className="ok-box">Все задания сданы — контрольная завершена. Ниже баллы и разбор.</p>}
              {topic.format === 'slides' ? <SlideDeck>{items}</SlideDeck> : items}
            </>
          );
        })()}
        <nav className="learn-lesson-nav" aria-label="Темы курса">
          {prev
            ? (
              <Link className="learn-nav-card" href={learnTopicHref(prev.id, preview)}>
                <span className="learn-eyebrow">← Назад</span><span>{prev.title}</span>
              </Link>
            )
            : <span />}
          {next
            ? (
              <Link className="learn-nav-card next" href={learnTopicHref(next.id, preview)}>
                <span className="learn-eyebrow">Дальше →</span><span>{next.title}</span>
              </Link>
            )
            : (
              <Link className="learn-nav-card next" href={learnCourseHref(course.id, preview)}>
                <span className="learn-eyebrow">Конец курса</span><span>К списку тем</span>
              </Link>
            )}
        </nav>
      </div>
    </div>
  );
}
