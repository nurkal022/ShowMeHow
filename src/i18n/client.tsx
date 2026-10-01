'use client';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, type Locale } from './config';
import { formatDate, formatDateTime, translator, type Dict, type MessageSet, type TFn } from './core';
import { localizeMessage } from './catalog';

const LocaleCtx = createContext<Locale>('ru');

/** Язык приходит с сервера (из cookie) — первый рендер совпадает, мигания нет. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleCtx);
}

export function useT<T extends Dict>(set: MessageSet<T>): TFn<T> {
  const locale = useLocale();
  return useMemo(() => translator(set, locale), [set, locale]);
}

/** Даты и сообщения сервера на текущем языке. */
export function useFormat() {
  const locale = useLocale();
  return useMemo(() => ({
    date: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => formatDate(d, locale, opts),
    dateTime: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => formatDateTime(d, locale, opts),
    /** Текст ошибки с сервера (он на русском) — на язык интерфейса, если он есть в каталоге. */
    message: (text: string) => localizeMessage(text, locale),
  }), [locale]);
}

/** Смена языка: cookie на год и перерисовка серверных компонентов. */
export function useSetLocale(): (l: Locale) => void {
  const router = useRouter();
  return useCallback((l: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    router.refresh();
  }, [router]);
}

/** Для кода вне React (обработчики fetch): язык из cookie документа. */
export function currentLocale(): Locale {
  if (typeof document === 'undefined') return 'ru';
  const m = /(?:^|;\s*)tesseract-lang=([a-z]{2})/.exec(document.cookie);
  return m && (m[1] === 'kk' || m[1] === 'en') ? m[1] : 'ru';
}
