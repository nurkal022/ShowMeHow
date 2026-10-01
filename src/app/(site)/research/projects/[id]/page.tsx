import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getProject, listItems } from '@/lib/research/store';
import { listSimulations } from '@/lib/storage';
import { itemCards } from '@/lib/research/cards';
import { renderDoc } from '@/lib/research/doc';
import { listArticles } from '@/lib/research/articles-store';
import ProjectView from '@/components/research/ProjectView';
import { getLocale } from '@/i18n/server';

export default async function ResearchProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/research/projects/${id}`);
  if (!user) return null;
  const project = await getProject(user.id, id);
  if (!project) notFound();
  const locale = await getLocale();
  const [items, sims, articles] = await Promise.all([listItems(user.id, { projectId: id }), listSimulations(user.id), listArticles(user.id, id)]);
  return (
    <ProjectView project={project} items={itemCards(items, [project], locale)} articles={articles}
      gaFigures={items.map((it, i) => ({ id: it.id, title: it.title, kind: it.kind, svg: renderDoc(it.kind, it.doc, { clipId: `ga${i}` }, locale) }))}
      sims={sims.filter((s) => !s.demo).map((s) => ({ id: s.id, title: s.title }))} />
  );
}
