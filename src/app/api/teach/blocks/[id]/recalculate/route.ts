import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { notFound, withUserErrors, type IdParams } from '@/lib/http/route-kit';
import { staffBlock } from '@/lib/lms/access';
import { recalculateBlock } from '@/lib/lms/grading';

/** «Пересчитать N сданных ответов». */
export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffBlock(user, id);
  if (!staff) return notFound();
  return withUserErrors(async () => NextResponse.json({ updated: await recalculateBlock(staff.block) }));
}
