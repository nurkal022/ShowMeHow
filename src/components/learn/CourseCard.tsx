import Link from 'next/link';
import type { Course } from '@/lib/lms/types';
import type { ProgressTotals } from '@/lib/lms/learn';
import { formatScore } from '@/lib/lms/format';
import { IconCheck, IconUser } from '@/components/icons';
import ProgressBar from './ProgressBar';

/** Курс ученика: предмет, учитель, две полосы прогресса и «Продолжить» к первой незавершённой теме. */
export default function CourseCard({ course, teacher, totals, continueId }: {
  course: Course; teacher: string | null; totals: ProgressTotals; continueId: string | null;
}) {
  const finished = totals.topicsTotal > 0 && continueId === null;
  const started = totals.topicsViewed > 0 || totals.assignmentsDone > 0;
  const courseHref = `/learn/courses/${course.id}`;
  return (
    <article className={finished ? 'learn-card done' : 'learn-card'}>
      <div className="learn-card-top">
        {course.subject ? <span className="chip">{course.subject}</span> : <span />}
        {finished && <span className="learn-done-mark"><IconCheck size={14} />Пройден</span>}
      </div>
      <h2><Link href={courseHref}>{course.title}</Link></h2>
      {teacher && <p className="learn-card-teacher"><IconUser size={14} />{teacher}</p>}
      <div className="learn-card-bars">
        <ProgressBar label="Темы" value={totals.topicsViewed} total={totals.topicsTotal} />
        <ProgressBar label="Задания" value={totals.assignmentsDone} total={totals.assignmentsTotal} />
      </div>
      <div className="learn-card-foot">
        {totals.pointsMax > 0 && (
          <span className="learn-points">{`${formatScore(totals.pointsEarned)} / ${formatScore(totals.pointsMax)} баллов`}</span>
        )}
        <span className="spacer" />
        {continueId
          ? <Link className="btn btn-sm btn-primary" href={`/learn/topics/${continueId}`}>{started ? 'Продолжить' : 'Начать'}</Link>
          : <Link className="btn btn-sm" href={courseHref}>Открыть курс</Link>}
      </div>
    </article>
  );
}
