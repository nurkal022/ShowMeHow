import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { createItem, listItems } from '@/lib/research/store';
import { withResearchErrors } from '@/lib/research/http';
import { localeFromRequest } from '@/i18n/config';

export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const projectId = new URL(req.url).searchParams.get('project');
  return NextResponse.json({ items: await listItems(user.id, { projectId }) });
}

export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withResearchErrors(async () => NextResponse.json({ item: await createItem(user.id, body, localeFromRequest(req)) }, { status: 201 }));
}
