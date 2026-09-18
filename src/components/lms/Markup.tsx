import 'katex/dist/katex.min.css';
import katex from 'katex';
import { renderMarkup } from '@/lib/lms/markup';

/** KaTeX сам экранирует ввод и с trust: false не пропускает ни ссылок, ни HTML. */
export function renderTex(tex: string, display: boolean): string {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' });
}

/** renderMarkup экранирует весь ввод до разметки — см. src/lib/lms/markup.ts и его XSS-тесты. */
export default function Markup({ text }: { text: string }) {
  return <div className="markup" dangerouslySetInnerHTML={{ __html: renderMarkup(text, renderTex) }} />;
}

export function Tex({ tex, display = true }: { tex: string; display?: boolean }) {
  return <span className={display ? 'tex tex-display' : 'tex'} dangerouslySetInnerHTML={{ __html: renderTex(tex, display) }} />;
}
