import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import { translator, type Dict, type MessageSet, type TFn } from './core';

/**
 * Язык в серверных компонентах и generateMetadata. Вне запроса (воркер, скрипты)
 * cookies() недоступен — тогда русский.
 */
export async function getLocale(): Promise<Locale> {
  try {
    const v = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function getT<T extends Dict>(set: MessageSet<T>): Promise<TFn<T>> {
  return translator(set, await getLocale());
}
