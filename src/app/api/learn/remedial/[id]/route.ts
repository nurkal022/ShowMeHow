import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { getRemedial, isRemedialStatus, setRemedialStatus } from '@/lib/lms/remedial';

/** Разбор видит только его хозяин: чужой неотличим от несуществующего — 404. */
export async function GET(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const remedial = await getRemedial(user.id, id);
  return remedial ? NextResponse.json({ remedial }) : notFound();
}

export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = await readBody(req);
  if (!body || !isRemedialStatus(body.status)) return badRequest(INVALID_BODY_MESSAGE);
  const remedial = await setRemedialStatus(user.id, id, body.status);
  return remedial ? NextResponse.json({ remedial }) : notFound();
}
