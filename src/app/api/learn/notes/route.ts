import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody, withUserErrors } from '@/lib/http/route-kit';
import { saveNote } from '@/lib/lms/notes';

/** Заметка и закладка ученика на шаге. Доступ к блоку проверяет сам запрос в saveNote. */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body || typeof body.blockId !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => NextResponse.json({
    note: await saveNote(user.id, body.blockId as string, body.body, body.bookmarked),
  }));
}
