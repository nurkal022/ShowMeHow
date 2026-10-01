import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getArticle } from '@/lib/research/articles-store';
import { getProject, listItems } from '@/lib/research/store';
import { renderDoc, type SimDoc } from '@/lib/research/doc';
import ArticleEditor from '@/components/research/article/ArticleEditor';
import type { FigureInfo } from '@/components/research/article/context';
import { getLocale, getT } from '@/i18n/server';
import { researchHub } from '@/i18n/messages/research-hub';

export async function generateMetadata() {
  const t = await getT(researchHub);
  return { title: t('metaArticle') };
}

/** Рисунки статьи — материалы её проекта; у статьи без проекта — все материалы автора. */
export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/research/articles/${id}`);
  if (!user) return null;
  const article = await getArticle(user.id, id);
  if (!article) notFound();
  const [project, items] = await Promise.all([
    article.projectId ? getProject(user.id, article.projectId) : null,
    listItems(user.id, article.projectId ? { projectId: article.projectId } : {}),
  ]);
  const locale = await getLocale();
  const figures: FigureInfo[] = items.map((it, i) => ({
    id: it.id, kind: it.kind, title: it.title, caption: it.caption,
    svg: renderDoc(it.kind, it.doc, { clipId: `af${i}` }, locale),
    image: it.kind === 'sim' ? `/api/simulations/${(it.doc as SimDoc).simulationId}/thumbnail` : null,
  }));
  return (
    <ArticleEditor id={article.id} initialTitle={article.title} initialDoc={article.doc}
      projectId={article.projectId} projectTitle={project?.title ?? null} figures={figures} />
  );
}
