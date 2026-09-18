import { ANSWER_STATE_LABELS, type AnswerState, type SubmissionStatus } from './types';
import { formatScore } from './format';

/** Журнал и прогресс курса как чистые функции от строк базы. */

export interface JournalStudent { id: string; name: string; groups: string[] }
export interface JournalAssignment { blockId: string; topicTitle: string; title: string; points: number }
export interface JournalSubmission { blockId: string; studentId: string; status: SubmissionStatus; score: number | null }
export interface JournalCell { blockId: string; state: AnswerState; score: number | null }
export interface JournalRow { student: JournalStudent; cells: JournalCell[]; total: number; max: number }
export interface Journal { assignments: JournalAssignment[]; rows: JournalRow[] }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru');

export function buildJournal(
  students: JournalStudent[], assignments: JournalAssignment[], submissions: JournalSubmission[],
): Journal {
  const index = new Map<string, JournalSubmission>();
  for (const s of submissions) index.set(`${s.studentId}:${s.blockId}`, s);
  const max = assignments.reduce((sum, a) => sum + a.points, 0);
  const rows = [...students].sort(byName).map((student): JournalRow => {
    let total = 0;
    const cells = assignments.map((a): JournalCell => {
      const s = index.get(`${student.id}:${a.blockId}`);
      if (!s) return { blockId: a.blockId, state: 'none', score: null };
      const score = s.status === 'graded' ? s.score : null;
      if (score !== null) total += score;
      return { blockId: a.blockId, state: s.status, score };
    });
    return { student, cells, total: Math.round(total * 100) / 100, max };
  });
  return { assignments, rows };
}

/** В клетке — балл, если работа проверена, иначе статус словами. */
export function cellText(cell: JournalCell): string {
  return cell.state === 'graded' && cell.score !== null ? formatScore(cell.score) : ANSWER_STATE_LABELS[cell.state];
}

/** Ячейка CSV: кавычки при разделителях и защита от формул в Excel. */
function csvCell(raw: string): string {
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function journalCsv(j: Journal): string {
  const header = ['Ученик', 'Группы',
    ...j.assignments.map((a) => `${a.topicTitle}: ${a.title} (${a.points})`), 'Итого', 'Максимум'];
  const lines = [header, ...j.rows.map((r) => [
    r.student.name, r.student.groups.join(', '), ...r.cells.map(cellText),
    formatScore(r.total), formatScore(r.max),
  ])];
  return `﻿${lines.map((cells) => cells.map(csvCell).join(';')).join('\r\n')}`;
}

export interface ProgressTopic { id: string; title: string }
export interface ProgressView { topicId: string; userId: string }
export interface ProgressRow { student: JournalStudent; opened: boolean[]; count: number }
export interface Progress { topics: ProgressTopic[]; rows: ProgressRow[] }

export function buildProgress(
  students: JournalStudent[], topics: ProgressTopic[], views: ProgressView[],
): Progress {
  const seen = new Set(views.map((v) => `${v.userId}:${v.topicId}`));
  const rows = [...students].sort(byName).map((student): ProgressRow => {
    const opened = topics.map((t) => seen.has(`${student.id}:${t.id}`));
    return { student, opened, count: opened.filter(Boolean).length };
  });
  return { topics, rows };
}
