/** Подписи для таблиц кабинетов. Модуль чистый: его зовут и сервер, и клиент. */

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('ru-RU') : '—';
}

export function formatDateTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

export function formatScore(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

export function ruPlural(n: number, one: string, few: string, many: string): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
}
