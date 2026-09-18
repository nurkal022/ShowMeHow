import Link from 'next/link';
import type { AnswerRow } from '@/lib/lms/submissions';
import { ANSWER_STATE_LABELS, type AnswerState } from '@/lib/lms/types';
import { formatDateTime, formatScore } from '@/lib/lms/format';
import StatusPill, { type PillTone } from '@/components/cabinet/StatusPill';

export function stateTone(state: AnswerState): PillTone {
  if (state === 'submitted') return 'warn';
  if (state === 'graded') return 'ok';
  if (state === 'returned') return 'accent';
  return 'neutral';
}

export default function AnswersTable({ rows, points, hrefFor, selectedId }: {
  rows: AnswerRow[]; points: number; hrefFor: (submissionId: string) => string; selectedId: string | null;
}) {
  if (rows.length === 0) {
    return <p className="empty-state">Ответов пока нет: курс не открыт ни одной группе или в группах нет учеников.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Ученик</th><th>Группы</th><th>Статус</th><th>Балл</th><th>Сдано</th><th /></tr></thead>
        <tbody>
          {rows.map(({ student, submission: s }) => {
            const state: AnswerState = s?.status ?? 'none';
            return (
              <tr key={student.id} className={s && s.id === selectedId ? 'selected' : undefined}>
                <td data-label="Ученик">{student.name}</td>
                <td data-label="Группы">{student.groups.join(', ')}</td>
                <td data-label="Статус"><StatusPill tone={stateTone(state)}>{ANSWER_STATE_LABELS[state]}</StatusPill></td>
                <td data-label="Балл">{s?.status === 'graded' ? `${formatScore(s.score)} из ${points}` : '—'}</td>
                <td data-label="Сдано">{formatDateTime(s?.submittedAt ?? null)}</td>
                <td className="actions">
                  {s && s.status !== 'draft' && (
                    <Link className="btn btn-sm btn-ghost" href={hrefFor(s.id)}>Открыть</Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
