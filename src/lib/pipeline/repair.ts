import vm from 'node:vm';
import { getSection, putSection } from './sections';
import { CDN_WHITELIST, allowedPrefixes } from '../cdn';

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
 * - ссылка на разрешённую библиотеку, но другой версии или с другого CDN: сеть рендера её
 *   блокирует, проба cdn проваливается — а это переписывается на закреплённый адрес.
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

const CDN_URL = /(["'])(https?:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com|cdnjs\.cloudflare\.com\/ajax\/libs)\/[^"'\s]+)\1/g;
const CDNJS_NAMES: Record<string, string> = { 'three.js': 'three', 'p5.js': 'p5', 'matter-js': 'matter-js', KaTeX: 'katex' };

/** Пакет, версия и файл из адреса jsdelivr/unpkg/cdnjs; null — не разобрали. */
function cdnParts(url: string): { pkg: string; file: string } | null {
  if (/[?#%\\]|\.\./.test(url)) return null;
  const npm = /^https?:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[^/]+\/)?[^/@]+)(?:@[^/]+)?\/(.+)$/.exec(url);
  if (npm) return { pkg: npm[1], file: npm[2] };
  const js = /^https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/[^/]+\/(.+)$/.exec(url);
  return js && CDNJS_NAMES[js[1]] ? { pkg: CDNJS_NAMES[js[1]], file: js[2] } : null;
}

/** Закреплённый адрес той же сборки. Глобальную three.min.js на модульную не меняем — код ждёт window.THREE. */
export function pinnedCdnUrl(url: string): string | null {
  const p = cdnParts(url);
  if (!p) return null;
  const file = p.file.replace(/^dist\//, '');
  switch (p.pkg) {
    case 'three':
      if (/^(?:build\/)?three\.module(?:\.min)?\.js$/.test(p.file)) return CDN_WHITELIST.three;
      if (p.file.startsWith('examples/jsm/')) return CDN_WHITELIST.threeAddons + p.file.slice('examples/jsm/'.length);
      return null;
    case 'p5': return /^(?:lib\/)?p5(?:\.min)?\.js$/.test(p.file) ? CDN_WHITELIST.p5 : null;
    case 'matter-js': return /^(?:build\/)?matter(?:\.min)?\.js$/.test(p.file) ? CDN_WHITELIST.matter : null;
    case 'katex':
      if (/^katex(?:\.min)?\.js$/.test(file)) return CDN_WHITELIST.katexJs;
      if (/^katex(?:\.min)?\.css$/.test(file)) return CDN_WHITELIST.katexCss;
      return null;
    default: return null;
  }
}

/** Неразрешённые адреса известных библиотек → закреплённые; integrity у переписанных снимаем, иначе браузер их отвергнет. */
export function repairCdn(html: string): { html: string; fixed: string[] } {
  const allowed = allowedPrefixes();
  const fixed: string[] = [];
  let out = html.replace(CDN_URL, (all, q: string, url: string) => {
    if (allowed.some((a) => url.startsWith(a))) return all;
    const pinned = pinnedCdnUrl(url);
    if (!pinned) return all;
    fixed.push(`адрес ${url} → ${pinned}`);
    return q + pinned + q;
  });
  if (fixed.length) out = out.replace(/<(script|link)\b([^>]*?)\s+integrity\s*=\s*(["'])[^"']*\3([^>]*)>/gi, '<$1$2$4>');
  return { html: out, fixed };
}

/** Все механические починки по очереди. fixed — что сделано (для ленты и отладки). */
export function repairArtifact(html: string): { html: string; fixed: string[] } {
  const a = repairPhysics(html);
  const b = repairSyntax(a.html);
  const c = repairCdn(b.html);
  return { html: c.html, fixed: [...a.fixed, ...b.fixed, ...c.fixed] };
}
