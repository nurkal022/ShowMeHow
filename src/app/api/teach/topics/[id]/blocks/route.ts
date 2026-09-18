import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { canUseInCourse, staffTopic } from '@/lib/lms/access';
import { createBlock } from '@/lib/lms/blocks';
import { isBlockKind, sanitizeBlockBody, simulationIdsOf } from '@/lib/lms/block-schema';

/**
 * «Добавить блок»: { kind, after?, payload? }. after — id блока, под который вставить
 * (null — в начало); payload — содержимое копии при дублировании.
 */
export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffTopic(user, id);
  if (!staff) return notFound();
  const body = await readBody(req);
  const kind = body?.kind;
  if (!body || !isBlockKind(kind)) return badRequest('Неизвестный тип блока.');
  const after = body.after;
  if (after !== undefined && after !== null && typeof after !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    let payload;
    if (body.payload !== undefined) {
      const next = sanitizeBlockBody(kind, body.payload);
      for (const simId of simulationIdsOf(next)) {
        if (!(await canUseInCourse(user.id, simId))) return notFound();
      }
      payload = next.payload;
    }
    const block = await createBlock(staff.topic.id, kind, { afterBlockId: after as string | null | undefined, payload });
    return NextResponse.json({ block }, { status: 201 });
  });
}
