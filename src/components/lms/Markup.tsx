import { renderMarkup } from '@/lib/lms/markup';

/** renderMarkup экранирует весь ввод до разметки — см. src/lib/lms/markup.ts и его XSS-тесты. */
export default function Markup({ text }: { text: string }) {
  return <div className="markup" dangerouslySetInnerHTML={{ __html: renderMarkup(text) }} />;
}
