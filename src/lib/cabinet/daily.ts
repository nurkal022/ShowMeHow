import { db } from '../db/client';

/** Дневной ряд для графиков кабинетов: дни подряд, пустые дни — нулём. */
export interface DailySeries {
  /** Даты 'YYYY-MM-DD' от старой к сегодняшней. */
  days: string[];
  values: number[];
}

/**
 * Счёт строк по дням за последние `days` дней, включая сегодня.
 * `from` и `where` — только константы из кода (имена таблиц и условия), значения
 * от пользователя идут в `params`, начиная с $2: $1 занят числом дней.
 */
export async function dailyCounts(
  opts: { from: string; at: string; where?: string; params?: unknown[] }, days: number,
): Promise<DailySeries> {
  const { rows } = await db().query<{ day: string; n: number }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(x.at)::int AS n
     FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') AS d(day)
     LEFT JOIN (SELECT ${opts.at} AS at FROM ${opts.from}${opts.where ? ` WHERE ${opts.where}` : ''}) x
       ON x.at >= d.day AND x.at < d.day + interval '1 day'
     GROUP BY d.day ORDER BY d.day`, [days, ...(opts.params ?? [])]);
  return { days: rows.map((r) => r.day), values: rows.map((r) => r.n) };
}

/** Последние `n` точек ряда — для мини-графика в карточке. */
export function tail(series: DailySeries, n: number): DailySeries {
  return { days: series.days.slice(-n), values: series.values.slice(-n) };
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Даты 'YYYY-MM-DD' последних `n` дней по локальному времени сервера, от старой к сегодняшней. */
export function lastDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}
