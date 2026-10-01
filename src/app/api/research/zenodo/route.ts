import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { getZenodoSettings, removeZenodo, saveZenodoToken } from '@/lib/research/integrations';
import { withZenodoErrors } from '@/lib/research/zenodo-publish';

/** Подключение Zenodo. Токен только принимается — ни один ответ его не возвращает. */

export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return NextResponse.json({ settings: await getZenodoSettings(user.id), authorName: user.displayName?.trim() ?? '' });
}

export async function PUT(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body || typeof body.token !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  const { token } = body;
  return withZenodoErrors(async () =>
    NextResponse.json({ settings: await saveZenodoToken(user.id, token, body.sandbox === true) }));
}

export async function DELETE(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  await removeZenodo(user.id);
  return NextResponse.json({ settings: await getZenodoSettings(user.id) });
}
