import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { learnerCourse } from '@/lib/lms/access';
import { getTopic, listTopics, recordTopicView } from '@/lib/lms/courses';
import { existingSimulationIds, listBlocks } from '@/lib/lms/blocks';
import { listOwnSubmissions, type Submission } from '@/lib/lms/submissions';
import { simulationIdsOf, toStudentBody } from '@/lib/lms/block-schema';
import { toStudentSubmission } from '@/lib/lms/answers';
import { learnCourseHref, learnTopicHref } from '@/lib/lms/links';
import LessonBlock from '@/components/learn/LessonBlock';
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
  if (!preview) await recordTopicView(topic.id, user.id);

  const [blocks, topics] = await Promise.all([listBlocks(topic.id), listTopics(course.id)]);
  // Дальше в клиентские компоненты уходит только студенческий вид блока.
  const bodies = blocks.map((b) => ({ id: b.id, body: toStudentBody(b.body) }));
  const [existing, subs] = await Promise.all([
    existingSimulationIds(bodies.flatMap((b) => simulationIdsOf(b.body))),
    preview ? Promise.resolve(new Map<string, Submission>()) : listOwnSubmissions(user.id, blocks.map((b) => b.id)),
  ]);
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
    <div className="learn-lesson">
      <div className="learn-sticky">
        <div className="learn-sticky-row">
          <Link href={learnCourseHref(course.id, preview)} className="learn-sticky-course" title={course.title}>
            <IconBack size={16} /><span>{course.title}</span>
          </Link>
          <span className="learn-sticky-count">
            {`Тема ${index + 1} из ${topics.length}`}
            {assignmentIds.length > 0 && !preview && ` · задания ${doneCount}/${assignmentIds.length}`}
          </span>
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
          <span className="learn-eyebrow">{`Тема ${index + 1}`}</span>
          <h1>{topic.title}</h1>
        </header>
        {bodies.length === 0 && <p className="empty-state">В теме пока нет материалов.</p>}
        {bodies.map(({ id: blockId, body }) => {
          const simId = simulationIdsOf(body)[0];
          return (
            <LessonBlock key={blockId} blockId={blockId} body={body} preview={preview}
              missing={simId !== undefined && !existing.has(simId)}
              submission={toStudentSubmission(subs.get(blockId))} />
          );
        })}
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
