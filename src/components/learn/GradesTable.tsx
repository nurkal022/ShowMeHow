import Link from 'next/link';
import type { StudentGrade } from '@/lib/lms/submissions';
import { ANSWER_STATE_LABELS } from '@/lib/lms/types';
import { formatScore } from '@/lib/lms/format';
import StatusPill from '@/components/cabinet/StatusPill';
import { stateTone } from '@/components/teach/AnswersTable';
import ProgressBar from './ProgressBar';

interface CourseGroup { courseId: string; title: string; rows: StudentGrade[] }

function byCourse(grades: StudentGrade[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  for (const g of grades) {
    const group = groups.get(g.courseId) ?? { courseId: g.courseId, title: g.courseTitle, rows: [] };
    group.rows.push(g);
    groups.set(g.courseId, group);
  }
  return [...groups.values()];
}

/** Все задания открытых курсов по курсам, с итогом в каждом — «Мои оценки». */
export default function GradesTable({ grades }: { grades: StudentGrade[] }) {
  if (grades.length === 0) {
    return <p className="empty-state">Оценок пока нет. Задания появятся в курсах, которые откроет учитель.</p>;
  }
  return (
    <div className="learn-grades">
      {byCourse(grades).map((c) => {
        const graded = c.rows.filter((g) => g.state === 'graded');
        const earned = graded.reduce((a, g) => a + (g.score ?? 0), 0);
        const max = c.rows.reduce((a, g) => a + g.points, 0);
        const gradedMax = graded.reduce((a, g) => a + g.points, 0);
        const done = c.rows.filter((g) => g.state === 'graded' || g.state === 'submitted').length;
        return (
          <section key={c.courseId} className="learn-grade-course">
            <header className="learn-grade-head">
              <h2><Link href={`/learn/courses/${c.courseId}`}>{c.title}</Link></h2>
              <div className="learn-grade-total">
                <strong>{formatScore(earned)}</strong>
                <span>{` из ${formatScore(max)} баллов`}</span>
                {gradedMax > 0 && <span className="learn-grade-pct">{`${Math.round((earned / gradedMax) * 100)}% за проверенные`}</span>}
              </div>
              <ProgressBar label="Сдано заданий" value={done} total={c.rows.length} />
            </header>
            <div className="table-wrap">
              <table className="data-table learn-grade-table">
                <thead><tr><th>Тема</th><th>Задание</th><th>Статус</th><th className="num">Балл</th></tr></thead>
                <tbody>
                  {c.rows.map((g) => (
                    <tr key={g.blockId}>
                      <td data-label="Тема"><Link href={`/learn/topics/${g.topicId}#block-${g.blockId}`}>{g.topicTitle}</Link></td>
                      <td data-label="Задание">{g.title}</td>
                      <td data-label="Статус"><StatusPill tone={stateTone(g.state)}>{ANSWER_STATE_LABELS[g.state]}</StatusPill></td>
                      <td data-label="Балл" className="num">{g.score === null ? `— из ${g.points}` : `${formatScore(g.score)} из ${g.points}`}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Итого по курсу</td>
                    <td className="num">{`${formatScore(earned)} из ${formatScore(max)}`}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
