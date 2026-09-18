import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { staffTopic } from '@/lib/lms/access';
import { deleteTopic, moveTopic, renameTopic, touchCourse } from '@/lib/lms/courses';
import { isMoveDirection } from '@/lib/lms/order';

/** Переименование или перестановка темы — одно действие за запрос. */
export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffTopic(user, id);
  if (!staff) return notFound();
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    if (body.move !== undefined) {
      if (!isMoveDirection(body.move)) return badRequest(INVALID_BODY_MESSAGE);
      await moveTopic(staff.topic.id, body.move);
    } else {
      await renameTopic(staff.topic.id, body.title);
    }
    await touchCourse(staff.course.id);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffTopic(user, id);
  if (!staff) return notFound();
  await deleteTopic(staff.topic.id);
  await touchCourse(staff.course.id);
  return NextResponse.json({ ok: true });
}
