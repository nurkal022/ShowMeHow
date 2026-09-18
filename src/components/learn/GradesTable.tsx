import Link from 'next/link';
import type { StudentGrade } from '@/lib/lms/submissions';
import { ANSWER_STATE_LABELS } from '@/lib/lms/types';
import { formatScore } from '@/lib/lms/format';
import StatusPill from '@/components/cabinet/StatusPill';
import { stateTone } from '@/components/teach/AnswersTable';

/** Все задания открытых курсов и их состояние — «Мои оценки». */
export default function GradesTable({ grades }: { grades: StudentGrade[] }) {
  if (grades.length === 0) {
    return <p className="empty-state">Оценок пока нет. Задания появятся в курсах, которые откроет учитель.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Курс</th><th>Тема</th><th>Задание</th><th>Статус</th><th>Балл</th></tr></thead>
        <tbody>
          {grades.map((g) => (
            <tr key={g.blockId}>
              <td data-label="Курс">{g.courseTitle}</td>
              <td data-label="Тема"><Link href={`/learn/topics/${g.topicId}`}>{g.topicTitle}</Link></td>
              <td data-label="Задание">{g.title}</td>
              <td data-label="Статус"><StatusPill tone={stateTone(g.state)}>{ANSWER_STATE_LABELS[g.state]}</StatusPill></td>
              <td data-label="Балл">{g.score === null ? '—' : `${formatScore(g.score)} из ${g.points}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
