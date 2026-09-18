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

  return (
    <div className="lesson">
      {preview && <p className="warn-banner">Так тему видит ученик. Ответы в этом режиме не сохраняются.</p>}
      <Link href={learnCourseHref(course.id, preview)} className="muted">{`← ${course.title}`}</Link>
      <h1>{topic.title}</h1>
      {bodies.length === 0 && <p className="empty-state">В теме пока нет материалов.</p>}
      {bodies.map(({ id: blockId, body }) => {
        const simId = simulationIdsOf(body)[0];
        return (
          <LessonBlock key={blockId} blockId={blockId} body={body} preview={preview}
            missing={simId !== undefined && !existing.has(simId)}
            submission={toStudentSubmission(subs.get(blockId))} />
        );
      })}
      <nav className="lesson-nav" aria-label="Темы курса">
        {prev ? <Link className="btn" href={learnTopicHref(prev.id, preview)}>{`← ${prev.title}`}</Link> : <span />}
        {next && <Link className="btn btn-primary" href={learnTopicHref(next.id, preview)}>{`${next.title} →`}</Link>}
      </nav>
    </div>
  );
}
