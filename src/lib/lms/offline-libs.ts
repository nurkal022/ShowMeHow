import { CDN_WHITELIST, allowedPrefixes } from '../cdn';

/**
 * Офлайн-урок: тренажёр должен работать без интернета, поэтому библиотеки с CDN
 * (three, p5, matter, katex) вшиваются прямо в его HTML. Классические скрипты и стили
 * становятся встроенными, ES-модули — data:-адресами в importmap. Тянем только адреса
 * из белого списка CDN; что не скачалось, остаётся ссылкой — онлайн это по-прежнему работает.
 */

export type BytesFetcher = (url: string) => Promise<Buffer | null>;

const isAllowed = (url: string) => allowedPrefixes().some((p) => url.startsWith(p));
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString('base64')}`;
/** Текст скрипта внутри <script>: закрывающий тег разбил бы страницу. */
const scriptText = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1');

const CLASSIC_SRC = /<script\b([^>]*?)\ssrc\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi;
const STYLESHEET = /<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])[^>]*\bhref\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
const IMPORT_MAP = /<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/i;
const SPECIFIERS = [
  /\b(?:import|export)\s[^'";]*?\bfrom\s*(["'])([^"']+)\1/g,
  /\bimport\s*(["'])([^"']+)\1/g,
  /\bimport\(\s*(["'])([^"']+)\1\s*\)/g,
];

function specifiersOf(code: string): string[] {
  const out = new Set<string>();
  for (const re of SPECIFIERS) for (const m of code.matchAll(re)) out.add(m[2]);
  return [...out];
}

function resolve(spec: string, imports: Record<string, string>, base?: string): string | null {
  if (imports[spec]) return imports[spec];
  const prefix = Object.keys(imports).filter((k) => k.endsWith('/') && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (prefix) return imports[prefix] + spec.slice(prefix.length);
  if (/^https?:\/\//.test(spec)) return spec;
  if (base && /^\.{1,2}\//.test(spec)) return new URL(spec, base).toString();
  return null;
}

/** Запасные woff/ttf после вшитого woff2: браузер всё равно тянет их по относительному адресу и сыплет ошибками. */
export function dropFontFallbacks(css: string): string {
  return css.replace(/(url\(data:font\/woff2[^)]*\)\s*format\(["']?woff2["']?\))(?:\s*,\s*url\([^)]*\)\s*format\([^)]*\))+/g, '$1');
}

/** Шрифты KaTeX и прочее, на что ссылается стиль, — тоже внутрь; берём только woff2, браузеру хватает. */
async function inlineCss(css: string, base: string, fetchBytes: BytesFetcher): Promise<string> {
  const urls = [...new Set([...css.matchAll(/url\((["']?)([^)"']+\.woff2)\1\)/g)].map((m) => m[2]))];
  const found = await Promise.all(urls.map(async (u) => {
    const abs = new URL(u, base).toString();
    const b = isAllowed(abs) ? await fetchBytes(abs) : null;
    return [u, b ? dataUrl('font/woff2', b) : null] as const;
  }));
  for (const [u, d] of found) if (d) css = css.split(u).join(d);
  return dropFontFallbacks(css);
}

export async function inlineSimLibs(html: string, fetchBytes: BytesFetcher): Promise<string> {
  // Классические скрипты: <script src="cdn"> → <script>текст</script>.
  const classic = [...html.matchAll(CLASSIC_SRC)].filter((m) => !/type\s*=\s*["']module["']/i.test(m[1] + m[4]) && isAllowed(m[3]));
  const scripts = await Promise.all(classic.map((m) => fetchBytes(m[3])));
  classic.forEach((m, i) => {
    const b = scripts[i];
    if (!b) return;
    const attrs = (m[1] + m[4]).replace(/\s(?:integrity|crossorigin)\s*=\s*(["'])[^"']*\1/gi, '').replace(/\s(?:async|defer)\b/gi, '');
    html = html.replace(m[0], () => `<script${attrs}>${scriptText(b.toString('utf8'))}</script>`);
  });

  const sheets = [...html.matchAll(STYLESHEET)].filter((m) => isAllowed(m[2]));
  const css = await Promise.all(sheets.map(async (m) => {
    const b = await fetchBytes(m[2]);
    return b ? inlineCss(b.toString('utf8'), m[2], fetchBytes) : null;
  }));
  sheets.forEach((m, i) => { if (css[i] !== null) html = html.replace(m[0], () => `<style>${css[i]}</style>`); });

  // Кит грузит KaTeX сам, по первой формуле (K.__katex в kit-widgets), — но сначала смотрит на window.katex.
  if (html.includes(CDN_WHITELIST.katexJs) && !classic.some((m, i) => m[3] === CDN_WHITELIST.katexJs && scripts[i])) {
    const [js, sheet] = await Promise.all([fetchBytes(CDN_WHITELIST.katexJs), fetchBytes(CDN_WHITELIST.katexCss)]);
    if (js) {
      const style = sheet ? `<style>${await inlineCss(sheet.toString('utf8'), CDN_WHITELIST.katexCss, fetchBytes)}</style>` : '';
      html = html.replace(/<head[^>]*>/i, (h) => `${h}${style}<script>${scriptText(js.toString('utf8'))}</script>`);
    }
  }

  return inlineModules(html, fetchBytes);
}

/**
 * Модули: всё, что импортирует страница (и что импортируют сами библиотеки), скачиваем,
 * относительные импорты внутри переписываем на полные адреса и кладём в importmap
 * парами «как импортировали» → data:. Одинаковый адрес даёт одинаковый data: — значит,
 * three в странице и в аддонах остаётся одним экземпляром.
 */
async function inlineModules(html: string, fetchBytes: BytesFetcher): Promise<string> {
  const mapTag = IMPORT_MAP.exec(html);
  let imports: Record<string, string> = {};
  if (mapTag) {
    try { imports = (JSON.parse(mapTag[1]) as { imports?: Record<string, string> }).imports ?? {}; } catch { return html; }
  }
  const moduleCode = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  const moduleSrc = [...html.matchAll(CLASSIC_SRC)].filter((m) => /type\s*=\s*["']module["']/i.test(m[1] + m[4]) && isAllowed(m[3]));
  const roots = [...specifiersOf(moduleCode), ...moduleSrc.map((m) => m[3])];
  if (!roots.length) return html;

  const keys = new Map<string, string>(); // спецификатор → адрес
  const code = new Map<string, string>(); // адрес → текст модуля с полными адресами внутри
  const queue: string[] = [];
  const visit = (spec: string, base?: string): string | null => {
    const url = resolve(spec, imports, base);
    if (!url || !isAllowed(url)) return null;
    if (!base) keys.set(spec, url);
    if (!code.has(url) && !queue.includes(url)) queue.push(url);
    return url;
  };
  roots.forEach((s) => visit(s));
  for (let i = 0; i < queue.length && i < 60; i++) {
    const url = queue[i];
    const b = await fetchBytes(url);
    if (!b) continue;
    let text = b.toString('utf8');
    for (const spec of specifiersOf(text)) {
      if (!/^\.{1,2}\//.test(spec)) { const u = visit(spec); if (u && !/^https?:/.test(spec)) keys.set(spec, u); continue; }
      const abs = visit(spec, url);
      if (abs) text = text.split(`'${spec}'`).join(`'${abs}'`).split(`"${spec}"`).join(`"${abs}"`);
    }
    code.set(url, text);
  }
  if (!code.size) return html;

  const data = new Map([...code].map(([url, text]) => [url, dataUrl('text/javascript', Buffer.from(text, 'utf8'))]));
  const next: Record<string, string> = { ...imports };
  for (const [spec, url] of keys) if (data.has(url)) next[spec] = data.get(url)!;
  for (const [url, d] of data) next[url] = d;
  const tag = `<script type="importmap">${JSON.stringify({ imports: next })}</script>`;
  html = mapTag ? html.replace(mapTag[0], () => tag) : html.replace(/<head[^>]*>/i, (h) => h + tag);
  for (const m of moduleSrc) {
    if (data.has(m[3])) html = html.replace(m[0], () => `<script type="module">import ${JSON.stringify(m[3])};</script>`);
  }
  return html;
}

/** Скачивание с CDN для сервера: только белый список, с таймаутом и кэшем на время жизни процесса. */
const cache = new Map<string, Promise<Buffer | null>>();
export const cdnFetcher: BytesFetcher = (url) => {
  if (!isAllowed(url)) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { signal: AbortSignal.timeout(15_000) })
      .then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null))
      .catch(() => null);
    p.then((b) => { if (!b) cache.delete(url); });
    cache.set(url, p);
  }
  return p;
};
