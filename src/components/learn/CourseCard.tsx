import Link from 'next/link';
import type { StudentCourseCard } from '@/lib/lms/courses';
import { IconCourses } from '@/components/icons';

/** Курс ученика: доля открытых тем полосой, сданные задания — словами. */
export default function CourseCard({ card }: { card: StudentCourseCard }) {
  const { course } = card;
  const share = card.topicsTotal ? Math.round((card.topicsOpened / card.topicsTotal) * 100) : 0;
  return (
    <article className="sim-card">
      <div className="card-body">
        <div className="panel-title">
          <IconCourses size={18} />
          <h3><Link href={`/learn/courses/${course.id}`}>{course.title}</Link></h3>
        </div>
        {course.subject && <div className="card-sub"><span className="chip">{course.subject}</span></div>}
        <div className="meter" aria-hidden="true"><div className="meter-fill" style={{ width: `${share}%` }} /></div>
        <span className="muted">{`Тем открыто ${card.topicsOpened} из ${card.topicsTotal}`}</span>
        <span className="muted">{`Заданий сдано ${card.assignmentsSubmitted} из ${card.assignmentsTotal}`}</span>
        <div className="card-actions">
          <Link className="btn btn-sm btn-primary" href={`/learn/courses/${course.id}`}>Открыть курс</Link>
        </div>
      </div>
    </article>
  );
}
