import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody, withUserErrors } from '@/lib/http/route-kit';
import { getInterests, saveInterests } from '@/lib/lms/interests-store';

/** Интересы ученика: их видит и правит только он сам, поэтому прав кроме входа не нужно. */
export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return NextResponse.json({ interests: await getInterests(user.id) });
}

export async function PATCH(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => NextResponse.json({ interests: await saveInterests(user.id, body.interests) }));
}
