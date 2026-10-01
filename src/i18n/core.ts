import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from './config';

/**
 * Словари и перевод. Словарь области — один файл с тремя языками:
 *   export const m = defineMessages({ ru: { save: 'Сохранить' }, kk: { save: 'Сақтау' }, en: { save: 'Save' } });
 * Ключи kk и en проверяет TypeScript: пропущенный перевод — ошибка сборки.
 *
 * Разметка сообщения (упрощённый ICU):
 *   {name}                               — подстановка;
 *   {n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}
 *                                        — множественное число по правилам языка, # — само число.
 * Категории: ru — one/few/many/other, kk и en — one/other.
 */

export type Dict = Record<string, string>;
export interface MessageSet<T extends Dict> { ru: T; kk: { [K in keyof T]: string }; en: { [K in keyof T]: string } }

export function defineMessages<T extends Dict>(m: MessageSet<T>): MessageSet<T> {
  return m;
}

export type Params = Record<string, string | number | null | undefined>;
export type TFn<T extends Dict> = (key: keyof T & string, params?: Params) => string;

const pluralRules = new Map<Locale, Intl.PluralRules>();
function plural(locale: Locale, n: number): string {
  let r = pluralRules.get(locale);
  if (!r) { r = new Intl.PluralRules(INTL_LOCALE[locale]); pluralRules.set(locale, r); }
  return r.select(n);
}

/** Разбор {…} с учётом вложенных скобок в ветках plural. */
export function format(template: string, params: Params | undefined, locale: Locale): string {
  if (!template.includes('{')) return template;
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch !== '{') { out += ch; i++; continue; }
    let depth = 0;
    let j = i;
    for (; j < template.length; j++) {
      if (template[j] === '{') depth++;
      else if (template[j] === '}') { depth--; if (depth === 0) break; }
    }
    const body = template.slice(i + 1, j);
    i = j + 1;
    const pm = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(body);
    if (pm) {
      const n = Number(params?.[pm[1]] ?? 0);
      const branches: Record<string, string> = {};
      const re = /(=\d+|zero|one|two|few|many|other)\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(pm[2]))) {
        let d = 1;
        let k = re.lastIndex;
        for (; k < pm[2].length && d > 0; k++) {
          if (pm[2][k] === '{') d++;
          else if (pm[2][k] === '}') d--;
        }
        branches[m[1]] = pm[2].slice(re.lastIndex, k - 1);
        re.lastIndex = k;
      }
      const branch = branches[`=${n}`] ?? branches[plural(locale, n)] ?? branches.other ?? '';
      out += format(branch.replace(/#/g, String(n)), params, locale);
      continue;
    }
    const v = params?.[body.trim()];
    out += v === undefined || v === null ? '' : String(v);
  }
  return out;
}

export function translator<T extends Dict>(set: MessageSet<T>, locale: Locale): TFn<T> {
  const dict = (set[locale] ?? set[DEFAULT_LOCALE]) as Dict;
  const base = set[DEFAULT_LOCALE] as Dict;
  return (key, params) => format(dict[key] ?? base[key] ?? key, params, locale);
}

/* ------------------------------- даты и числа ------------------------------- */
/*
 * Казахскую локаль Intl знают не все среды: урезанный ICU (часть браузеров, headless Chromium)
 * вместо «20 қыр.» пишет «M09 20», а сервер — правильно, и страница падает на гидратации.
 * Поэтому казахские названия месяцев и дней недели — свои таблицы, а числа и числовые даты —
 * по русским правилам: у них тот же вид («12 345,6», «20.09.2026»), и русская локаль есть везде.
 */
const NUMBER_LOCALE: Record<Locale, string> = { ru: 'ru-RU', kk: 'ru-RU', en: 'en-GB' };
const KK_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
// Без точки: сокращение часто стоит в конце фразы, и «22 қыр..» выглядит опечаткой.
const KK_MONTHS_SHORT = ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'];
const KK_WEEKDAYS = ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'];
const KK_WEEKDAYS_SHORT = ['жс', 'дс', 'сс', 'ср', 'бс', 'жм', 'сб'];

const two = (n: number) => String(n).padStart(2, '0');

function kkFormat(date: Date, opts: Intl.DateTimeFormatOptions): string {
  const textual = opts.month === 'long' || opts.month === 'short' || !!opts.weekday;
  if (!textual) return date.toLocaleString('ru-RU', opts);
  const parts: string[] = [];
  if (opts.year) parts.push(`${date.getFullYear()} ж.`);
  if (opts.day) parts.push(String(date.getDate()));
  if (opts.month === 'long') parts.push(KK_MONTHS[date.getMonth()]);
  else if (opts.month === 'short') parts.push(KK_MONTHS_SHORT[date.getMonth()]);
  let s = parts.join(' ');
  if (opts.weekday) {
    const w = (opts.weekday === 'long' ? KK_WEEKDAYS : KK_WEEKDAYS_SHORT)[date.getDay()];
    s = s ? `${w}, ${s}` : w;
  }
  if (opts.hour) s = `${s}${s ? ', ' : ''}${two(date.getHours())}:${two(date.getMinutes())}`;
  return s;
}

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

export function formatDate(d: Date | string | number, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return locale === 'kk' ? kkFormat(date, opts) : date.toLocaleDateString(INTL_LOCALE[locale], opts);
}

export function formatDateTime(d: Date | string | number, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return locale === 'kk' ? kkFormat(date, opts) : date.toLocaleString(INTL_LOCALE[locale], opts);
}

/** Время «14:05» — одинаково на всех языках интерфейса. */
export function formatTime(d: Date | string | number, locale: Locale): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(NUMBER_LOCALE[locale], { hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(n: number, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(NUMBER_LOCALE[locale], opts);
}
