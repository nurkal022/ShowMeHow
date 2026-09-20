import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { learnerCourse, staffCourse } from '@/lib/lms/access';
import { examFinished, examWindow, getTopic, listTopics, recordTopicView } from '@/lib/lms/courses';
import { existingSimulationIds, listBlocks } from '@/lib/lms/blocks';
import { listOwnSubmissions, type Submission } from '@/lib/lms/submissions';
import { revealFor, simulationIdsOf, toStudentBody } from '@/lib/lms/block-schema';
import { toStudentSubmission } from '@/lib/lms/answers';
import { listTopicProgress, type TopicProgress } from '@/lib/lms/learn';
import { listComments, viewedBlockIds } from '@/lib/lms/discussion';
import { listTutorMessages } from '@/lib/lms/tutor';
import { notesOfTopic } from '@/lib/lms/notes';
import { learnTopicHref } from '@/lib/lms/links';
import { ruPlural } from '@/lib/lms/format';
import LessonView, { type LessonBlockData } from '@/components/learn/LessonView';

/** Урок ученика: шаги, оглавление курса, обсуждение и наставник. Ключей к заданиям здесь нет. */
export default async function LearnTopicPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/learn/topics/${id}`);
  if (!user) return null;
  const topic = await getTopic(id);
  const sp = await searchParams;
  const ctx = topic ? await learnerCourse(user, topic.courseId, firstParam(sp.preview) === '1') : null;
  if (!topic || !ctx) notFound();
  const { course, preview } = ctx;
  const exam = topic.format === 'exam' && !preview;
  // Контрольная начинается с кнопки «Начать»: до неё тема не считается открытой и время не идёт.
  const startedBefore = exam ? (await examWindow(topic, user.id)).startedAt !== null : true;
  const begin = firstParam(sp.start) === '1';
  if (!preview && (!exam || startedBefore || begin)) await recordTopicView(topic.id, user.id);
  const window = exam ? await examWindow(topic, user.id) : null;
  const waiting = exam && !window?.startedAt;
  const finished = exam && window ? await examFinished(topic, user.id, window) : true;

  const [blocks, topicList] = await Promise.all([listBlocks(topic.id), listTopics(course.id)]);
  const blockIds = blocks.map((b) => b.id);
  const [existing, subs, progress, viewed, comments, tutor, notes, staff] = await Promise.all([
    existingSimulationIds(blocks.flatMap((b) => simulationIdsOf(b.body))),
    preview ? Promise.resolve(new Map<string, Submission>()) : listOwnSubmissions(user.id, blockIds),
    preview
      ? Promise.resolve(topicList.map((t): TopicProgress => ({
        topicId: t.id, title: t.title, viewed: false, blocksTotal: 0, assignmentsTotal: 0, assignmentsDone: 0,
        assignmentsReturned: 0, pointsEarned: 0, pointsMax: 0, state: 'none', dueAt: t.dueAt,
      })))
      : listTopicProgress(course.id, user.id),
    preview ? Promise.resolve(new Set<string>()) : viewedBlockIds(user.id, blockIds),
    listComments(topic.id),
    preview ? Promise.resolve([]) : listTutorMessages(user.id, topic.id),
    preview ? Promise.resolve([]) : notesOfTopic(user.id, topic.id),
    staffCourse(user, course.id),
  ]);

  const data: LessonBlockData[] = blocks.map((b) => {
    const body = toStudentBody(b.body, finished && b.body.kind === 'assignment' && revealFor(b.body.payload, subs.get(b.id)));
    const simId = simulationIdsOf(body)[0];
    return {
      id: b.id, body, missing: simId !== undefined && !existing.has(simId),
      submission: toStudentSubmission(subs.get(b.id), !finished),
    };
  });
  const index = topicList.findIndex((t) => t.id === topic.id);

  if (waiting) {
    const tasks = blocks.filter((b) => b.body.kind === 'assignment').length;
    return (
      <div className="learn-page learn-narrow">
        <section className="learn-exam-start">
          <span className="learn-eyebrow">Контрольная</span>
          <h2>{`${tasks} ${ruPlural(tasks, 'задание', 'задания', 'заданий')}${topic.timeLimitMin ? ` · ${topic.timeLimitMin} ${ruPlural(topic.timeLimitMin, 'минута', 'минуты', 'минут')}` : ''}`}</h2>
          <p className="muted">
            {topic.timeLimitMin ? 'Время пойдёт сразу после нажатия и не остановится, даже если закрыть вкладку. ' : ''}
            Баллы и правильные ответы откроются, когда вы сдадите все задания{topic.timeLimitMin ? ' или выйдет время' : ''}.
          </p>
          <Link className="btn btn-primary learn-exam-go" href={`${learnTopicHref(topic.id, false)}?start=1`}>Начать контрольную</Link>
        </section>
      </div>
    );
  }

  return (
    <LessonView
      course={{ id: course.id, title: course.title, subject: course.subject }}
      topic={{ id: topic.id, title: topic.title, index, format: topic.format, dueAt: topic.dueAt }}
      topics={progress}
      blocks={data}
      viewedIds={[...viewed]}
      preview={preview}
      exam={exam ? { deadline: window?.deadline ?? null, over: window?.over ?? false, finished } : null}
      comments={comments}
      tutorMessages={tutor}
      notes={notes}
      canDeleteAny={staff !== null}
      me={user.id}
    />
  );
}
