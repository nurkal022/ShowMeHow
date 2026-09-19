import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { studentBlock } from '@/lib/lms/access';
import { saveAnswer } from '@/lib/lms/submissions';
import { toStudentSubmission } from '@/lib/lms/answers';
import { revealFor, revealOf } from '@/lib/lms/block-schema';
import { examFinished, examWindow } from '@/lib/lms/courses';
import { LmsError } from '@/lib/lms/types';
import { notify } from '@/lib/notifications';
import { answersHref } from '@/lib/lms/links';
import { assignmentTitle as taskTitle } from '@/lib/lms/block-schema';

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
    const exam = ctx.topic.format === 'exam';
    if (exam) {
      const window = await examWindow(ctx.topic, user.id);
      if (!window.startedAt) throw new LmsError('Сначала нажмите «Начать контрольную».');
      if (window.over) throw new LmsError('Время контрольной вышло — ответы больше не принимаются.');
    }
    const sub = await saveAnswer(ctx.block, user.id, body.answer, submit);
    // Работа ждёт человека — учителю сигнал. Повторы по тому же заданию копятся в один счётчик.
    if (submit && sub.status === 'submitted' && ctx.block.body.kind === 'assignment') {
      await notify(ctx.course.ownerId, {
        key: `submitted:${ctx.block.id}`, kind: 'submitted',
        title: `Новые работы: «${taskTitle(ctx.block.body.payload.prompt)}»`, body: `${ctx.course.title} · ${ctx.topic.title}`,
        href: answersHref(ctx.course.id, ctx.block.id, { pending: true }),
      });
    }
    if (exam && !(await examFinished(ctx.topic, user.id))) {
      return NextResponse.json({ submission: toStudentSubmission(sub, true), reveal: null });
    }
    const payload = ctx.block.body.kind === 'assignment' ? ctx.block.body.payload : null;
    // Ключ и пояснение уходят ученику только после проверки (см. revealFor).
    const reveal = payload && revealFor(payload, sub) ? revealOf(payload) : null;
    return NextResponse.json({ submission: toStudentSubmission(sub), reveal });
  });
}
