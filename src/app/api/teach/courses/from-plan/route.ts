import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { findOrgBySlug } from '@/lib/org/orgs';
import { requireOrgRole } from '@/lib/org/access';
import { createCourse, createTopic, setCourseGroups, setTopicFormat } from '@/lib/lms/courses';
import { allowedGroupIds } from '@/lib/lms/access';
import { LmsError } from '@/lib/lms/types';

/**
 * «Курс из программы», шаг 2: учитель поправил план — создаём курс и пустые темы.
 * Наполняет темы клиент по одной (action "lesson" помощника), чтобы видеть прогресс
 * и не держать один запрос на десятки минут.
 */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const slug = body?.org;
  if (!body || typeof slug !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  const org = await findOrgBySlug(slug);
  const membership = org ? await requireOrgRole(user, org.id, ['teacher']) : null;
  if (!membership) return notFound();
  const topics = Array.isArray(body.topics) ? body.topics.slice(0, 30) : [];
  return withUserErrors(async () => {
    if (topics.length === 0) throw new LmsError('В плане нет ни одной темы.');
    const course = await createCourse({
      orgId: membership.orgId, ownerId: user.id, title: body.title, subject: body.subject, description: body.description,
    });
    const created: { id: string; title: string; format: string }[] = [];
    for (const raw of topics) {
      const t = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      const topic = await createTopic(course.id, t.title);
      const format = t.format === 'exam' ? 'exam' : 'lesson';
      if (format === 'exam') await setTopicFormat(topic.id, 'exam', 40);
      created.push({ id: topic.id, title: topic.title, format });
    }
    const groupIds = Array.isArray(body.groupIds) ? body.groupIds.filter((g): g is string => typeof g === 'string') : [];
    if (groupIds.length) await setCourseGroups(course.id, groupIds, new Set(await allowedGroupIds(user, membership)));
    return NextResponse.json({ courseId: course.id, topics: created }, { status: 201 });
  });
}
