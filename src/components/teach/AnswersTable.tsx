import type { AnswerRow } from '@/lib/lms/submissions';
import { ANSWER_STATE_LABELS, type AnswerState } from '@/lib/lms/types';
import { formatDateTime, formatScore } from '@/lib/lms/format';
import type { PillTone } from '@/components/cabinet/StatusPill';
import AnswersList, { type AnswerListItem } from './AnswersList';

export function stateTone(state: AnswerState): PillTone {
  if (state === 'submitted') return 'warn';
  if (state === 'graded') return 'ok';
  if (state === 'returned') return 'accent';
  return 'neutral';
}

/**
 * Ответы на задание. Сам компонент серверный: он превращает строки и функцию
 * ссылок в простые данные, а фильтр «ждут проверки» живёт в клиентском списке.
 */
export default function AnswersTable({ rows, points, hrefFor, selectedId }: {
  rows: AnswerRow[]; points: number; hrefFor: (submissionId: string) => string; selectedId: string | null;
}) {
  if (rows.length === 0) {
    return <p className="empty-state">Ответов пока нет: курс не открыт ни одной группе или в группах нет учеников.</p>;
  }
  const items: AnswerListItem[] = rows.map(({ student, submission: s }) => {
    const state: AnswerState = s?.status ?? 'none';
    return {
      id: student.id,
      name: student.name,
      groups: student.groups.join(', '),
      state,
      stateLabel: ANSWER_STATE_LABELS[state],
      tone: stateTone(state),
      score: s?.status === 'graded' ? `${formatScore(s.score)} из ${points}` : '—',
      submittedAt: formatDateTime(s?.submittedAt ?? null),
      href: s && s.status !== 'draft' ? hrefFor(s.id) : null,
      selected: Boolean(s && s.id === selectedId),
    };
  });
  return <AnswersList items={items} />;
}
