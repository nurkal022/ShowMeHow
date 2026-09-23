import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { listStudentCourses } from '@/lib/lms/courses';
import { continueTopicId, courseTeacherNames, listTopicProgress, progressTotals } from '@/lib/lms/learn';
import { studentAchievements } from '@/lib/lms/achievements';
import { listGaps } from '@/lib/lms/gaps';
import { getInterests } from '@/lib/lms/interests-store';
import { activityDays, studentPlaces, studentStats } from '@/lib/lms/student-home';
import { coverStyle } from '@/lib/lms/covers';
import { formatScore, ruPlural } from '@/lib/lms/format';
import Achievements from '@/components/learn/Achievements';
import ActivityGrid from '@/components/learn/ActivityGrid';
import StudentProfile from '@/components/learn/StudentProfile';
import InterestsCard from '@/components/learn/InterestsCard';
import { Ring } from '@/components/cabinet/viz';
import { IconCheck, IconChevron, IconSpark, IconTable, IconUser } from '@/components/icons';

/** Профиль ученика: кто он, как идут дела, что уже пройдено и какие значки собраны. */
export default async function StudentProfilePage() {
  const user = await requirePageUser('/learn/me');
  if (!user) return null;
  const cards = await listStudentCourses(user.id);
  const [teachers, progress, stats, places, achievements, activity, interests, gaps] = await Promise.all([
    courseTeacherNames(cards.map((c) => c.course.id)),
    Promise.all(cards.map((c) => listTopicProgress(c.course.id, user.id))),
    studentStats(user.id),
    studentPlaces(user.id),
    studentAchievements(user.id),
    activityDays(user.id),
    getInterests(user.id),
    listGaps(user.id),
  ]);
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' });
  const items = cards.map((c, i) => ({
    course: c.course, teacher: teachers.get(c.course.id) ?? null,
    totals: progressTotals(progress[i]), continueId: continueTopicId(progress[i]),
  }));
  const done = items.filter((x) => x.totals.topicsTotal > 0 && x.continueId === null);
  const going = items.filter((x) => x.continueId !== null && (x.totals.topicsViewed > 0 || x.totals.assignmentsDone > 0));
  const percentAll = stats.pointsMax > 0 ? Math.round((stats.pointsEarned / stats.pointsMax) * 100) : 0;
  // Родительный падеж месяца получается только с днём — день потом отбрасываем: «августа 2026 г.».
  const since = stats.since
    ? new Date(stats.since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      .split(' ').slice(1).join(' ')
    : null;

  return (
    <div className="learn-page sp">
      <StudentProfile name={user.displayName ?? ''} contact={userContact(user) || userLabel(user)} places={places} />

      <InterestsCard initial={interests} />

      {gaps.length > 0 && (
        <Link className="mk-invite" href="/learn/mistakes">
          <span className="mk-invite-icon"><IconSpark size={20} /></span>
          <span className="mk-invite-text">
            <b>{`Есть что подтянуть: ${gaps.length} ${ruPlural(gaps.length, 'задание', 'задания', 'заданий')}`}</b>
            <small>Помощник разберёт каждое по отдельности — объяснит ошибку и даст похожие задачи без оценок.</small>
          </span>
        </Link>
      )}

      <section className="sp-stats" aria-label="Итоги">
        <div className="sp-stat accent">
          <Ring value={percentAll} size={78} stroke={8} label={`Средний результат ${percentAll}%`} />
          <div>
            <b>{percentAll}%</b>
            <span>средний результат</span>
            <small className="muted">{formatScore(stats.pointsEarned)} из {formatScore(stats.pointsMax)} баллов</small>
          </div>
        </div>
        <div className="sp-stat"><div><b>{done.length}</b><span>{ruPlural(done.length, 'курс пройден', 'курса пройдено', 'курсов пройдено')}</span></div></div>
        <div className="sp-stat"><div><b>{stats.submitted}</b><span>{ruPlural(stats.submitted, 'работа сдана', 'работы сдано', 'работ сдано')}</span></div></div>
        <div className="sp-stat"><div><b>{stats.full}</b><span>на полный балл</span></div></div>
        <div className="sp-stat"><div><b>{stats.stepsSeen}</b><span>{ruPlural(stats.stepsSeen, 'шаг пройден', 'шага пройдено', 'шагов пройдено')}</span></div></div>
        <div className="sp-stat">
          <div>
            <b>{stats.activeDays}</b>
            <span>{ruPlural(stats.activeDays, 'день занятий', 'дня занятий', 'дней занятий')}</span>
            {since && <small className="muted">с {since}</small>}
          </div>
        </div>
      </section>

      <section className="sp-rhythm">
        <ActivityGrid days={activity} streak={achievements.streak} bestStreak={achievements.bestStreak} today={day} />
        <Achievements data={achievements} />
      </section>

      <section className="sp-block" aria-label="Пройденные курсы">
        <div className="lh-section-head">
          <h2 className="learn-section-title"><IconCheck size={17} />Пройденные курсы</h2>
          <Link className="btn btn-sm" href="/learn/grades"><IconTable size={15} />Все оценки</Link>
        </div>
        {done.length === 0
          ? <p className="empty-state">Пока ни одного завершённого курса. Первый появится здесь, когда пройдёте все темы.</p>
          : (
            <ul className="sp-courses">
              {done.map((x, i) => (
                <li key={x.course.id} style={{ animationDelay: `${i * 50}ms` }}>
                  <Link href={`/learn/courses/${x.course.id}`}>
                    <span className="sp-cover" style={coverStyle(x.course.subject || x.course.title)} aria-hidden="true">
                      {(x.course.subject || x.course.title).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="sp-course-text">
                      <b>{x.course.title}</b>
                      <small>
                        {x.course.subject || 'курс'}
                        {x.teacher ? ` · ${x.teacher}` : ''}
                        {x.totals.pointsMax > 0 ? ` · ${formatScore(x.totals.pointsEarned)} / ${formatScore(x.totals.pointsMax)} б.` : ''}
                      </small>
                    </span>
                    <span className="sp-course-mark"><IconCheck size={14} />пройден</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>

      {going.length > 0 && (
        <section className="sp-block" aria-label="Курсы в работе">
          <h2 className="learn-section-title">Сейчас в работе</h2>
          <ul className="sp-courses">
            {going.map((x) => {
              const percent = x.totals.topicsTotal ? Math.round((x.totals.topicsDone / x.totals.topicsTotal) * 100) : 0;
              return (
                <li key={x.course.id}>
                  <Link href={x.continueId ? `/learn/topics/${x.continueId}` : `/learn/courses/${x.course.id}`}>
                    <span className="sp-cover" style={coverStyle(x.course.subject || x.course.title)} aria-hidden="true">
                      {(x.course.subject || x.course.title).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="sp-course-text">
                      <b>{x.course.title}</b>
                      <small>{x.teacher ? <><IconUser size={12} />{x.teacher} · </> : null}{percent}% пройдено</small>
                      <span className="lv-bar sm"><i style={{ width: `${percent}%` }} /></span>
                    </span>
                    <IconChevron size={18} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
