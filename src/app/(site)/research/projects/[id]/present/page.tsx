import '../../../../../research-present.css';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getProject, listItems } from '@/lib/research/store';
import { buildModel, buildPlot, renderDoc, type ModelDoc, type PlotDoc } from '@/lib/research/doc';
import { renderPlot } from '@/lib/research/plot';
import { renderGraphicalAbstract } from '@/lib/research/article-render';
import { buildSlides } from '@/lib/research/present';
import Presenter, { type Slide } from '@/components/research/Presenter';
import { getLocale, getT } from '@/i18n/server';
import { formatDate } from '@/i18n/core';
import { researchHub } from '@/i18n/messages/research-hub';

export async function generateMetadata() {
  const t = await getT(researchHub);
  return { title: t('metaPresent'), robots: { index: false } };
}

/** Слайд — 16:9, как проектор; крупный кегль 'talk' читается с последнего ряда. */
const W = 1280, H = 720;

/**
 * Доклад по проекту: слайды собираются из рисунков сами. Картинки графиков и абстракта
 * рисуем здесь — клиент получает готовый SVG; модели остаются живыми (слайдеры на докладе).
 */
export default async function PresentPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ presenter?: string }>;
}) {
  const { id } = await params;
  const presenterView = (await searchParams).presenter === '1';
  const user = await requirePageUser(`/research/projects/${id}/present`);
  if (!user) return null;
  const project = await getProject(user.id, id);
  if (!project) notFound();
  const items = await listItems(user.id, { projectId: id });
  const byId = new Map(items.map((it) => [it.id, it]));
  const locale = await getLocale();

  const slides: Slide[] = buildSlides(project, items, locale).map((s, i) => {
    const it = s.itemId ? byId.get(s.itemId) : undefined;
    if (s.kind === 'graphical' && project.graphical) {
      const fig = project.graphical.figureId ? byId.get(project.graphical.figureId) : undefined;
      return { ...s, svg: renderGraphicalAbstract(project.graphical, fig ? renderDoc(fig.kind, fig.doc, { clipId: 'pga' }, locale) : null) };
    }
    if (!it) return s;
    try {
      if (it.kind === 'plot') return { ...s, svg: renderPlot({ ...buildPlot(it.doc as PlotDoc, locale).spec, style: 'talk', width: W, height: H, clipId: `ps${i}` }) };
      if (it.kind === 'model') {
        const doc = it.doc as ModelDoc;
        return { ...s, doc, svg: renderPlot({ ...buildModel(doc, undefined, locale).spec, style: 'talk', width: W, height: H, clipId: `ps${i}` }) };
      }
    } catch { /* битый документ — слайд с заголовком без картинки, доклад не падает */ }
    if (it.kind === 'sim') return { ...s, simulationId: (it.doc as { simulationId?: string }).simulationId };
    return s;
  });

  return (
    <Presenter projectId={project.id} title={project.title} description={project.description}
      author={user.displayName?.trim() || ''} date={formatDate(new Date(), locale)}
      publicToken={project.publicToken} slides={slides} presenterView={presenterView} />
  );
}
