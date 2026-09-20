import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { getTopic } from '@/lib/lms/courses';
import { staffCourse, studentCourse } from '@/lib/lms/access';
import { addComment, deleteComment, listComments } from '@/lib/lms/discussion';

/** Обсуждение под уроком: читают и пишут ученики курса и его учителя. */
async function access(req: Request, topicId: unknown) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const topic = typeof topicId === 'string' ? await getTopic(topicId) : null;
  if (!topic) return notFound();
  const staff = await staffCourse(user, topic.courseId);
  const course = staff?.course ?? await studentCourse(user, topic.courseId);
  if (!course) return notFound();
  return { user, topic, isTeacher: !!staff };
}

export async function GET(req: Request) {
  const ctx = await access(req, new URL(req.url).searchParams.get('topicId'));
  if (ctx instanceof Response) return ctx;
  return NextResponse.json({ comments: await listComments(ctx.topic.id) });
}

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const ctx = await access(req, body.topicId);
  if (ctx instanceof Response) return ctx;
  return withUserErrors(async () => NextResponse.json({
    comment: await addComment(ctx.topic.id, ctx.user.id, body.body, body.parentId),
  }, { status: 201 }));
}

export async function DELETE(req: Request) {
  const body = await readBody(req);
  if (!body || typeof body.id !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  const ctx = await access(req, body.topicId);
  if (ctx instanceof Response) return ctx;
  return withUserErrors(async () => {
    await deleteComment(body.id as string, ctx.user.id, ctx.isTeacher);
    return NextResponse.json({ ok: true });
  });
}
