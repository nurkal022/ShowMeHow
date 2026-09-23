import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody, withUserErrors } from '@/lib/http/route-kit';
import { createRemedial } from '@/lib/lms/remedial';

// Сборка разбора — это запрос к модели на несколько минут; жмут её кнопкой, поэтому ждать нормально.
export const maxDuration = 300;

/** Персональный разбор ошибки по заданию. Доступ к заданию проверяет сам createRemedial. */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body || typeof body.blockId !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => NextResponse.json({
    remedial: await createRemedial(user.id, body.blockId as string),
  }));
}
