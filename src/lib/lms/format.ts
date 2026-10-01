import { formatDate as coreDate, formatDateTime as coreDateTime, formatNumber as coreNumber } from '@/i18n/core';
import type { Locale } from '@/i18n/config';

/**
 * Подписи для таблиц кабинетов. Модуль чистый: его зовут и сервер, и клиент.
 * Язык — необязательный последний параметр; по умолчанию русский.
 */

export function formatDate(iso: string | null, locale: Locale = 'ru'): string {
  return iso ? coreDate(iso, locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

export function formatDateTime(iso: string | null, locale: Locale = 'ru'): string {
  return iso
    ? coreDateTime(iso, locale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
}

export function formatScore(n: number | null, locale: Locale = 'ru'): string {
  return n === null ? '—' : coreNumber(n, locale, { maximumFractionDigits: 2 });
}

export function ruPlural(n: number, one: string, few: string, many: string): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
}

const AGO: Record<Locale, {
  never: string; now: string; min: (n: number) => string; hours: (n: number) => string; yesterday: string; days: (n: number) => string;
}> = {
  ru: { never: 'никогда', now: 'только что', min: (n) => `${n} мин назад`, hours: (n) => `${n} ч назад`, yesterday: 'вчера', days: (n) => `${n} дн. назад` },
  kk: { never: 'ешқашан', now: 'жаңа ғана', min: (n) => `${n} мин бұрын`, hours: (n) => `${n} сағ бұрын`, yesterday: 'кеше', days: (n) => `${n} күн бұрын` },
  en: { never: 'never', now: 'just now', min: (n) => `${n} min ago`, hours: (n) => `${n} h ago`, yesterday: 'yesterday', days: (n) => `${n} d ago` },
};

/**
 * «только что», «5 мин назад», «вчера», «3 дн. назад» — для лент и «последнего захода».
 * Язык можно передать вторым параметром: formatAgo(iso, 'kk'), или третьим после now.
 */
export function formatAgo(iso: string | null, nowOrLocale: number | Locale = Date.now(), lang?: Locale): string {
  const now = typeof nowOrLocale === 'number' ? nowOrLocale : Date.now();
  const locale: Locale = typeof nowOrLocale === 'string' ? nowOrLocale : lang ?? 'ru';
  const w = AGO[locale] ?? AGO.ru;
  if (!iso) return w.never;
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return w.now;
  if (min < 60) return w.min(min);
  const h = Math.round(min / 60);
  if (h < 24) return w.hours(h);
  const d = Math.round(h / 24);
  if (d === 1) return w.yesterday;
  if (d < 30) return w.days(d);
  return formatDate(iso, locale);
}
