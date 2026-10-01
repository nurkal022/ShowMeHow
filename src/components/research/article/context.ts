'use client';
import { createContext, useContext } from 'react';
import type { AiLogEntry, ArticleDoc, ArticleSection } from '@/lib/research/article';
import type { TFn } from '@/i18n/core';
import type { researchArticle } from '@/i18n/messages/research-article';

/** Рисунок проекта, доступный статье: готовый SVG или картинка симуляции. */
export interface FigureInfo {
  id: string;
  kind: 'plot' | 'model' | 'sim';
  title: string;
  caption: string;
  svg: string | null;
  image: string | null;
}

export interface ArticleCtx {
  articleId: string;
  title: string;
  setTitle: (t: string) => void;
  doc: ArticleDoc;
  update: (fn: (d: ArticleDoc) => ArticleDoc) => void;
  figures: FigureInfo[];
  setFigureCaption: (id: string, caption: string) => void;
  /** Вызов ИИ-помощника; ответ — JSON роута. Ошибка — исключение с текстом для человека. */
  ai: <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;
  /** То же потоком: onText получает накопленный текст по мере генерации; результат — очищенный текст. */
  aiStream: (action: string, extra: Record<string, unknown>, onText: (text: string) => void) => Promise<string>;
  log: (entry: Omit<AiLogEntry, 'at'>) => void;
}

export const Ctx = createContext<ArticleCtx | null>(null);

export function useArticle(): ArticleCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useArticle вне ArticleEditor');
  return c;
}

type ArticleT = TFn<typeof researchArticle.ru>;

/** Подсказка и чек-лист раздела на языке интерфейса (пункты в словаре разделены «|»). */
export function sectionGuide(key: ArticleSection['key'], t: ArticleT): { hint: string; checklist: string[] } {
  return { hint: t(`guide_${key}`), checklist: t(`guide_${key}_c`).split('|').filter(Boolean) };
}

/** Название журнала в списке: у зарубежных — как есть, у «своих» — перевод. */
const JOURNAL_LABEL_KEYS: Record<string, 'jGeneric' | 'jKzVestnik' | 'jRuJournal'> = { generic: 'jGeneric', 'kz-vestnik': 'jKzVestnik', 'ru-journal': 'jRuJournal' };
export const journalLabel = (j: { key: string; label: string }, t: ArticleT): string => (JOURNAL_LABEL_KEYS[j.key] ? t(JOURNAL_LABEL_KEYS[j.key]) : j.label);

export const JOURNALS: { key: string; label: string; abstractWords: number; style: ArticleDoc['citationStyle']; langs: ArticleDoc['lang'][] }[] = [
  { key: 'generic', label: 'Без привязки к журналу', abstractWords: 250, style: 'gost', langs: ['ru'] },
  { key: 'elsevier', label: 'Elsevier', abstractWords: 250, style: 'ieee', langs: ['en'] },
  { key: 'springer', label: 'Springer Nature', abstractWords: 250, style: 'vancouver', langs: ['en'] },
  { key: 'mdpi', label: 'MDPI', abstractWords: 200, style: 'ieee', langs: ['en'] },
  { key: 'ieee', label: 'IEEE', abstractWords: 250, style: 'ieee', langs: ['en'] },
  { key: 'aps', label: 'APS (Phys. Rev.)', abstractWords: 250, style: 'ieee', langs: ['en'] },
  { key: 'kz-vestnik', label: 'Вестник вуза РК (3 аннотации)', abstractWords: 250, style: 'gost', langs: ['kk', 'ru', 'en'] },
  { key: 'ru-journal', label: 'Российский журнал (ВАК)', abstractWords: 250, style: 'gost', langs: ['ru', 'en'] },
];
