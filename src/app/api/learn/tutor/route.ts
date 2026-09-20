import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { getCourse, getTopic } from '@/lib/lms/courses';
import { staffCourse, studentCourse } from '@/lib/lms/access';
import { listBlocks } from '@/lib/lms/blocks';
import { askTutor, listTutorMessages, stepTextOf } from '@/lib/lms/tutor';
import { ASSIGNMENT_TYPE_LABELS } from '@/lib/lms/block-schema';

const MODES = new Set(['hint', 'explain', 'check', 'ask']);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Доступ: ученик курса или его учитель (учитель смотрит наставника глазами ученика). */
async function access(req: Request, topicId: unknown) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const topic = typeof topicId === 'string' ? await getTopic(topicId) : null;
  if (!topic) return notFound();
  const staff = await staffCourse(user, topic.courseId);
  const course = staff?.course ?? await studentCourse(user, topic.courseId) ?? (await getCourse(topic.courseId));
  if (!course || (!staff && !(await studentCourse(user, topic.courseId)))) return notFound();
  return { user, topic, course };
}

export async function GET(req: Request) {
  const ctx = await access(req, new URL(req.url).searchParams.get('topicId'));
  if (ctx instanceof Response) return ctx;
  return NextResponse.json({ messages: await listTutorMessages(ctx.user.id, ctx.topic.id) });
}

/** Вопрос наставнику по текущему шагу. Ключей к заданию в контекст не попадает — только условие. */
export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const ctx = await access(req, body.topicId);
  if (ctx instanceof Response) return ctx;
  const mode = str(body.mode, 20);
  if (!MODES.has(mode)) return badRequest(INVALID_BODY_MESSAGE);
  const blocks = await listBlocks(ctx.topic.id);
  const wanted = Array.isArray(body.blockIds) ? body.blockIds.filter((x): x is string => typeof x === 'string') : [];
  const step = blocks.filter((b) => wanted.includes(b.id));
  const task = step.find((b) => b.body.kind === 'assignment');
  const taskBody = task?.body.kind === 'assignment' ? task.body.payload : null;
  return withUserErrors(async () => NextResponse.json(await askTutor({
    userId: ctx.user.id, topicId: ctx.topic.id, blockId: task?.id ?? null,
    mode: mode as 'hint', question: str(body.question, 1000),
    history: await listTutorMessages(ctx.user.id, ctx.topic.id),
    context: {
      courseTitle: ctx.course.title, topicTitle: ctx.topic.title, grade: ctx.course.grade, subject: ctx.course.subject,
      stepText: stepTextOf(step.map((b) => b.body)),
      assignment: taskBody ? { prompt: taskBody.prompt, points: taskBody.points, type: ASSIGNMENT_TYPE_LABELS[taskBody.spec.type] } : null,
      draftAnswer: str(body.draftAnswer, 1500),
    },
  })));
}
