import type { AnswerRow } from '@/lib/lms/submissions';
import { answerStateLabels, type AnswerState } from '@/lib/lms/types';
import { formatDateTime, formatScore } from '@/lib/lms/format';
import type { PillTone } from '@/components/cabinet/StatusPill';
import AnswersList, { type AnswerListItem } from './AnswersList';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { teachReview } from '@/i18n/messages/teach-review';

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
export default function AnswersTable({ rows, points, hrefFor, selectedId, dueAt = null, locale = 'ru' }: {
  rows: AnswerRow[]; points: number; hrefFor: (submissionId: string) => string; selectedId: string | null;
  /** Срок темы: сданное позже помечается «с опозданием». */
  dueAt?: string | null;
  locale?: Locale;
}) {
  const t = translator(teachReview, locale);
  if (rows.length === 0) {
    return <p className="empty-state">{t('noAnswers')}</p>;
  }
  const items: AnswerListItem[] = rows.map(({ student, submission: s }) => {
    const state: AnswerState = s?.status ?? 'none';
    return {
      id: student.id,
      name: student.name,
      groups: student.groups.join(', '),
      state,
      stateLabel: answerStateLabels(locale)[state],
      tone: stateTone(state),
      score: s?.status === 'graded' ? t('ofMax', { a: formatScore(s.score, locale), b: points }) : '—',
      submittedAt: formatDateTime(s?.submittedAt ?? null, locale)
        + (dueAt && s?.submittedAt && s.submittedAt > dueAt ? t('late') : ''),
      href: s && s.status !== 'draft' ? hrefFor(s.id) : null,
      selected: Boolean(s && s.id === selectedId),
    };
  });
  return <AnswersList items={items} />;
}
