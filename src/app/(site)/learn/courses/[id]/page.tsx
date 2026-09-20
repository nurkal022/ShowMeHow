import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { learnerCourse } from '@/lib/lms/access';
import { listTopics } from '@/lib/lms/courses';
import { continueTopicId, courseTeacherNames, dueLabel, listTopicProgress, progressTotals, TOPIC_STATE_LABELS, type TopicProgress } from '@/lib/lms/learn';
import { blockCounts } from '@/lib/lms/blocks';
import { viewedCountsByTopic } from '@/lib/lms/discussion';
import { learnTopicHref } from '@/lib/lms/links';
import { coverStyle } from '@/lib/lms/covers';
import { formatScore, ruPlural } from '@/lib/lms/format';
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
      {preview && <p className="warn-banner">Так курс видит ученик. Ответы в этом режиме не сохраняются.</p>}
      <Link href={preview ? `/teach/courses/${course.id}` : '/learn'} className="learn-back">
        {preview ? '← К редактору' : '← Мои курсы'}
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
                {totals.topicsViewed > 0 ? 'Продолжить' : 'Начать курс'}<IconChevron size={16} />
              </Link>
            )}
            {!continueId && !preview && topics.length > 0 && <span className="lc-done"><IconCheck size={16} />Курс пройден</span>}
            <span className="muted">{topics.length} {ruPlural(topics.length, 'тема', 'темы', 'тем')} · {totals.assignmentsTotal} {ruPlural(totals.assignmentsTotal, 'задание', 'задания', 'заданий')}</span>
          </div>
        </div>
        {!preview && topics.length > 0 && (
          <div className="lc-hero-progress">
            <Ring value={percent} size={92} stroke={9} label={`Пройдено ${percent}% курса`} />
            <dl>
              <div><dt>тем пройдено</dt><dd>{totals.topicsDone} / {totals.topicsTotal}</dd></div>
              <div><dt>заданий сдано</dt><dd>{totals.assignmentsDone} / {totals.assignmentsTotal}</dd></div>
              {totals.pointsMax > 0 && <div><dt>баллов</dt><dd>{formatScore(totals.pointsEarned)} / {formatScore(totals.pointsMax)}</dd></div>}
            </dl>
          </div>
        )}
      </section>

      <section className="lc-syllabus">
        <header className="lc-syllabus-head">
          <h2>Программа курса</h2>
          {!preview && <span className="muted">Темы открыты все: можно идти по порядку или повторить пройденное</span>}
        </header>
        {topics.length === 0 ? <p className="empty-state">В курсе пока нет тем.</p> : (
          <ol className="lc-topics">
            {topics.map((t, i) => {
              const c = counts.get(t.topicId) ?? { blocks: 0, tasks: 0 };
              const seen = viewedSteps.get(t.topicId) ?? 0;
              const share = c.blocks ? Math.min(100, Math.round((seen / c.blocks) * 100)) : 0;
              const due = t.dueAt && t.state !== 'done' ? dueLabel(t.dueAt) : null;
              const here = t.topicId === continueId && !preview;
              return (
                <li key={t.topicId} className={`lc-topic ${t.state}${here ? ' next' : ''}`}>
                  <Link href={learnTopicHref(t.topicId, preview)}>
                    <span className="lc-topic-num">{t.state === 'done' ? <IconCheck size={15} /> : i + 1}</span>
                    <span className="lc-topic-body">
                      <span className="lc-topic-title">{t.title}{here && <span className="lc-badge">продолжить</span>}</span>
                      <span className="lc-topic-meta">
                        {!preview && <span className={`learn-state ${t.state}`}>{TOPIC_STATE_LABELS[t.state]}</span>}
                        <span className="muted">{c.blocks} {ruPlural(c.blocks, 'шаг', 'шага', 'шагов')}</span>
                        {c.tasks > 0 && <span className="muted"><IconTask size={13} />{t.assignmentsDone}/{c.tasks}</span>}
                        {due && <span className={`learn-due ${due.tone}`}>{due.text}</span>}
                        {t.assignmentsReturned > 0 && <span className="learn-state returned">на доработке</span>}
                        {t.pointsMax > 0 && t.state !== 'none' && <span className="muted">{formatScore(t.pointsEarned)} / {formatScore(t.pointsMax)} б.</span>}
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
