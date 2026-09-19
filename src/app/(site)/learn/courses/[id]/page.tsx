import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { learnerCourse } from '@/lib/lms/access';
import { listTopics } from '@/lib/lms/courses';
import {
  continueTopicId, courseTeacherNames, listTopicProgress, progressTotals, type TopicProgress,
} from '@/lib/lms/learn';
import { learnTopicHref } from '@/lib/lms/links';
import { formatScore } from '@/lib/lms/format';
import Markup from '@/components/lms/Markup';
import { IconUser } from '@/components/icons';
import ProgressBar from '@/components/learn/ProgressBar';
import TopicStepper from '@/components/learn/TopicStepper';

export default async function LearnCoursePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/learn/courses/${id}`);
  if (!user) return null;
  const ctx = await learnerCourse(user, id, firstParam((await searchParams).preview) === '1');
  if (!ctx) notFound();
  const { course, preview } = ctx;
  // В режиме «Как видит ученик» прогресса нет: все темы «не начато».
  const [topics, teachers] = await Promise.all([
    preview
      ? listTopics(course.id).then((list): TopicProgress[] => list.map((t) => ({ dueAt: t.dueAt,
        topicId: t.id, title: t.title, viewed: false, blocksTotal: 0, assignmentsTotal: 0, assignmentsDone: 0,
        assignmentsReturned: 0, pointsEarned: 0, pointsMax: 0, state: 'none',
      })))
      : listTopicProgress(course.id, user.id),
    courseTeacherNames([course.id]),
  ]);
  const totals = progressTotals(topics);
  const continueId = continueTopicId(topics);
  const started = totals.topicsViewed > 0;
  const teacher = teachers.get(course.id);
  return (
    <div className="learn-page learn-narrow">
      {preview && <p className="warn-banner">Так курс видит ученик. Ответы в этом режиме не сохраняются.</p>}
      <Link href={preview ? `/teach/courses/${course.id}` : '/learn'} className="learn-back">
        {preview ? '← К редактору' : '← Мои курсы'}
      </Link>
      <header className="learn-hero">
        <div className="learn-hero-meta">
          {course.subject && <span className="chip">{course.subject}</span>}
          {teacher && <span className="learn-card-teacher"><IconUser size={14} />{teacher}</span>}
        </div>
        <h1>{course.title}</h1>
        {course.description && <Markup text={course.description} />}
        {!preview && topics.length > 0 && (
          <div className="learn-hero-progress">
            <ProgressBar label="Темы" value={totals.topicsViewed} total={totals.topicsTotal} />
            <ProgressBar label="Задания" value={totals.assignmentsDone} total={totals.assignmentsTotal} />
            <div className="learn-hero-side">
              {totals.pointsMax > 0 && (
                <span className="learn-points-big">
                  <strong>{formatScore(totals.pointsEarned)}</strong>{` из ${formatScore(totals.pointsMax)} баллов`}
                </span>
              )}
              {continueId && (
                <Link className="btn btn-primary" href={learnTopicHref(continueId, false)}>
                  {started ? 'Продолжить' : 'Начать курс'}
                </Link>
              )}
            </div>
          </div>
        )}
      </header>
      {topics.length === 0
        ? <p className="empty-state">В курсе пока нет тем.</p>
        : <TopicStepper topics={topics} currentId={preview ? null : continueId} preview={preview} />}
    </div>
  );
}
