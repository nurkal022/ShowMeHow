import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { recordBlockViews } from '@/lib/lms/discussion';

/** «Шаг открыт»: клиент отмечает блоки, которые ученик увидел. Чужие блоки отсекает запрос. */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const ids = body?.blockIds;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return badRequest(INVALID_BODY_MESSAGE);
  await recordBlockViews(user.id, ids.slice(0, 50) as string[]);
  return NextResponse.json({ ok: true });
}
