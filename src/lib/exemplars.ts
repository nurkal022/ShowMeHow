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
  return score;
}

/**
 * Лучший эталон под спецификацию; при равенстве оценок — по slug (детерминизм).
 * `exemplar: true` — жёсткий фильтр, а не бонус: в промпт генератора попадает только
 * демка, построенная на примитивах кита. Иначе рядом с правилом «не создавай своих
 * position:fixed панелей» оказывался бы пример, который именно это и делает.
 */
export function pickExemplar(demos: DemoEntry[], spec: PlanSpec): DemoEntry | null {
  const usable = demos.filter((d) => d.exemplar && d.html.length <= MAX_EXEMPLAR_CHARS);
  if (usable.length === 0) return null;
  return usable.reduce((best, d) => {
    const ds = scoreExemplar(d, spec);
    const bs = scoreExemplar(best, spec);
    if (ds > bs) return d;
    if (ds === bs && d.slug < best.slug) return d;
    return best;
  });
}

/** Сколько кода образца-из-своих кладём в промпт: только приборы, виды и урок. */
const MAX_OWN_EXEMPLAR_CHARS = 14000;

function words(spec: PlanSpec): Set<string> {
  return new Set(haystack(spec).split(/[^a-zа-яё0-9]+/i).filter((w) => w.length >= 5).map((w) => w.slice(0, 6)));
}

/**
 * Близость своего эталона к новой спецификации: уровень и режим важнее предмета,
 * предмет важнее общих слов. Тот же принцип, что у вшитых демок, но ключевые слова
 * берутся из плана эталона, а не из ручной разметки.
 */
export function scoreOwnExemplar(own: PlanSpec, spec: PlanSpec): number {
  let score = 0;
  if ((own.level ?? 'demo') === (spec.level ?? 'demo')) score += 4;
  if (own.mode === spec.mode) score += 3;
  if (own.subject.toLowerCase() === spec.subject.toLowerCase()) score += 3;
  const a = words(own);
  let hits = 0;
  for (const w of words(spec)) if (a.has(w)) hits++;
  return score + Math.min(hits, 5);
}

/**
 * Лучший свой эталон под спецификацию — секциями instruments, views, scenario, а не
 * целым файлом: тема чужая, а приёмы приборов и урока переносятся как есть.
 */
export function pickOwnExemplar(
  own: { id: string; spec: PlanSpec; html: string }[], spec: PlanSpec,
  sections: (html: string) => { name: string; body: string }[],
): string | null {
  let best: { score: number; code: string } | null = null;
  for (const e of own) {
    const parts = sections(e.html).filter((s) => ['instruments', 'views', 'scenario'].includes(s.name));
    if (!parts.length) continue;
    const code = parts.map((p) => `// ==== @section ${p.name} ====\n${p.body}\n// ==== @end ${p.name} ====`).join('\n\n');
    if (code.length > MAX_OWN_EXEMPLAR_CHARS) continue;
    const score = scoreOwnExemplar(e.spec, spec);
    if (!best || score > best.score) best = { score, code: `// Эталон: ${e.spec.title}\n${code}` };
  }
  return best && best.score >= 4 ? best.code : null;
}
