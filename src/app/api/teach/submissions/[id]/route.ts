import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { staffBlock } from '@/lib/lms/access';
import { getSubmission } from '@/lib/lms/submissions';
import { gradeSubmission, returnSubmission } from '@/lib/lms/grading';

/** «Поставить» и «Вернуть на доработку». Ответ доступен тому, кто правит курс. */
export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const sub = await getSubmission(id);
  const staff = sub ? await staffBlock(user, sub.blockId) : null;
  if (!sub || !staff || staff.block.body.kind !== 'assignment') return notFound();
  const points = staff.block.body.payload.points;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    if (body.action === 'grade') {
      return NextResponse.json({ submission: await gradeSubmission(sub, points, user.id, body.score, body.comment) });
    }
    if (body.action === 'return') {
      return NextResponse.json({ submission: await returnSubmission(sub, user.id, body.comment) });
    }
    return badRequest('Неизвестное действие.');
  });
}
