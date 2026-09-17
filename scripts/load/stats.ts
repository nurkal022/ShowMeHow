export interface Summary {
  count: number;
  errors: number;
  p50: number;
  p95: number;
  max: number;
}

/** Перцентиль по рангу (nearest-rank): значение, не меньше которого p% выборки. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function summarize(latencies: number[], errors = 0): Summary {
  return {
    count: latencies.length,
    errors,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    // reduce, а не Math.max(...): у тысяч замеров spread упирается в предел аргументов.
    max: latencies.length ? latencies.reduce((m, v) => (v > m ? v : m), -Infinity) : Number.NaN,
  };
}

/** «Позиции честные»: место в очереди у задания может только уменьшаться. */
export function isNonIncreasing(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v <= values[i - 1]);
}

export function reportSection(title: string, rows: [string, string][], passed: boolean): string {
  const verdict = passed ? 'цель достигнута' : 'цель НЕ достигнута';
  return [
    `### ${title} — ${verdict}`,
    '',
    '| Показатель | Значение |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
  ].join('\n');
}
