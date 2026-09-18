import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { notFound, readBody, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { canUseInCourse, staffBlock } from '@/lib/lms/access';
import { setBlockSimulation } from '@/lib/lms/blocks';
import { courseEditorHref } from '@/lib/lms/links';

/**
 * Вставка тренажёра в блок: из выбора в редакторе и из мастерской по returnTo.
 * Чужая личная симуляция для учителя не существует — 404.
 */
export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffBlock(user, id);
  if (!staff) return notFound();
  const simulationId = (await readBody(req))?.simulationId;
  if (typeof simulationId !== 'string' || !(await canUseInCourse(user.id, simulationId))) return notFound();
  return withUserErrors(async () => NextResponse.json({
    block: await setBlockSimulation(staff.block.id, simulationId.toLowerCase()),
    href: courseEditorHref(staff.course.id, staff.topic.id),
  }));
}
