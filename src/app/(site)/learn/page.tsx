import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentCourses } from '@/lib/lms/courses';
import { continueTopicId, courseTeacherNames, listTopicProgress, progressTotals } from '@/lib/lms/learn';
import CourseCard from '@/components/learn/CourseCard';
import { IconCourses } from '@/components/icons';

export default async function LearnPage() {
  const user = await requirePageUser('/learn');
  if (!user) return null;
  const cards = await listStudentCourses(user.id);
  const [teachers, progress] = await Promise.all([
    courseTeacherNames(cards.map((c) => c.course.id)),
    Promise.all(cards.map((c) => listTopicProgress(c.course.id, user.id))),
  ]);
  return (
    <div className="learn-page">
      <header className="learn-head">
        <div>
          <h1>Мои курсы</h1>
          <p className="muted">{cards.length > 0 ? 'Продолжайте с того места, где остановились.' : 'Здесь появятся курсы вашей группы.'}</p>
        </div>
        <Link className="btn" href="/learn/grades">Мои оценки</Link>
      </header>
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
