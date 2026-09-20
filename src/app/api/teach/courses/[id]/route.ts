import { courseStudents } from '@/lib/lms/courses';
import { notify } from '@/lib/notifications';
import { learnCourseHref } from '@/lib/lms/links';
import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import {
  badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors, type IdParams,
} from '@/lib/http/route-kit';
import { allowedGroupIds, staffCourse } from '@/lib/lms/access';
import { deleteCourse, getCourse, setCourseGroups, setCourseStatus, updateCourse } from '@/lib/lms/courses';
import { isCourseStatus, type CourseStatus } from '@/lib/lms/types';

/** Правка карточки курса, статус и «Кому открыт». Всё проверяется до первой записи. */
export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffCourse(user, id);
  if (!staff) return notFound();
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const status: CourseStatus | null | undefined = body.status === undefined ? undefined
    : isCourseStatus(body.status) ? body.status : null;
  if (status === null) return badRequest('Статус курса — черновик, опубликован или в архиве.');
  const rawGroups = body.groupIds;
  const groupIds: string[] | null | undefined = rawGroups === undefined ? undefined
    : Array.isArray(rawGroups) && rawGroups.every((g) => typeof g === 'string') ? rawGroups as string[] : null;
  if (groupIds === null) return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    if (body.title !== undefined || body.subject !== undefined || body.description !== undefined || body.grade !== undefined) {
      await updateCourse(staff.course.id, { title: body.title, subject: body.subject, grade: body.grade, description: body.description });
    }
    if (groupIds) {
      const allowed = new Set(await allowedGroupIds(user, staff.membership));
      await setCourseGroups(staff.course.id, groupIds, allowed);
    }
    if (status !== undefined) {
      await setCourseStatus(staff.course.id, status);
      if (status === 'published' && staff.course.status !== 'published') {
        for (const st of await courseStudents(staff.course.id)) {
          await notify(st.id, { key: `course:${staff.course.id}`, kind: 'published', title: `Новый курс: «${staff.course.title}»`,
            body: 'Учитель открыл курс вашей группе.', href: learnCourseHref(staff.course.id, false) });
        }
      }
    }
    return NextResponse.json({ course: await getCourse(staff.course.id) });
  });
}

/** Удалить курс целиком — только без ответов учеников (иначе — в архив). */
export async function DELETE(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffCourse(user, id);
  if (!staff) return notFound();
  return withUserErrors(async () => {
    await deleteCourse(staff.course.id);
    return NextResponse.json({ ok: true });
  });
}
