import vm from 'node:vm';
import { getSection, putSection } from './sections';

/**
 * Механическая починка частых ошибок слабых моделей — до рендера и без модели.
 * Каждая из них раньше стоила круга фиксера (20–40 с) или тихо ломала страницу:
 *
 * - ключи объекта в LaTeX-виде: `vars: { R_{лампа}: {...} }` — синтаксическая ошибка,
 *   страница не исполняется вовсе;
 * - секция physics без обёртки `var PHYS = (function () {…})()`: её `return {init, step, observe}`
 *   оказывается на верхнем уровне IIFE страницы и молча обрывает весь код ниже — ни панели,
 *   ни ошибки в консоли.
 *
 * Чинится только то, что опознано наверняка; остальное уходит фиксеру как раньше.
 */

const INLINE_SCRIPT = /<script(?![^>]*\btype\s*=\s*["'](?:module|importmap|application\/json)["'])([^>]*)>([\s\S]*?)<\/script>/gi;

/** Синтаксическая ошибка классического скрипта или null. */
export function syntaxError(src: string): string | null {
  try {
    new vm.Script(src, { filename: 'page.js' });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Ключи объекта с LaTeX (`R_{лампа}`, `R_{\mathrm{лампа}}`, `\theta`) или кириллицей — в кавычки. */
export function quoteOddKeys(src: string): string {
  // Ключ в начале строки с вложенными скобками: `R_{\mathrm{реостат}}: {` — построчно, со сбалансированными {}.
  src = src.replace(/^(\s*)([^\s'"`:,{}()\[\]][^'"`\n]*?)(\s*:\s*)(?=[{\['"\d-]|true|false|null)/gm,
    (m, pre: string, key: string, colon: string) => {
      if (!/[{}\\^А-Яа-яЁё]/.test(key) || /\s/.test(key.trim()) || /[;=()]/.test(key)) return m;
      let depth = 0;
      for (const ch of key) { if (ch === '{') depth++; else if (ch === '}' && --depth < 0) return m; }
      return depth === 0 ? `${pre}${JSON.stringify(key)}${colon}` : m;
    });
  return src.replace(
    /([{,]\s*)((?:[A-Za-z_$А-Яа-яЁё\\][\w$А-Яа-яЁё\\]*)?(?:_\{[^{}\n:]*\}|\^\{[^{}\n:]*\}|\\[A-Za-z]+)[\w$А-Яа-яЁё\\{}^]*|[А-Яа-яЁё][\wА-Яа-яЁё]*)(\s*:)(?!:)/g,
    (_m, pre: string, key: string, colon: string) => `${pre}${JSON.stringify(key)}${colon}`,
  );
}

/** Скрипты страницы, которые не разбираются, — пробуем починить ключи. */
function repairSyntax(html: string): { html: string; fixed: string[] } {
  const fixed: string[] = [];
  const out = html.replace(INLINE_SCRIPT, (whole, attrs: string, body: string) => {
    if (!body.trim() || !syntaxError(body)) return whole;
    const next = quoteOddKeys(body);
    if (next !== body && !syntaxError(next)) {
      fixed.push('ключи объекта в виде LaTeX взяты в кавычки');
      return `<script${attrs}>${next}</script>`;
    }
    return whole;
  });
  return { html: out, fixed };
}

const PHYS_DEFINED = /\b(?:var|let|const)\s+PHYS\s*=|\bPHYS\s*=\s*[({]/;

/** Секция physics без обёртки: верхнеуровневый return обрывает страницу. */
function repairPhysics(html: string): { html: string; fixed: string[] } {
  const physics = getSection(html, 'physics');
  if (physics === null || PHYS_DEFINED.test(physics)) return { html, fixed: [] };
  if (!/function\s+init\s*\(/.test(physics) || !/function\s+step\s*\(/.test(physics)) return { html, fixed: [] };
  // Строка «return { init…» на нулевой глубине скобок секции — тот самый обрыв.
  const lines = physics.split('\n');
  let depth = 0, cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/\/\/.*$/, '').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');
    if (depth === 0 && /^\s*return\s*\{\s*init\b/.test(code)) { cut = i; break; }
    for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  }
  if (cut === -1) return { html, fixed: [] };
  lines.splice(cut, 1);
  let body = lines.join('\n');
  const definedElsewhere = PHYS_DEFINED.test(html.replace(physics, ''));
  if (!definedElsewhere) {
    const obs = /function\s+observe\s*\(/.test(physics) ? 'observe: observe' : 'observe: function (s) { return s; }';
    body += `\n  var PHYS = { init: init, step: step, ${obs} };`;
  }
  const next = putSection(html, 'physics', body);
  return next ? { html: next, fixed: ['секция physics без обёртки PHYS — убран обрывающий страницу return'] } : { html, fixed: [] };
}

/** Все механические починки по очереди. fixed — что сделано (для ленты и отладки). */
export function repairArtifact(html: string): { html: string; fixed: string[] } {
  const a = repairPhysics(html);
  const b = repairSyntax(a.html);
  return { html: b.html, fixed: [...a.fixed, ...b.fixed] };
}
