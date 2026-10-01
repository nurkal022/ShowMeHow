import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';

const colName = (i: number, locale: Locale) => translator(researchFigure, locale)('column', { n: i + 1 });

/**
 * Таблица данных исследователя: вставка из Excel/Origin/CSV как есть.
 * Разделитель угадывается (таб, «;», «,»), десятичная запятая понимается —
 * русские таблицы экспортируют «1,25;3,4». Первая строка — заголовки, если в ней
 * есть нечисловые ячейки.
 */

export interface DataTable {
  headers: string[];
  /** Столбцы чисел; пустая или нечисловая ячейка — NaN. */
  columns: number[][];
  rows: number;
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10);
  for (const d of ['\t', ';']) if (sample.every((l) => l.includes(d))) return d;
  // Запятая — разделитель, только если в строках нет «десятичных запятых» при «;».
  if (sample.every((l) => l.includes(','))) return ',';
  return /\s+/.test(sample[0] ?? '') ? 'ws' : ',';
}

export function parseNumber(cell: string): number {
  const s = cell.trim().replace(/ |\s/g, '').replace(/−/g, '-');
  if (!s) return NaN;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function parseTable(text: string, locale: Locale = 'ru'): DataTable {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length === 0) return { headers: [], columns: [], rows: 0 };
  const d = detectDelimiter(lines);
  const split = (l: string) => (d === 'ws' ? l.trim().split(/\s+/) : l.split(d)).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const cells = lines.map(split);
  const first = cells[0];
  const hasHeader = first.some((c) => c !== '' && Number.isNaN(parseNumber(c)));
  const body = hasHeader ? cells.slice(1) : cells;
  const width = Math.max(...cells.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (hasHeader ? first[i]?.trim() : '') || colName(i, locale));
  const columns = headers.map((_, i) => body.map((r) => parseNumber(r[i] ?? '')));
  return { headers, columns, rows: body.length };
}

export interface ColumnStats { n: number; mean: number; sd: number; sem: number; min: number; max: number; median: number }

/** Описательная статистика столбца — то, что просят в первой таблице статьи. */
export function columnStats(col: number[]): ColumnStats {
  const v = col.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return { n: 0, mean: NaN, sd: NaN, sem: NaN, min: NaN, max: NaN, median: NaN };
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return { n, mean, sd, sem: sd / Math.sqrt(n), min: v[0], max: v[n - 1], median };
}

/** Коэффициент корреляции Пирсона по парам, где оба значения есть. */
export function pearson(a: number[], b: number[]): number {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length;
  if (n < 3) return NaN;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

export function tableToCsv(headers: string[], columns: number[][]): string {
  const rows = Math.max(0, ...columns.map((c) => c.length));
  const out = [headers.join(',')];
  for (let i = 0; i < rows; i++) out.push(columns.map((c) => (Number.isFinite(c[i]) ? String(c[i]) : '')).join(','));
  return out.join('\n');
}

/**
 * Таблица как строки ячеек — для редактируемой сетки. Числа не трогаем: автор может
 * держать в ячейке «1,25» или пусто, а разбор в числа делает parseTable.
 */
export function parseCells(text: string, locale: Locale = 'ru'): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length === 0) return { headers: ['x', 'y'], rows: [['', '']] };
  const d = detectDelimiter(lines);
  const split = (l: string) => (d === 'ws' ? l.trim().split(/\s+/) : l.split(d)).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const cells = lines.map(split);
  const hasHeader = cells[0].some((c) => c !== '' && Number.isNaN(parseNumber(c)));
  const width = Math.max(...cells.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (hasHeader ? cells[0][i]?.trim() : '') || colName(i, locale));
  const rows = (hasHeader ? cells.slice(1) : cells).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  return { headers, rows };
}

/** Обратно в текст с табуляцией: так же вставляется в Excel и читается parseTable. */
export function cellsToText(headers: string[], rows: string[][]): string {
  const clean = (s: string) => s.replace(/[\t\n\r]/g, ' ');
  return [headers.map(clean).join('\t'), ...rows.map((r) => r.map(clean).join('\t'))].join('\n');
}
