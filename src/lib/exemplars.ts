import type { DemoEntry } from './demos';
import type { PlanSpec } from './types';

/** Больше этого в промпт не кладём: эталон и так занимает ~7k токенов. */
const MAX_EXEMPLAR_CHARS = 30000;

function haystack(spec: PlanSpec): string {
  return [spec.title, spec.subject, spec.physics, spec.visualPlan, ...spec.learningGoals]
    .join(' ')
    .toLowerCase();
}

/**
 * Детерминированный скоринг близости демки к спецификации: режим важнее предмета,
 * предмет важнее отдельных ключевых слов. Без эмбеддингов — результат воспроизводим
 * и проверяем тестом.
 */
export function scoreExemplar(demo: DemoEntry, spec: PlanSpec): number {
  const text = haystack(spec);
  let score = 0;
  if (demo.mode && demo.mode === spec.mode) score += 5;
  if (demo.subject && demo.subject.toLowerCase() === spec.subject.toLowerCase()) score += 3;
  let keywordHits = 0;
  for (const k of demo.keywords ?? []) {
    if (k && text.includes(k.toLowerCase())) keywordHits++;
  }
  score += Math.min(keywordHits, 3) * 2;
  for (const t of demo.techniques ?? []) {
    if (t && text.includes(t.toLowerCase())) score += 1;
  }
  if (demo.exemplar) score += 2;
  return score;
}

/** Лучший эталон под спецификацию; при равенстве оценок — по slug (детерминизм). */
export function pickExemplar(demos: DemoEntry[], spec: PlanSpec): DemoEntry | null {
  const usable = demos.filter((d) => d.html.length <= MAX_EXEMPLAR_CHARS);
  if (usable.length === 0) return null;
  return usable.reduce((best, d) => {
    const ds = scoreExemplar(d, spec);
    const bs = scoreExemplar(best, spec);
    if (ds > bs) return d;
    if (ds === bs && d.slug < best.slug) return d;
    return best;
  });
}
