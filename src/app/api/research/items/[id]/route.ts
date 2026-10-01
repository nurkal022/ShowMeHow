import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { deleteItem, getItem, updateItem } from '@/lib/research/store';
import { withResearchErrors } from '@/lib/research/http';

export async function GET(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const item = await getItem(user.id, (await params).id);
  return item ? NextResponse.json({ item }) : notFound();
}

export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const id = (await params).id;
  return withResearchErrors(async () => {
    const item = await updateItem(user.id, id, body);
    return item ? NextResponse.json({ item }) : notFound();
  });
}

export async function DELETE(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return (await deleteItem(user.id, (await params).id)) ? NextResponse.json({ ok: true }) : notFound();
}
