import { renderDoc } from './doc';
import type { ResearchItem, ResearchProject } from './store';
import type { ResearchKind } from './doc';
import type { Locale } from '@/i18n/config';

export interface ItemCard {
  id: string;
  kind: ResearchKind;
  title: string;
  projectId: string | null;
  projectTitle: string | null;
  updatedAt: string;
  shared: boolean;
  thumb: string | null;
}

/** Карточки материалов с превью: SVG строится на сервере из документа. */
export function itemCards(items: ResearchItem[], projects: ResearchProject[], locale: Locale = 'ru'): ItemCard[] {
  const titles = new Map(projects.map((p) => [p.id, p.title]));
  return items.map((it, i) => ({
    id: it.id, kind: it.kind, title: it.title, updatedAt: it.updatedAt, shared: !!it.publicToken,
    projectId: it.projectId,
    projectTitle: it.projectId ? titles.get(it.projectId) ?? null : null,
    thumb: renderDoc(it.kind, it.doc, { width: 360, height: 225, clipId: `th${i}` }, locale),
  }));
}
