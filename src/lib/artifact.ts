import { HARNESS_JS, UIKIT_CSS, UIKIT_JS } from './runtime';

const MARKER = '<!--showmehow-runtime-->';
const END_MARKER = '<!--/showmehow-runtime-->';

export function extractHtml(llmOutput: string): string {
  const fenced = llmOutput.match(/```html\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = llmOutput.search(/<!DOCTYPE html|<html[\s>]/i);
  if (start === -1) throw new Error('no html document found in LLM output');
  const closeRe = /<\/html>/gi;
  let end = -1;
  let match: RegExpExecArray | null;
  while ((match = closeRe.exec(llmOutput)) !== null) {
    end = match.index;
  }
  if (end === -1) throw new Error('no closing </html> found in LLM output');
  return llmOutput.slice(start, end + '</html>'.length).trim();
}

export function extractJson<T>(llmOutput: string): T {
  const fenced = llmOutput.match(/```json\s*\n([\s\S]*?)```/);
  const source = fenced ? fenced[1] : llmOutput;
  const start = source.indexOf('{');
  if (start === -1) throw new Error('no JSON object found in LLM output');
  // Ищем сбалансированную закрывающую скобку, игнорируя { } внутри строковых значений
  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped character
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    }
    if (depth === 0) return JSON.parse(source.slice(start, i + 1));
  }
  throw new Error('unbalanced JSON in LLM output');
}

const ATTR_URL_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const IMPORT_FROM_RE = /import\s+[^'";]*from\s*["']([^"']+)["']/gi;
const IMPORT_CALL_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/gi;

/**
 * Находит абсолютные http(s) URL в src=/href= атрибутах и в ES-module import (`import ... from
 * "http..."` / `import("http...")`), которые не разрешены whitelist'ом. Разрешённый префикс —
 * директория (без имени файла) каждого whitelist-URL: строгое совпадение по origin+path,
 * без допуска на весь пакет (см. CDN_WHITELIST.three — только build/, не весь three@версия/).
 * data: и относительные пути игнорируются.
 */
export function findForbiddenUrls(html: string, allowed: string[]): string[] {
  const allowedPrefixes = allowed.map((u) => u.slice(0, u.lastIndexOf('/') + 1));
  const isAllowed = (url: string) => allowedPrefixes.some((p) => url.startsWith(p));
  const urls = new Set<string>();
  for (const re of [ATTR_URL_RE, IMPORT_FROM_RE, IMPORT_CALL_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const url = m[1];
      if (/^https?:\/\//i.test(url)) urls.add(url);
    }
  }
  return [...urls].filter((u) => !isAllowed(u));
}

export function instrument(html: string): string {
  if (html.includes(MARKER)) return html;
  const runtime = `${MARKER}<script>${HARNESS_JS}</script>` +
    `<style>${UIKIT_CSS}</style><script>${UIKIT_JS}</script>${END_MARKER}`;

  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + runtime + html.slice(idx);
  }

  // Нет <head> — вставляем сразу после открывающего <html...>, чтобы runtime
  // выполнился раньше остального содержимого документа.
  const htmlMatch = html.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const idx = html.indexOf(htmlMatch[0]) + htmlMatch[0].length;
    return html.slice(0, idx) + runtime + html.slice(idx);
  }

  // Нет и <html> — вставляем после doctype, чтобы runtime не оказался раньше него
  // (некоторые браузеры уходят в quirks mode, если что-то предшествует doctype).
  const doctypeMatch = html.match(/<!doctype[^>]*>/i);
  if (doctypeMatch) {
    const idx = html.indexOf(doctypeMatch[0]) + doctypeMatch[0].length;
    return html.slice(0, idx) + runtime + html.slice(idx);
  }

  // Нет ничего из вышеперечисленного — просто добавляем в начало.
  return runtime + html;
}

/**
 * Снимает ранее вставленный нами рантайм-блок в двух формах:
 *  - новая: между MARKER и END_MARKER;
 *  - легаси (старые сохранённые файлы): MARKER + ровно наши три тега без закрывающего
 *    маркера. Regex заякорен на MARKER, поэтому собственные скрипты артефакта не трогает.
 */
export function stripRuntime(html: string): string {
  return html
    .replace(/<!--showmehow-runtime-->[\s\S]*?<!--\/showmehow-runtime-->/g, '')
    .replace(
      /<!--showmehow-runtime--><script>[\s\S]*?<\/script><style>[\s\S]*?<\/style><script>[\s\S]*?<\/script>/g,
      '',
    );
}

/** Пере-инструментирует HTML текущим рантаймом (снять старый блок → вставить свежий). */
export function reinstrument(html: string): string {
  return instrument(stripRuntime(html));
}
