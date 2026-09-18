import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { canUseInCourse, staffBlock } from '@/lib/lms/access';
import { deleteBlock, moveBlock, updateBlock } from '@/lib/lms/blocks';
import { sanitizeBlockBody, simulationIdsOf } from '@/lib/lms/block-schema';
import { isMoveDirection } from '@/lib/lms/order';

/**
 * Правка содержимого или перестановка. Новая симуляция в блоке (или в стенде)
 * проверяется так же, как при вставке: иначе через курс можно было бы открыть
 * ученикам чужую личную симуляцию.
 */
export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffBlock(user, id);
  if (!staff) return notFound();
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    if (body.move !== undefined) {
      if (!isMoveDirection(body.move)) return badRequest(INVALID_BODY_MESSAGE);
      await moveBlock(staff.block.id, body.move);
      return NextResponse.json({ ok: true });
    }
    const next = sanitizeBlockBody(staff.block.body.kind, body.payload);
    const before = new Set(simulationIdsOf(staff.block.body));
    for (const simId of simulationIdsOf(next)) {
      if (!before.has(simId) && !(await canUseInCourse(user.id, simId))) return notFound();
    }
    return NextResponse.json(await updateBlock(staff.block.id, next.payload));
  });
}

export async function DELETE(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffBlock(user, id);
  if (!staff) return notFound();
  await deleteBlock(staff.block.id);
  return NextResponse.json({ ok: true });
}
