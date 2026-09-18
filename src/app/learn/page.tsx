import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listStudentCourses } from '@/lib/lms/courses';
import CourseCard from '@/components/learn/CourseCard';

export default async function LearnPage() {
  const user = await requirePageUser('/learn');
  if (!user) return null;
  const cards = await listStudentCourses(user.id);
  return (
    <div className="library">
      <div className="library-head">
        <h1>Мои курсы</h1>
        <Link className="btn" href="/learn/grades">Мои оценки</Link>
      </div>
      {cards.length === 0
        ? (
          <p className="empty-state" style={{ marginTop: 24 }}>
            Пока нет открытых курсов. Когда учитель откроет курс вашей группе, он появится здесь.
          </p>
        )
        : <div className="cards">{cards.map((c) => <CourseCard key={c.course.id} card={c} />)}</div>}
    </div>
  );
}
