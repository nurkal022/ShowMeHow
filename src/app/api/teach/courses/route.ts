import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { findOrgBySlug } from '@/lib/org/orgs';
import { requireOrgRole } from '@/lib/org/access';
import { createCourse } from '@/lib/lms/courses';

/** «Новый курс» в выбранной организации; владелец — автор. */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const slug = body?.org;
  if (!body || typeof slug !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  const org = await findOrgBySlug(slug);
  const membership = org ? await requireOrgRole(user, org.id, ['teacher']) : null;
  if (!membership) return notFound();
  return withUserErrors(async () => NextResponse.json({
    course: await createCourse({
      orgId: membership.orgId, ownerId: user.id,
      title: body.title, subject: body.subject, grade: body.grade, description: body.description,
    }),
  }, { status: 201 }));
}
