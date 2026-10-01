'use client';

/**
 * Название материала, проекта или статьи: textarea, растущая по тексту, — длинное
 * название переносится, а не обрезается (на телефоне это обычное дело). Enter не
 * добавляет перенос строки, а завершает правку — название остаётся одной строкой данных.
 */
export default function TitleField({ value, onChange, label, maxLength = 200 }: {
  value: string; onChange: (v: string) => void; label: string; maxLength?: number;
}) {
  return (
    <textarea className="rs-title-input" rows={1} value={value} aria-label={label} maxLength={maxLength} spellCheck
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}
