import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentCourses } from '@/lib/lms/courses';
import { continueTopicId, courseTeacherNames, listTopicProgress, progressTotals } from '@/lib/lms/learn';
import CourseCard from '@/components/learn/CourseCard';
import { IconCourses } from '@/components/icons';
import { studentToday } from '@/lib/lms/today';
import { studentAchievements } from '@/lib/lms/achievements';
import Achievements from '@/components/learn/Achievements';
import { dueLabel } from '@/lib/lms/learn';
import { learnTopicHref } from '@/lib/lms/links';
import { formatScore, ruPlural } from '@/lib/lms/format';
import { userLabel } from '@/lib/auth/identifier';

function greeting(): string {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Almaty' }));
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

export default async function LearnPage() {
  const user = await requirePageUser('/learn');
  if (!user) return null;
  const cards = await listStudentCourses(user.id);
  const [teachers, progress, today] = await Promise.all([
    courseTeacherNames(cards.map((c) => c.course.id)),
    Promise.all(cards.map((c) => listTopicProgress(c.course.id, user.id))),
    cards.length > 0 ? studentToday(user.id) : Promise.resolve(null),
  ]);
  const achievements = cards.length > 0 ? await studentAchievements(user.id) : null;
  const name = (user.displayName ?? userLabel(user)).split(' ').slice(-1)[0];
  return (
    <div className="learn-page">
      <header className="learn-head">
        <div>
          <h1>{today ? `${greeting()}, ${name}` : 'Мои курсы'}</h1>
          <p className="muted">{today
            ? today.doneThisWeek > 0 ? `За эту неделю сдано ${today.doneThisWeek} ${ruPlural(today.doneThisWeek, 'задание', 'задания', 'заданий')} — так держать.` : 'Вот что сейчас важно.'
            : 'Здесь появятся курсы вашей группы.'}</p>
        </div>
        <Link className="btn" href="/learn/grades">Мои оценки</Link>
      </header>
      {today && (today.continueAt || today.due.length > 0 || today.results.length > 0) && (
        <section className="today" aria-label="Сегодня">
          {today.continueAt && (
            <Link className="today-continue" href={learnTopicHref(today.continueAt.topicId, false)}>
              <span className="today-eyebrow">Продолжить</span>
              <strong>{today.continueAt.topicTitle}</strong>
              <span>{today.continueAt.courseTitle}{today.continueAt.left > 0 ? ` · осталось ${today.continueAt.left} ${ruPlural(today.continueAt.left, 'задание', 'задания', 'заданий')}` : ' · всё сдано'}</span>
              <span className="today-go" aria-hidden="true">→</span>
            </Link>
          )}
          {today.due.length > 0 && (
            <div className="today-card">
              <h2>Сдать</h2>
              <ul className="today-list">
                {today.due.map((d) => {
                  const lab = dueLabel(d.dueAt);
                  return (
                    <li key={d.topicId}>
                      <Link href={learnTopicHref(d.topicId, false)}>
                        <span className="today-list-main"><strong>{d.topicTitle}</strong><span>{`${d.courseTitle} · ${d.left} ${ruPlural(d.left, 'задание', 'задания', 'заданий')}`}</span></span>
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
              <h2>Проверено недавно</h2>
              <ul className="today-list">
                {today.results.map((r) => (
                  <li key={r.blockId}>
                    <Link href={`${learnTopicHref(r.topicId, false)}#block-${r.blockId}`}>
                      <span className="today-list-main">
                        <strong>{r.task}</strong>
                        <span>{r.comment ? `«${r.comment.split('\n')[0].slice(0, 90)}»` : r.courseTitle}</span>
                      </span>
                      {r.status === 'returned'
                        ? <span className="learn-due soon">на доработку</span>
                        : <span className={`today-score ${r.score !== null && r.score >= r.points ? 'full' : r.score ? 'part' : 'zero'}`}>{`${formatScore(r.score)}/${r.points}`}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {achievements && <Achievements data={achievements} />}
      {cards.length > 0 && <h2 className="learn-section-title">Мои курсы</h2>}
      {cards.length === 0
        ? (
          <div className="learn-empty">
            <span className="learn-empty-icon"><IconCourses size={28} /></span>
            <h2>Пока нет открытых курсов</h2>
            <p>Когда учитель откроет курс вашей группе, он появится здесь. Ничего делать не нужно — просто загляните позже.</p>
          </div>
        )
        : (
          <div className="learn-cards">
            {cards.map((c, i) => (
              <CourseCard key={c.course.id} course={c.course} teacher={teachers.get(c.course.id) ?? null}
                totals={progressTotals(progress[i])} continueId={continueTopicId(progress[i])} />
            ))}
          </div>
        )}
    </div>
  );
}
