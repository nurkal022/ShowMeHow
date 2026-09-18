import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { assignTeacher, getGroup, unassignTeacher } from '@/lib/org/groups';

type P = { params: Promise<{ slug: string; groupId: string }> };

export async function PUT(req: Request, { params }: P) {
  const { slug, groupId } = await params;
  const g = await guardOrg(req, slug, ['org_admin']);
  if (g instanceof Response) return g;
  const group = await getGroup(groupId);
  if (!group || group.orgId !== g.membership.orgId) return notFound();
  const body = await readBody(req);
  const userId = body?.userId;
  const assigned = body?.assigned;
  if (typeof userId !== 'string' || typeof assigned !== 'boolean') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    if (assigned) await assignTeacher(group.id, userId);
    else await unassignTeacher(group.id, userId);
    return NextResponse.json({ ok: true });
  });
}
