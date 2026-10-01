import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentCourses } from '@/lib/lms/courses';
import { continueTopicId, courseTeacherNames, listTopicProgress, progressTotals } from '@/lib/lms/learn';
import { activityDays, recentTopics, weekPulse } from '@/lib/lms/student-home';
import { streakOf } from '@/lib/lms/achievements';
import { studentToday } from '@/lib/lms/today';
import { learnTopicHref } from '@/lib/lms/links';
import { coverStyle } from '@/lib/lms/covers';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { learn } from '@/i18n/messages/learn';
import { learnHome } from '@/i18n/messages/learn-home';
import { learnDue, learnScore } from '@/components/learn/format';
import { userLabel } from '@/lib/auth/identifier';
import ActivityGrid from '@/components/learn/ActivityGrid';
import CourseCard from '@/components/learn/CourseCard';
import { IconChevron, IconCourses, IconHistory, IconPlay, IconTask } from '@/components/icons';

function greeting(): 'greetNight' | 'greetMorning' | 'greetDay' | 'greetEvening' {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Almaty' }));
  return h < 5 ? 'greetNight' : h < 12 ? 'greetMorning' : h < 18 ? 'greetDay' : 'greetEvening';
}

/** Моё обучение — первый экран ученика: где остановился, ритм занятий, сроки и курсы. */
export default async function LearnPage() {
  const user = await requirePageUser('/learn');
  if (!user) return null;
  const locale = await getLocale();
  const t = translator(learnHome, locale);
  const tl = translator(learn, locale);
  const cards = await listStudentCourses(user.id);
  const has = cards.length > 0;
  const [teachers, progress, today, recent, activity, pulse] = await Promise.all([
    courseTeacherNames(cards.map((c) => c.course.id)),
    Promise.all(cards.map((c) => listTopicProgress(c.course.id, user.id))),
    has ? studentToday(user.id) : Promise.resolve(null),
    has ? recentTopics(user.id, 4) : Promise.resolve([]),
    has ? activityDays(user.id) : Promise.resolve([]),
    has ? weekPulse(user.id) : Promise.resolve({ submitted: 0, steps: 0, points: 0 }),
  ]);
  const name = (user.displayName ?? userLabel(user)).split(' ').slice(-1)[0];
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' });
  const streak = streakOf(activity.filter((a) => a.count > 0).map((a) => a.date), day);
  const active = cards
    .map((c, i) => ({ card: c, totals: progressTotals(progress[i]), continueId: continueTopicId(progress[i]) }))
    .filter((x) => x.continueId !== null)
    .sort((a, b) => Number(b.totals.topicsViewed > 0) - Number(a.totals.topicsViewed > 0));
  const soon = today?.due[0] ? learnDue(today.due[0].dueAt, locale) : null;

  if (!has) {
    return (
      <div className="learn-page">
        <header className="learn-head">
          <div>
            <h1>{t('myLearning')}</h1>
            <p className="muted">{t('emptySub')}</p>
          </div>
        </header>
        <div className="learn-empty">
          <span className="learn-empty-icon"><IconCourses size={28} /></span>
          <h2>{t('noCourses')}</h2>
          <p>{t('noCoursesText')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="learn-page lh">
      <header className="learn-head">
        <div>
          <h1>{t('greeting', { greet: t(greeting()), name })}</h1>
          <p className="muted">
            {soon
              ? t('nearestDue', { topic: today?.due[0].topicTitle, due: soon.text })
              : pulse.submitted > 0
                ? t('weekSubmitted', { n: pulse.submitted })
                : t('noDeadlines')}
          </p>
        </div>
      </header>

      <section className="lh-top">
        <div className="lh-top-main">
          {today?.continueAt
            ? (
              <Link className="lh-continue" href={learnTopicHref(today.continueAt.topicId, false)}>
                <span className="lh-continue-eyebrow"><IconPlay size={13} />{t('continueSame')}</span>
                <strong>{today.continueAt.topicTitle}</strong>
                <span className="lh-continue-sub">
                  {today.continueAt.courseTitle}
                  {today.continueAt.left > 0
                    ? t('leftTasks', { n: today.continueAt.left })
                    : t('allSubmitted')}
                </span>
                <span className="lh-continue-go" aria-hidden="true"><IconChevron size={20} /></span>
              </Link>
            )
            : (
              <div className="lh-continue flat">
                <span className="lh-continue-eyebrow">{t('whereStart')}</span>
                <strong>{t('allTopicsDone')}</strong>
                <span className="lh-continue-sub">{t('lookCatalog')}</span>
              </div>
            )}
          <dl className="lh-pulse">
            <div><dt>{t('pulseSubmitted')}</dt><dd>{pulse.submitted}</dd></div>
            <div><dt>{t('pulseSteps')}</dt><dd>{pulse.steps}</dd></div>
            <div><dt>{t('pulsePoints')}</dt><dd>{learnScore(pulse.points, locale)}</dd></div>
          </dl>
        </div>
        <ActivityGrid days={activity} streak={streak.current} bestStreak={streak.best} today={day} />
      </section>

      {today && (today.due.length > 0 || today.results.length > 0) && (
        <section className="lh-cols" aria-label={t('dueResultsAria')}>
          {today.due.length > 0 && (
            <div className="today-card">
              <h2><IconTask size={16} />{t('toSubmit')}</h2>
              <ul className="today-list">
                {today.due.map((d) => {
                  const lab = learnDue(d.dueAt, locale);
                  return (
                    <li key={d.topicId}>
                      <Link href={learnTopicHref(d.topicId, false)}>
                        <span className="today-list-main"><strong>{d.topicTitle}</strong><span>{`${d.courseTitle} · ${tl('tasksN', { n: d.left })}`}</span></span>
                        <span className={`learn-due ${lab.tone}`}>{lab.text}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {today.results.length > 0 && (
            <div className="today-card">
              <h2><IconHistory size={16} />{t('checkedRecently')}</h2>
              <ul className="today-list">
                {today.results.map((r) => (
                  <li key={r.blockId}>
                    <Link href={`${learnTopicHref(r.topicId, false)}#block-${r.blockId}`}>
                      <span className="today-list-main">
                        <strong>{r.task}</strong>
                        <span>{r.comment ? `«${r.comment.split('\n')[0].slice(0, 90)}»` : r.courseTitle}</span>
                      </span>
                      {r.status === 'returned'
                        ? <span className="learn-due soon">{t('toRevision')}</span>
                        : <span className={`today-score ${r.score !== null && r.score >= r.points ? 'full' : r.score ? 'part' : 'zero'}`}>{`${learnScore(r.score, locale)}/${r.points}`}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {recent.length > 0 && (
        <section className="lh-recent" aria-label={t('recentSteps')}>
          <h2 className="learn-section-title"><IconHistory size={17} />{t('recentSteps')}</h2>
          <ul className="lh-recent-list">
            {recent.map((r, i) => {
              const share = r.total ? Math.min(100, Math.round((r.seen / r.total) * 100)) : 0;
              return (
                <li key={r.topicId} style={{ animationDelay: `${i * 60}ms` }}>
                  <Link href={learnTopicHref(r.topicId, false)}>
                    <span className="lh-recent-cover" style={coverStyle(r.subject || r.courseTitle)} aria-hidden="true">
                      {(r.subject || r.courseTitle).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="lh-recent-text">
                      <b>{r.topicTitle}</b>
                      <small>{r.courseTitle}</small>
                      <span className="lv-bar sm"><i style={{ width: `${share}%` }} /></span>
                    </span>
                    <span className="muted lh-recent-share">{tl('ofTotal', { a: r.seen, b: r.total })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label={t('activeCourses')}>
        <div className="lh-section-head">
          <h2 className="learn-section-title"><IconCourses size={17} />{t('activeCourses')}</h2>
          <Link className="btn btn-sm" href="/learn/catalog">{t('wholeCatalog')}<IconChevron size={15} /></Link>
        </div>
        {active.length === 0
          ? <p className="empty-state">{t('allCoursesDone')}</p>
          : (
            <div className="learn-cards">
              {active.slice(0, 3).map((x) => (
                <CourseCard key={x.card.course.id} course={x.card.course} teacher={teachers.get(x.card.course.id) ?? null}
                  totals={x.totals} continueId={x.continueId} />
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
