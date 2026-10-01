import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { deleteArticle, getArticle, updateArticle } from '@/lib/research/articles-store';
import { withResearchErrors } from '@/lib/research/http';

export async function GET(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const article = await getArticle(user.id, (await params).id);
  return article ? NextResponse.json({ article }) : notFound();
}

export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const id = (await params).id;
  return withResearchErrors(async () => {
    const article = await updateArticle(user.id, id, body);
    return article ? NextResponse.json({ article: { id: article.id, title: article.title, projectId: article.projectId, updatedAt: article.updatedAt } }) : notFound();
  });
}

export async function DELETE(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return (await deleteArticle(user.id, (await params).id)) ? NextResponse.json({ ok: true }) : notFound();
}
