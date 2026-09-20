/**
 * Чистая часть кабинета ученика: состояния тем, сроки и подписи. Модуль без базы —
 * его импортируют и серверные страницы, и клиентские компоненты урока.
 */

export type TopicState = 'none' | 'progress' | 'done';
export const TOPIC_STATE_LABELS: Record<TopicState, string> = {
  none: 'не начато',
  progress: 'в процессе',
  done: 'пройдено',
};

export interface TopicProgress {
  topicId: string;
  title: string;
  viewed: boolean;
  blocksTotal: number;
  assignmentsTotal: number;
  /** Сдано или проверено. */
  assignmentsDone: number;
  assignmentsReturned: number;
  pointsEarned: number;
  pointsMax: number;
  state: TopicState;
  dueAt: string | null;
}

export type DueTone = 'late' | 'soon' | 'later';

export function dueLabel(dueAt: string, now = new Date()): { text: string; tone: DueTone } {
  const due = new Date(dueAt);
  const ms = due.getTime() - now.getTime();
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(due) - day(now)) / 86_400_000);
  const time = due.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (ms < 0) return { text: `срок прошёл ${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, tone: 'late' };
  if (days === 0) return { text: `сдать сегодня до ${time}`, tone: 'soon' };
  if (days === 1) return { text: `сдать завтра до ${time}`, tone: 'soon' };
  return { text: `сдать до ${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, tone: days <= 3 ? 'soon' : 'later' };
}

/** Первая незавершённая тема — куда ведёт «Продолжить». null — курс пройден или пуст. */
export function continueTopicId(topics: TopicProgress[]): string | null {
  return topics.find((t) => t.state !== 'done')?.topicId ?? null;
}

export interface ProgressTotals {
  topicsTotal: number; topicsDone: number; topicsViewed: number;
  assignmentsTotal: number; assignmentsDone: number; pointsEarned: number; pointsMax: number;
}

export function progressTotals(topics: TopicProgress[]): ProgressTotals {
  const sum = (f: (t: TopicProgress) => number) => topics.reduce((a, t) => a + f(t), 0);
  return {
    topicsTotal: topics.length,
    topicsDone: sum((t) => (t.state === 'done' ? 1 : 0)),
    topicsViewed: sum((t) => (t.viewed ? 1 : 0)),
    assignmentsTotal: sum((t) => t.assignmentsTotal),
    assignmentsDone: sum((t) => t.assignmentsDone),
    pointsEarned: sum((t) => t.pointsEarned),
    pointsMax: sum((t) => t.pointsMax),
  };
}
