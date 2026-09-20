import Link from 'next/link';
import type { StudentGrade } from '@/lib/lms/submissions';
import { ANSWER_STATE_LABELS } from '@/lib/lms/types';
import { formatScore, ruPlural } from '@/lib/lms/format';
import { coverStyle } from '@/lib/lms/covers';
import { Ring } from '@/components/cabinet/viz';
import { IconAlert, IconCheck, IconChevron } from '@/components/icons';

interface CourseGroup { courseId: string; title: string; rows: StudentGrade[] }

function byCourse(grades: StudentGrade[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  for (const g of grades) {
    const group = groups.get(g.courseId)
      ?? { courseId: g.courseId, title: g.courseTitle, rows: [] };
    group.rows.push(g);
    groups.set(g.courseId, group);
  }
  return [...groups.values()];
}

const STATE_CLASS: Record<string, string> = {
  graded: 'done', submitted: 'wait', returned: 'back', draft: 'none', none: 'none',
};

/** Мои оценки: общий итог сверху, затем курсы — каждый со своей сводкой и списком работ. */
export default function GradesTable({ grades }: { grades: StudentGrade[] }) {
  if (grades.length === 0) {
    return <p className="empty-state">Оценок пока нет. Задания появятся в курсах, которые откроет учитель.</p>;
  }
  const courses = byCourse(grades);
  const gradedAll = grades.filter((g) => g.state === 'graded');
  const earnedAll = gradedAll.reduce((a, g) => a + (g.score ?? 0), 0);
  const gradedMaxAll = gradedAll.reduce((a, g) => a + g.points, 0);
  const maxAll = grades.reduce((a, g) => a + g.points, 0);
  const doneAll = grades.filter((g) => g.state === 'graded' || g.state === 'submitted').length;
  const returned = grades.filter((g) => g.state === 'returned').length;
  const percentAll = gradedMaxAll > 0 ? Math.round((earnedAll / gradedMaxAll) * 100) : 0;

  return (
    <div className="gr">
      <section className="gr-summary" aria-label="Итог по всем курсам">
        <div className="gr-sum-main">
          <Ring value={percentAll} size={84} stroke={9} label={`Средний результат ${percentAll}%`} />
          <div>
            <b>{percentAll}%</b>
            <span>средний результат за проверенные работы</span>
            <small className="muted">{formatScore(earnedAll)} из {formatScore(gradedMaxAll)} возможных баллов</small>
          </div>
        </div>
        <div className="gr-sum-tiles">
          <div><b>{doneAll} / {grades.length}</b><span>{ruPlural(grades.length, 'работа сдана', 'работы сдано', 'работ сдано')}</span></div>
          <div><b>{formatScore(earnedAll)}</b><span>из {formatScore(maxAll)} баллов за курс целиком</span></div>
          <div className={returned > 0 ? 'warn' : undefined}>
            <b>{returned}</b>
            <span>{returned > 0
              ? `${ruPlural(returned, 'работу вернули', 'работы вернули', 'работ вернули')} на доработку`
              : 'ничего не вернули'}</span>
          </div>
        </div>
      </section>

      {courses.map((c) => {
        const graded = c.rows.filter((g) => g.state === 'graded');
        const earned = graded.reduce((a, g) => a + (g.score ?? 0), 0);
        const max = c.rows.reduce((a, g) => a + g.points, 0);
        const gradedMax = graded.reduce((a, g) => a + g.points, 0);
        const done = c.rows.filter((g) => g.state === 'graded' || g.state === 'submitted').length;
        const percent = gradedMax > 0 ? Math.round((earned / gradedMax) * 100) : 0;
        return (
          <section key={c.courseId} className="gr-course">
            <header className="gr-course-head">
              <span className="gr-cover" style={coverStyle(c.title)} aria-hidden="true">{c.title.slice(0, 1).toUpperCase()}</span>
              <div className="gr-course-title">
                <h2><Link href={`/learn/courses/${c.courseId}`}>{c.title}<IconChevron size={15} /></Link></h2>
                <span className="muted">{done} из {c.rows.length} сдано · {formatScore(earned)} из {formatScore(max)} баллов</span>
                <span className="lv-bar sm"><i style={{ width: `${c.rows.length ? (done / c.rows.length) * 100 : 0}%` }} /></span>
              </div>
              {gradedMax > 0 && <span className={`gr-pct ${percent >= 85 ? 'high' : percent >= 60 ? 'mid' : 'low'}`}>{percent}%</span>}
            </header>
            <ul className="gr-rows">
              {c.rows.map((g) => (
                <li key={g.blockId} className={STATE_CLASS[g.state] ?? 'none'}>
                  <Link href={`/learn/topics/${g.topicId}#block-${g.blockId}`}>
                    <span className="gr-row-text">
                      <b>{g.title}</b>
                      <small className="muted">{g.topicTitle}</small>
                    </span>
                    <span className={`gr-state ${STATE_CLASS[g.state] ?? 'none'}`}>
                      {g.state === 'graded' && <IconCheck size={13} />}
                      {g.state === 'returned' && <IconAlert size={13} />}
                      {ANSWER_STATE_LABELS[g.state]}
                    </span>
                    <span className="gr-score">
                      {g.score === null ? <span className="muted">— / {g.points}</span> : <><b>{formatScore(g.score)}</b> / {g.points}</>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
