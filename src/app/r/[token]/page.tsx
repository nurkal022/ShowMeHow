import '../../research.css';
import { hasGraphicalContent } from '@/lib/research/article';
import '../../research-present.css';
import '../../research-theme.css';
import ResearchFonts from '@/components/research/ResearchFonts';
import { notFound } from 'next/navigation';
import { publicView } from '@/lib/research/store';
import { renderDoc } from '@/lib/research/doc';
import { renderGraphicalAbstract } from '@/lib/research/article-render';
import { doiCitation } from '@/lib/research/present';
import PublicResearch from '@/components/research/PublicResearch';
import type { ZenodoInfo } from '@/lib/research/zenodo';
import { getLocale } from '@/i18n/server';
import { formatDate } from '@/i18n/core';

const doi = (z: ZenodoInfo | null) => (z ? { doi: z.doi, url: z.url, sandbox: z.sandbox } : null);

type P = { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string; item?: string }> };

export async function generateMetadata({ params }: P) {
  const view = await publicView((await params).token).catch(() => null);
  const title = view?.project?.title ?? view?.items[0]?.title;
  const description = (view?.project?.description || view?.items[0]?.caption || '').slice(0, 200) || undefined;
  return {
    title: title ? `${title} — Tesseract` : 'Tesseract', description, robots: { index: false },
    openGraph: title ? { title, description, type: 'article' as const } : undefined,
  };
}

/**
 * Опубликованный материал или проект — открыто, по токену. Живёт вне (site):
 * у читателя статьи нет аккаунта, шапка сайта ему не нужна, а ?embed=1 убирает
 * и собственную шапку страницы — для iframe на сайте лаборатории;
 * ?embed=1&item=<id> встраивает один рисунок проекта.
 */
export default async function PublicResearchPage({ params, searchParams }: P) {
  const { token } = await params;
  const view = await publicView(token);
  if (!view) notFound();
  const sp = await searchParams;
  const embed = sp.embed === '1';
  const items = embed && sp.item ? view.items.filter((i) => i.id === sp.item) : view.items;
  if (embed && sp.item && !items.length) notFound();

  const locale = await getLocale();
  const p = view.project;
  const head = p ?? view.items[0];
  const zenodo = p ? p.zenodo : view.items[0]?.zenodo ?? null;
  const title = head?.title ?? '';
  const updatedIso = head?.updatedAt ?? new Date().toISOString();
  let graphical: string | null = null;
  if (p?.graphical && hasGraphicalContent(p.graphical) && !embed) {
    const fig = p.graphical.figureId ? view.items.find((i) => i.id === p.graphical!.figureId) : undefined;
    graphical = renderGraphicalAbstract(p.graphical, fig ? renderDoc(fig.kind, fig.doc, { clipId: 'pubga' }, locale) : null);
  }

  return (
    <>
    <ResearchFonts />
    <PublicResearch token={token} embed={embed} author={view.author} isProject={view.kind === 'project'}
      cover={{
        title, description: p?.description ?? '',
        updated: formatDate(updatedIso, locale), updatedIso,
        doi: doi(zenodo), cite: zenodo ? doiCitation(zenodo, { title, author: view.author }, locale) : null, graphical,
      }}
      items={items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, caption: i.caption, doc: i.kind === 'sim' ? null : i.doc,
        // У одиночного материала DOI уже на обложке.
        doi: view.kind === 'project' ? doi(i.zenodo) : null }))} />
    </>
  );
}
