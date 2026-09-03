/**
 * Единственный источник правды по разрешённым внешним ресурсам артефакта.
 * Отдельный модуль (а не часть prompts.ts), чтобы рендерер мог блокировать
 * сеть, не завися от промптов.
 */
export const CDN_WHITELIST: Record<string, string> = {
  // three@0.164.0 больше не публикует классическую глобальную сборку build/three.min.js
  // (только ES-модуль build/three.module.min.js) — build/three.min.js отдаёт 404 на jsdelivr.
  three: 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.min.js',
  p5: 'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/p5.min.js',
  matter: 'https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js',
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  katexJs: 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js',
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css',
};

/** Разрешённый префикс — директория каждого whitelist-URL (строго origin+path). */
export function allowedPrefixes(): string[] {
  return Object.values(CDN_WHITELIST).map((u) => u.slice(0, u.lastIndexOf('/') + 1));
}
