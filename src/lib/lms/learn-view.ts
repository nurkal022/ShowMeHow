import { formatDate, formatTime } from '@/i18n/core';
import type { Locale } from '@/i18n/config';

/**
 * Чистая часть кабинета ученика: состояния тем, сроки и подписи. Модуль без базы —
 * его импортируют и серверные страницы, и клиентские компоненты урока.
 */

export type TopicState = 'none' | 'progress' | 'done';
const TOPIC_STATE_LABELS_BY_LOCALE: Record<Locale, Record<TopicState, string>> = {
  ru: { none: 'не начато', progress: 'в процессе', done: 'пройдено' },
  kk: { none: 'басталмаған', progress: 'орындалуда', done: 'өтілді' },
  en: { none: 'not started', progress: 'in progress', done: 'completed' },
};
export const TOPIC_STATE_LABELS: Record<TopicState, string> = TOPIC_STATE_LABELS_BY_LOCALE.ru;
export function topicStateLabels(locale: Locale = 'ru'): Record<TopicState, string> {
  return TOPIC_STATE_LABELS_BY_LOCALE[locale] ?? TOPIC_STATE_LABELS_BY_LOCALE.ru;
}

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

const DUE_TEXT: Record<Locale, { late: (d: string) => string; today: (t: string) => string; tomorrow: (t: string) => string; by: (d: string) => string }> = {
  ru: { late: (d) => `срок прошёл ${d}`, today: (t) => `сдать сегодня до ${t}`, tomorrow: (t) => `сдать завтра до ${t}`, by: (d) => `сдать до ${d}` },
  kk: { late: (d) => `мерзімі өтті: ${d}`, today: (t) => `бүгін ${t} дейін тапсыру`, tomorrow: (t) => `ертең ${t} дейін тапсыру`, by: (d) => `${d} дейін тапсыру` },
  en: { late: (d) => `overdue since ${d}`, today: (t) => `due today by ${t}`, tomorrow: (t) => `due tomorrow by ${t}`, by: (d) => `due ${d}` },
};

/** Подпись срока. Язык — необязательный третий параметр (по умолчанию русский). */
export function dueLabel(dueAt: string, now = new Date(), locale: Locale = 'ru'): { text: string; tone: DueTone } {
  const due = new Date(dueAt);
  const ms = due.getTime() - now.getTime();
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(due) - day(now)) / 86_400_000);
  const w = DUE_TEXT[locale] ?? DUE_TEXT.ru;
  const time = formatTime(due, locale);
  const date = formatDate(due, locale, { day: 'numeric', month: 'short' });
  if (ms < 0) return { text: w.late(date), tone: 'late' };
  if (days === 0) return { text: w.today(time), tone: 'soon' };
  if (days === 1) return { text: w.tomorrow(time), tone: 'soon' };
  return { text: w.by(date), tone: days <= 3 ? 'soon' : 'later' };
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
