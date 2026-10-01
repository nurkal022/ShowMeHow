import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { createArticle, listArticles } from '@/lib/research/articles-store';
import { withResearchErrors } from '@/lib/research/http';
import { localeFromRequest } from '@/i18n/config';

export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return NextResponse.json({ articles: await listArticles(user.id, new URL(req.url).searchParams.get('project')) });
}

export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withResearchErrors(async () => NextResponse.json({ article: await createArticle(user.id, body, localeFromRequest(req)) }, { status: 201 }));
}
