import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { staffTopic } from '@/lib/lms/access';
import { createDebrief } from '@/lib/lms/debrief';
import { draftLesson } from '@/lib/lms/ai';
import { createBlock } from '@/lib/lms/blocks';
import { createTopic } from '@/lib/lms/courses';
import { courseEditorHref } from '@/lib/lms/links';
import { db } from '@/lib/db/client';
import type { DebriefSummary } from '@/lib/lms/debrief';

const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Разбор урока. create — собрать разбор темы по ответам класса и сохранить;
 * remedial — по последнему разбору создать тему «Работа над ошибками» с уроком от помощника.
 */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const staff = await staffTopic(user, str(body.topicId));
  if (!staff) return notFound();
  return withUserErrors(async () => {
    if (body.action === 'remedial') {
      const { rows } = await db().query<{ summary: DebriefSummary }>(
        'SELECT summary FROM lesson_debriefs WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 1', [staff.topic.id]);
      const s = rows[0]?.summary;
      if (!s) return badRequest('Сначала сделайте разбор темы.');
      const bodies = await draftLesson({
        topic: `Работа над ошибками: ${staff.topic.title}`, subject: staff.course.subject, grade: '',
        wishes: `Это короткий урок-повторение по итогам проверки. Что объяснить заново: ${s.remedial}
Типичные ошибки класса: ${s.misconceptions.map((m) => `${m.title} — ${m.detail}`).join('; ')}.
Каждое задание должно проверять именно эти ошибки. Объяснение короче обычного.`,
      });
      const topic = await createTopic(staff.course.id, `Работа над ошибками: ${staff.topic.title}`.slice(0, 200));
      let after: string | undefined;
      for (const b of bodies) after = (await createBlock(topic.id, b.kind, { afterBlockId: after, payload: b.payload })).id;
      return NextResponse.json({ topicId: topic.id, href: courseEditorHref(staff.course.id, topic.id) }, { status: 201 });
    }
    const debrief = await createDebrief({
      orgId: staff.course.orgId, courseId: staff.course.id, topicId: staff.topic.id, topicTitle: staff.topic.title,
      courseTitle: staff.course.title, subject: staff.course.subject, authorId: user.id,
    });
    return NextResponse.json({ debrief }, { status: 201 });
  });
}
