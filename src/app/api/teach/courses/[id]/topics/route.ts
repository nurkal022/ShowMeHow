import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { staffCourse } from '@/lib/lms/access';
import { createTopic } from '@/lib/lms/courses';

export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffCourse(user, id);
  if (!staff) return notFound();
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => NextResponse.json(
    { topic: await createTopic(staff.course.id, body.title) }, { status: 201 }));
}
