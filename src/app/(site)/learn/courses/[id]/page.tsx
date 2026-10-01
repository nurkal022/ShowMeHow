import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { learnerCourse } from '@/lib/lms/access';
import { listTopics } from '@/lib/lms/courses';
import { continueTopicId, courseTeacherNames, listTopicProgress, progressTotals, type TopicProgress } from '@/lib/lms/learn';
import { blockCounts } from '@/lib/lms/blocks';
import { viewedCountsByTopic } from '@/lib/lms/discussion';
import { learnTopicHref } from '@/lib/lms/links';
import { coverStyle } from '@/lib/lms/covers';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { learn } from '@/i18n/messages/learn';
import { learnHome } from '@/i18n/messages/learn-home';
import { learnDue, learnScore } from '@/components/learn/format';
import Markup from '@/components/lms/Markup';
import { Ring } from '@/components/cabinet/viz';
import { IconCheck, IconChevron, IconTask, IconUser } from '@/components/icons';

/** Страница курса ученика: обложка, прогресс и программа — с чего продолжить. */
export default async function LearnCoursePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/learn/courses/${id}`);
  if (!user) return null;
  const ctx = await learnerCourse(user, id, firstParam((await searchParams).preview) === '1');
  if (!ctx) notFound();
  const { course, preview } = ctx;
  const locale = await getLocale();
  const t = translator(learnHome, locale);
  const tl = translator(learn, locale);
  const score = (n: number) => learnScore(n, locale);
  const [topics, teachers, counts, viewedSteps] = await Promise.all([
    preview
      ? listTopics(course.id).then((list): TopicProgress[] => list.map((t) => ({
        topicId: t.id, title: t.title, viewed: false, blocksTotal: 0, assignmentsTotal: 0, assignmentsDone: 0,
        assignmentsReturned: 0, pointsEarned: 0, pointsMax: 0, state: 'none', dueAt: t.dueAt,
      })))
      : listTopicProgress(course.id, user.id),
    courseTeacherNames([course.id]),
    blockCounts(course.id),
    preview ? Promise.resolve(new Map<string, number>()) : viewedCountsByTopic(user.id, course.id),
  ]);
  const totals = progressTotals(topics);
  const continueId = continueTopicId(topics);
  const percent = totals.topicsTotal ? Math.round((totals.topicsDone / totals.topicsTotal) * 100) : 0;
  const teacher = teachers.get(course.id);

  return (
    <div className="lc">
      {preview && <p className="warn-banner">{t('previewCourse')}</p>}
      <Link href={preview ? `/teach/courses/${course.id}` : '/learn'} className="learn-back">
        {preview ? t('toEditor') : t('myCourses')}
      </Link>

      <section className="lc-hero">
        <div className="lc-hero-cover" style={coverStyle(course.subject || course.title)} aria-hidden="true">
          <span className="course-tile-glyph">{(course.subject || course.title).slice(0, 1).toUpperCase()}</span>
        </div>
        <div className="lc-hero-text">
          <div className="lc-hero-meta">
            {course.subject && <span className="chip">{course.subject}</span>}
            {course.grade && <span className="chip">{course.grade}</span>}
            {teacher && <span className="learn-card-teacher"><IconUser size={14} />{teacher}</span>}
          </div>
          <h1>{course.title}</h1>
          {course.description && <div className="lc-about"><Markup text={course.description} /></div>}
          <div className="lc-hero-actions">
            {continueId && !preview && (
              <Link className="btn btn-primary btn-lg" href={learnTopicHref(continueId, false)}>
                {totals.topicsViewed > 0 ? tl('continue') : t('startCourse')}<IconChevron size={16} />
              </Link>
            )}
            {!continueId && !preview && topics.length > 0 && <span className="lc-done"><IconCheck size={16} />{t('courseCompleted')}</span>}
            <span className="muted">{tl('topicsN', { n: topics.length })} · {tl('tasksN', { n: totals.assignmentsTotal })}</span>
          </div>
        </div>
        {!preview && topics.length > 0 && (
          <div className="lc-hero-progress">
            <Ring value={percent} size={92} stroke={9} label={t('ringLabel', { p: percent })} />
            <dl>
              <div><dt>{t('dtTopicsDone')}</dt><dd>{totals.topicsDone} / {totals.topicsTotal}</dd></div>
              <div><dt>{t('dtTasksDone')}</dt><dd>{totals.assignmentsDone} / {totals.assignmentsTotal}</dd></div>
              {totals.pointsMax > 0 && <div><dt>{t('dtPoints')}</dt><dd>{score(totals.pointsEarned)} / {score(totals.pointsMax)}</dd></div>}
            </dl>
          </div>
        )}
      </section>

      <section className="lc-syllabus">
        <header className="lc-syllabus-head">
          <h2>{t('syllabus')}</h2>
          {!preview && <span className="muted">{t('syllabusHint')}</span>}
        </header>
        {topics.length === 0 ? <p className="empty-state">{t('noTopics')}</p> : (
          <ol className="lc-topics">
            {topics.map((tp, i) => {
              const c = counts.get(tp.topicId) ?? { blocks: 0, tasks: 0 };
              const seen = viewedSteps.get(tp.topicId) ?? 0;
              const share = c.blocks ? Math.min(100, Math.round((seen / c.blocks) * 100)) : 0;
              const due = tp.dueAt && tp.state !== 'done' ? learnDue(tp.dueAt, locale) : null;
              const here = tp.topicId === continueId && !preview;
              return (
                <li key={tp.topicId} className={`lc-topic ${tp.state}${here ? ' next' : ''}`}>
                  <Link href={learnTopicHref(tp.topicId, preview)}>
                    <span className="lc-topic-num">{tp.state === 'done' ? <IconCheck size={15} /> : i + 1}</span>
                    <span className="lc-topic-body">
                      <span className="lc-topic-title">{tp.title}{here && <span className="lc-badge">{t('badgeContinue')}</span>}</span>
                      <span className="lc-topic-meta">
                        {!preview && <span className={`learn-state ${tp.state}`}>{tl(`state_${tp.state}`)}</span>}
                        <span className="muted">{tl('stepsN', { n: c.blocks })}</span>
                        {c.tasks > 0 && <span className="muted"><IconTask size={13} />{tp.assignmentsDone}/{c.tasks}</span>}
                        {due && <span className={`learn-due ${due.tone}`}>{due.text}</span>}
                        {tp.assignmentsReturned > 0 && <span className="learn-state returned">{tl('onRevision')}</span>}
                        {tp.pointsMax > 0 && tp.state !== 'none' && <span className="muted">{tl('pointsShort', { a: score(tp.pointsEarned), b: score(tp.pointsMax) })}</span>}
                      </span>
                      {!preview && share > 0 && <span className="lv-bar sm"><i style={{ width: `${share}%` }} /></span>}
                    </span>
                    <IconChevron size={18} />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
