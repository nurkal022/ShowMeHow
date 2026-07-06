import { HARNESS_JS, UIKIT_CSS, UIKIT_JS } from './runtime';

const MARKER = '<!--showmehow-runtime-->';

export function extractHtml(llmOutput: string): string {
  const fenced = llmOutput.match(/```html\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = llmOutput.search(/<!DOCTYPE html|<html[\s>]/i);
  if (start === -1) throw new Error('no html document found in LLM output');
  const end = llmOutput.lastIndexOf('</html>');
  if (end === -1) throw new Error('no closing </html> found in LLM output');
  return llmOutput.slice(start, end + '</html>'.length).trim();
}

export function extractJson<T>(llmOutput: string): T {
  const fenced = llmOutput.match(/```json\s*\n([\s\S]*?)```/);
  const source = fenced ? fenced[1] : llmOutput;
  const start = source.indexOf('{');
  if (start === -1) throw new Error('no JSON object found in LLM output');
  // Ищем сбалансированную закрывающую скобку
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return JSON.parse(source.slice(start, i + 1));
  }
  throw new Error('unbalanced JSON in LLM output');
}

export function instrument(html: string): string {
  if (html.includes(MARKER)) return html;
  const runtime = `${MARKER}<script>${HARNESS_JS}</script>` +
    `<style>${UIKIT_CSS}</style><script>${UIKIT_JS}</script>`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + runtime + html.slice(idx);
  }
  return runtime + html;
}
