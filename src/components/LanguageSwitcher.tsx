'use client';
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, type Locale } from '@/i18n/config';
import { useLocale, useSetLocale } from '@/i18n/client';

/**
 * Переключатель языка: сегменты «Рус / Қаз / Eng». Каждый вариант подписан на своём
 * языке — человек найдёт родной, даже если сейчас интерфейс на незнакомом.
 */
export default function LanguageSwitcher({ compact = false, label }: { compact?: boolean; label?: string }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <div className="segmented lang-switch" role="group" aria-label={label ?? 'Язык / Тіл / Language'} style={compact ? undefined : { width: '100%' }}>
      {LOCALES.map((l: Locale) => (
        <button key={l} type="button" lang={l} title={LOCALE_NAMES[l]} aria-pressed={locale === l}
          className={locale === l ? 'segmented-item active' : 'segmented-item'} onClick={() => setLocale(l)}>
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
