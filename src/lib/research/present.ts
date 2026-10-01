import type { GraphicalAbstract } from './article';
import { hasGraphicalContent } from './article';
import type { ResearchKind } from './doc';
import { citations, creatorName, type ZenodoInfo } from './zenodo';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';

/**
 * Режим доклада и публичная страница проекта — чистые помощники без DOM и базы:
 * список слайдов из проекта, навигация с пропуском скрытых, строки цитирования.
 * Их зовут и сервер (сборка слайдов), и браузер (клавиши, панель «Как цитировать»).
 */

export type SlideKind = 'title' | 'graphical' | 'plot' | 'model' | 'sim' | 'end';

export interface SlideDesc {
  key: string;
  kind: SlideKind;
  /** Заголовок слайда: название проекта, «Графический абстракт», название рисунка. */
  title: string;
  /** Заметки докладчика: подпись рисунка, описание проекта. */
  notes: string;
  itemId?: string;
  /** Номер рисунка как на публичной странице — «Рис. 3» в докладе и в статье совпадают. */
  figNo?: number;
}

export function buildSlides(
  project: { title: string; description: string; graphical: GraphicalAbstract | null },
  items: { id: string; kind: ResearchKind; title: string; caption: string }[],
  locale: Locale = 'ru',
): SlideDesc[] {
  const t = translator(researchFigure, locale);
  const slides: SlideDesc[] = [{ key: 'title', kind: 'title', title: project.title, notes: project.description }];
  const ga = project.graphical;
  if (ga && hasGraphicalContent(ga)) {
    const notes = [ga.headline, ...ga.steps.map((s, i) => `${i + 1}. ${s.label}${s.detail ? ` — ${s.detail}` : ''}`), ga.takeaway]
      .map((s) => s.trim()).filter(Boolean).join('\n');
    slides.push({ key: 'graphical', kind: 'graphical', title: t('slideGraphical'), notes });
  }
  items.forEach((it, i) => slides.push({ key: it.id, kind: it.kind, title: it.title, notes: it.caption, itemId: it.id, figNo: i + 1 }));
  slides.push({ key: 'end', kind: 'end', title: t('slideEnd'), notes: '' });
  return slides;
}

/* --------------------------------- навигация --------------------------------- */

export type PresentAction = 'next' | 'prev' | 'first' | 'last' | 'fullscreen' | 'notes' | 'overview' | 'exit';

/** Клавиши пульта и клавиатуры → действие. Кликеры для презентаций шлют PageUp/PageDown. */
export function keyAction(key: string, shift = false): PresentAction | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': return 'next';
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': return 'prev';
    case ' ': case 'Spacebar': return shift ? 'prev' : 'next';
    case 'Home': return 'first';
    case 'End': return 'last';
    case 'f': case 'F': case 'а': case 'А': return 'fullscreen';
    case 'n': case 'N': case 'т': case 'Т': return 'notes';
    case 'g': case 'G': case 'п': case 'П': return 'overview';
    case 'Escape': return 'exit';
    default: return null;
  }
}

/**
 * Следующий видимый слайд в направлении dir (+1/−1) или крайний (dir = ±Infinity).
 * Скрытые пропускаются; если идти некуда — остаёмся на месте.
 */
export function stepSlide(index: number, dir: number, total: number, hidden: ReadonlySet<number> = new Set()): number {
  const visible = (i: number) => i >= 0 && i < total && !hidden.has(i);
  if (dir === Infinity || dir === -Infinity) {
    const order = [...Array(total).keys()];
    const found = (dir > 0 ? order.reverse() : order).find(visible);
    return found ?? index;
  }
  for (let i = index + dir; i >= 0 && i < total; i += dir) if (visible(i)) return i;
  return index;
}

/** Видимые слайды по порядку — для счётчика «3 / 9» и полосы прогресса. */
export const visibleSlides = (total: number, hidden: ReadonlySet<number>) => [...Array(total).keys()].filter((i) => !hidden.has(i));

/* --------------------------------- цитирование --------------------------------- */

export interface CitationSet { gost: string; apa: string; bibtex: string }

const pad = (n: number) => String(n).padStart(2, '0');
const bibEsc = (s: string) => s.replace(/([&%$#_{}])/g, '\\$1');

/**
 * Ссылка на веб-страницу, когда DOI ещё нет: ГОСТ Р 7.0.100 с датой обращения,
 * APA 7 с «Retrieved …» и BibTeX @misc с urldate — этого хватает для списка литературы.
 */
export function webCitation(input: { title: string; author: string; url: string; accessed: Date; updated?: string | null }, locale: Locale = 'ru'): CitationSet {
  const t = translator(researchFigure, locale);
  const { title, url, accessed } = input;
  const name = input.author.trim() ? creatorName(input.author) : '';
  const [family, given = ''] = name.split(',').map((s) => s.trim());
  const initials = given.split(/[\s-]+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');
  const upd = input.updated ? new Date(input.updated) : null;
  const year = upd && !Number.isNaN(upd.getTime()) ? upd.getFullYear() : accessed.getFullYear();
  const dmy = `${pad(accessed.getDate())}.${pad(accessed.getMonth() + 1)}.${accessed.getFullYear()}`;
  const iso = `${accessed.getFullYear()}-${pad(accessed.getMonth() + 1)}-${pad(accessed.getDate())}`;

  const gostHead = family ? `${family}${initials ? ` ${initials}` : ''} ` : '';
  const gostResp = family ? ` / ${initials ? `${initials} ` : ''}${family}` : '';
  const gost = t('webCiteGost', { head: gostHead, title, resp: gostResp, year, url, date: dmy });

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const apaAuthor = family ? `${family}${initials ? `, ${initials}` : ''} ` : '';
  const apa = `${apaAuthor}(${year}). ${title} [Interactive figures]. Tesseract. Retrieved ${months[accessed.getMonth()]} ${accessed.getDate()}, ${accessed.getFullYear()}, from ${url}`;

  const key = `${(family || 'tesseract').toLowerCase().replace(/[^a-zа-яё0-9]/gi, '')}${year}`;
  const bibtex = [
    `@misc{${key},`,
    ...(family ? [`  author       = {${bibEsc(given ? `${family}, ${given}` : family)}},`] : []),
    `  title        = {{${bibEsc(title)}}},`,
    `  year         = {${year}},`,
    `  howpublished = {\\url{${url}}},`,
    `  note         = {${t('webCiteNote')}},`,
    `  urldate      = {${iso}}`,
    '}',
  ].join('\n');
  return { gost, apa, bibtex };
}

/** Цитаты по DOI из Zenodo; авторов и название берём из записи, иначе — со страницы. */
export function doiCitation(z: ZenodoInfo, fallback: { title: string; author: string }, locale: Locale = 'ru'): CitationSet {
  const year = new Date(z.publishedAt).getFullYear();
  return citations({
    doi: z.doi, title: z.title || fallback.title, version: z.version, uploadType: z.uploadType,
    creators: z.creators?.length ? z.creators : fallback.author.trim() ? [creatorName(fallback.author)] : [],
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
  }, locale);
}

/** Ссылка DOI для читателя: у тестовых записей (sandbox) doi.org не открывается — ведём на запись. */
export const doiHref = (z: { doi: string; url: string; sandbox: boolean }) => (z.sandbox ? z.url : `https://doi.org/${z.doi}`);
