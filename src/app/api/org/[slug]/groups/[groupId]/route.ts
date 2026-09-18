import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { archiveGroup, getGroup, renameGroup } from '@/lib/org/groups';

type P = { params: Promise<{ slug: string; groupId: string }> };

/** Группа из адреса обязана принадлежать организации из того же адреса. */
async function ownGroup(req: Request, params: P['params']) {
  const { slug, groupId } = await params;
  const g = await guardOrg(req, slug, ['org_admin']);
  if (g instanceof Response) return g;
  const group = await getGroup(groupId);
  return group && group.orgId === g.membership.orgId ? group : notFound();
}

export async function PATCH(req: Request, { params }: P) {
  const group = await ownGroup(req, params);
  if (group instanceof Response) return group;
  const title = (await readBody(req))?.title;
  if (typeof title !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => NextResponse.json({ group: await renameGroup(group.id, title) }));
}

export async function DELETE(req: Request, { params }: P) {
  const group = await ownGroup(req, params);
  if (group instanceof Response) return group;
  await archiveGroup(group.id);
  return NextResponse.json({ ok: true });
}
