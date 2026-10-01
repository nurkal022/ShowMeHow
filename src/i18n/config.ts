/**
 * Языки интерфейса. Русский — исходный: на нём написаны все тексты, и он же запасной,
 * если перевода нет. Выбор хранится в cookie — его читают и сервер, и клиент.
 */
export const LOCALES = ['ru', 'kk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_COOKIE = 'tesseract-lang';

export const LOCALE_NAMES: Record<Locale, string> = { ru: 'Русский', kk: 'Қазақша', en: 'English' };
export const LOCALE_SHORT: Record<Locale, string> = { ru: 'Рус', kk: 'Қаз', en: 'Eng' };
/** Для Intl: даты, числа, множественное число. */
export const INTL_LOCALE: Record<Locale, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** Язык из заголовка Cookie — синхронно, для роутов, где есть Request. */
export function localeFromCookieHeader(header: string | null | undefined): Locale {
  const m = /(?:^|;\s*)tesseract-lang=([a-z]{2})/.exec(header ?? '');
  return m && isLocale(m[1]) ? m[1] : DEFAULT_LOCALE;
}

export function localeFromRequest(req: Request): Locale {
  return localeFromCookieHeader(req.headers.get('cookie'));
}
