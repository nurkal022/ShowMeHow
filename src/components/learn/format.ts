import type { Locale } from '@/i18n/config';
import { formatTime } from '@/i18n/core';
import { formatDate, formatDateTime, formatNumber, translator } from '@/i18n/core';
import { learn } from '@/i18n/messages/learn';
import type { DueTone, TopicState } from '@/lib/lms/learn-view';

/**
 * Подписи раздела ученика на языке интерфейса. Модуль чистый — его зовут и серверные
 * страницы (язык из getLocale), и клиентские компоненты (язык из useLocale).
 */

/** Балл: «8,5» по-русски, «8.5» по-английски; null — прочерк. */
export function learnScore(n: number | null, locale: Locale): string {
  return n === null ? '—' : formatNumber(n, locale, { maximumFractionDigits: 2 });
}

/** Короткая дата «26.09.2026» — как прежний formatDate из lib/lms/format. */
export function learnDate(iso: string | null, locale: Locale): string {
  return iso ? formatDate(iso, locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

export function learnDateTime(iso: string | null, locale: Locale): string {
  return iso ? formatDateTime(iso, locale, { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

/** Срок темы: та же логика тонов, что у dueLabel, но текст — на языке интерфейса. */
export function learnDue(dueAt: string, locale: Locale, now = new Date()): { text: string; tone: DueTone } {
  const t = translator(learn, locale);
  const due = new Date(dueAt);
  const ms = due.getTime() - now.getTime();
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(due) - day(now)) / 86_400_000);
  const time = formatTime(due, locale);
  const date = formatDate(due, locale, { day: 'numeric', month: 'short' });
  if (ms < 0) return { text: t('dueLate', { date }), tone: 'late' };
  if (days === 0) return { text: t('dueToday', { time }), tone: 'soon' };
  if (days === 1) return { text: t('dueTomorrow', { time }), tone: 'soon' };
  return { text: t('dueBy', { date }), tone: days <= 3 ? 'soon' : 'later' };
}

export function topicStateLabel(state: TopicState, locale: Locale): string {
  return translator(learn, locale)(`state_${state}`);
}
