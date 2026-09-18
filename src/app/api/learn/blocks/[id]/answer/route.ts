import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { studentBlock } from '@/lib/lms/access';
import { saveAnswer } from '@/lib/lms/submissions';
import { toStudentSubmission } from '@/lib/lms/answers';

/**
 * Черновик или сдача ответа учеником. Отдаётся только студенческий вид ответа:
 * ни правильных вариантов, ни служебных полей (спецификация §6).
 */
export async function PUT(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const ctx = await studentBlock(user, id);
  if (!ctx || ctx.block.body.kind !== 'assignment') return notFound();
  const body = await readBody(req);
  const submit = body?.submit;
  if (!body || typeof submit !== 'boolean') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    const sub = await saveAnswer(ctx.block, user.id, body.answer, submit);
    return NextResponse.json({ submission: toStudentSubmission(sub) });
  });
}
