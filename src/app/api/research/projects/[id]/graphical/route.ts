import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { notFound, type IdParams } from '@/lib/http/route-kit';
import { throttled } from '@/lib/http/throttle';
import { getProject, listItems } from '@/lib/research/store';
import { getArticle, listArticles } from '@/lib/research/articles-store';
import { withResearchErrors } from '@/lib/research/http';
import { graphicalAbstract, projectFacts } from '@/lib/research/writer';
import { localeFromRequest } from '@/i18n/config';

/** Черновик графического абстракта по проекту: его рисунки, описание и аннотация самой свежей статьи. */
export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const project = await getProject(user.id, (await params).id);
  if (!project) return notFound();
  return throttled(user.id, 'write', async () => (await withResearchErrors(async () => {
    const [items, articles] = await Promise.all([listItems(user.id, { projectId: project.id }), listArticles(user.id, project.id)]);
    const article = articles[0] ? await getArticle(user.id, articles[0].id) : null;
    // Без статьи абстракт пишется на языке интерфейса.
    const lang = article?.doc.lang ?? localeFromRequest(req);
    return NextResponse.json(await graphicalAbstract({
      title: project.title, description: project.description, facts: await projectFacts(user.id, items),
      abstract: article?.doc.abstract[lang] ?? '', lang,
    }));
  })) as NextResponse);
}
