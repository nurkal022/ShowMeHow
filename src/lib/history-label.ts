/**
 * Человекочитаемая подпись для файла истории версий.
 * Имя файла формата `2026-07-07T03-49-12-345Z.html` (опционально с суффиксом
 * коллизии `-N` перед расширением, например `...-345Z-2.html`) парсится обратно
 * в ISO-строку и форматируется через `toLocaleString('ru-RU')`. Суффикс коллизии
 * отображается как « (N)». Имена, не соответствующие ожидаемому формату,
 * возвращаются как есть.
 */
export function historyLabel(name: string): string {
  const base = name.replace(/\.html$/, '');
  const match = base.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-(\d+))?$/);
  if (!match) return name;
  const [, datePart, hh, mm, ss, ms, suffix] = match;
  const iso = `${datePart}T${hh}:${mm}:${ss}.${ms}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return name;
  const formatted = d.toLocaleString('ru-RU');
  return suffix ? `${formatted} (${suffix})` : formatted;
}
