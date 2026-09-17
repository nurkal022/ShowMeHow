import { describe, it, expect } from 'vitest';
import { percentile, summarize, isNonIncreasing, reportSection } from '../../scripts/load/stats';

describe('статистика нагрузочного прогона', () => {
  it('перцентиль по рангу', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile([7], 95)).toBe(7);
    expect(Number.isNaN(percentile([], 95))).toBe(true);
  });

  it('сводка не зависит от порядка', () => {
    expect(summarize([30, 10, 20], 1)).toEqual({ count: 3, errors: 1, p50: 20, p95: 30, max: 30 });
  });

  it('позиция в очереди только убывает', () => {
    expect(isNonIncreasing([5, 4, 4, 1])).toBe(true);
    expect(isNonIncreasing([])).toBe(true);
    expect(isNonIncreasing([2, 3])).toBe(false);
  });

  it('раздел отчёта', () => {
    const md = reportSection('Страницы', [['p95', '120 мс']], true);
    expect(md).toContain('### Страницы — цель достигнута');
    expect(md).toContain('| p95 | 120 мс |');
    expect(reportSection('Входы', [], false)).toContain('цель НЕ достигнута');
  });
});
