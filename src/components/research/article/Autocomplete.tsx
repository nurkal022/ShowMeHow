'use client';
import type { Reference } from '@/lib/research/article';
import type { FigureInfo } from './context';
import { useT } from '@/i18n/client';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchArticle } from '@/i18n/messages/research-article';

/** Что сейчас подсказываем у каретки: команды «/», источники «@» или рисунки «[[». */
export type MenuKind = 'slash' | 'cite' | 'fig' | 'figblock';

export interface MenuState { kind: MenuKind; start: number; query: string; top: number; left: number; index: number }

export interface MenuOption { key: string; label: string; hint?: string; insert?: string; next?: MenuKind; cursorBack?: number }

type SlashKey = 'slFig' | 'slFigref' | 'slCite' | 'slMath' | 'slH' | 'slList' | 'slTodo';
const SLASH: (Omit<MenuOption, 'label' | 'hint'> & { label: SlashKey; hint?: 'slFigHint' | 'slFigrefHint' | 'slCiteHint' | 'slMathHint' | 'slTodoHint' })[] = [
  { key: 'fig', label: 'slFig', hint: 'slFigHint', next: 'figblock' },
  { key: 'figref', label: 'slFigref', hint: 'slFigrefHint', next: 'fig' },
  { key: 'cite', label: 'slCite', hint: 'slCiteHint', next: 'cite' },
  { key: 'math', label: 'slMath', hint: 'slMathHint', insert: '$$  $$', cursorBack: 3 },
  { key: 'h', label: 'slH', insert: '## ' },
  { key: 'list', label: 'slList', insert: '- ' },
  { key: 'todo', label: 'slTodo', hint: 'slTodoHint', insert: '[[TODO: ]]', cursorBack: 2 },
];

/** Триггер меню по тексту до каретки; null — меню не нужно. */
export function detectTrigger(before: string): { kind: MenuKind; start: number; query: string } | null {
  let m = /(^|\s)\/([\p{L}\d]*)$/u.exec(before);
  if (m) return { kind: 'slash', start: before.length - m[2].length - 1, query: m[2] };
  m = /(^|[\s([;])@([\w:.\-а-яё]*)$/iu.exec(before);
  if (m) return { kind: 'cite', start: before.length - m[2].length - 1, query: m[2] };
  m = /\[\[([^\]\s]*)$/.exec(before);
  if (m) return { kind: 'fig', start: before.length - m[1].length - 2, query: m[1] };
  return null;
}

export function menuOptions(kind: MenuKind, query: string, refs: Reference[], figures: FigureInfo[], order: string[], locale: Locale = 'ru'): MenuOption[] {
  const q = query.toLowerCase();
  const t = translator(researchArticle, locale);
  if (kind === 'slash') {
    return SLASH.map((o) => ({ ...o, label: t(o.label), hint: o.hint && t(o.hint) }))
      .filter((o) => o.label.toLowerCase().includes(q) || o.key.startsWith(q));
  }
  if (kind === 'cite') {
    return refs.filter((r) => `${r.id} ${r.title} ${r.authors.map((a) => a.family).join(' ')}`.toLowerCase().includes(q)).slice(0, 8)
      .map((r) => ({ key: r.id, label: `@${r.id}`, hint: `${r.authors[0]?.family ?? ''}${r.year ? `, ${r.year}` : ''} — ${r.title.slice(0, 60)}`, insert: `[@${r.id}]` }));
  }
  return figures.filter((f) => f.title.toLowerCase().includes(q)).slice(0, 8).map((f) => {
    const n = order.indexOf(f.id) + 1;
    return { key: f.id, label: f.title, hint: n ? t('figNow', { n }) : t('figNotInText'), insert: kind === 'figblock' ? `\n{{fig:${f.id}}}\n` : `[[fig:${f.id}]]` };
  });
}

export default function AutocompleteMenu({ menu, options, onChoose }: { menu: MenuState; options: MenuOption[]; onChoose: (o: MenuOption) => void }) {
  const t = useT(researchArticle);
  const title = t(({ slash: 'acInsert', cite: 'acCite', fig: 'acFig', figblock: 'acFigBlock' } as const)[menu.kind]);
  return (
    <div className="ac-menu" style={{ top: menu.top, left: menu.left }} role="listbox" onMouseDown={(e) => e.preventDefault()}>
      <div className="ac-title">{title}</div>
      {options.length === 0 && <div className="ac-empty">{menu.kind === 'cite' ? t('acNoRefs') : t('acNothing')}</div>}
      {options.map((o, i) => (
        <button key={o.key} type="button" role="option" aria-selected={i === menu.index} className={i === menu.index ? 'ac-item on' : 'ac-item'} onClick={() => onChoose(o)}>
          <span className="ac-label">{o.label}</span>
          {o.hint && <span className="ac-hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
