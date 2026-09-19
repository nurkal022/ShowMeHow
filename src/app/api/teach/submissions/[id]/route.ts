import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { staffBlock } from '@/lib/lms/access';
import { getSubmission } from '@/lib/lms/submissions';
import { gradeSubmission, returnSubmission } from '@/lib/lms/grading';
import { notify } from '@/lib/notifications';
import { learnTopicHref } from '@/lib/lms/links';
import { assignmentTitle } from '@/lib/lms/block-schema';
import { formatScore } from '@/lib/lms/format';

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
    const task = staff.block.body.kind === 'assignment' ? assignmentTitle(staff.block.body.payload.prompt) : 'Задание';
    const href = `${learnTopicHref(staff.topic.id, false)}#block-${staff.block.id}`;
    if (body.action === 'grade') {
      const graded = await gradeSubmission(sub, points, user.id, body.score, body.comment);
      await notify(sub.studentId, { key: `grade:${sub.id}`, kind: 'graded', href,
        title: `Проверено: ${formatScore(graded.score)} из ${points}`, body: `${staff.course.title} · ${task}` });
      return NextResponse.json({ submission: graded });
    }
    if (body.action === 'return') {
      const returned = await returnSubmission(sub, user.id, body.comment);
      await notify(sub.studentId, { key: `grade:${sub.id}`, kind: 'returned', href,
        title: 'Работу вернули на доработку', body: `${staff.course.title} · ${task}` });
      return NextResponse.json({ submission: returned });
    }
    return badRequest('Неизвестное действие.');
  });
}
