import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody, withUserErrors } from '@/lib/http/route-kit';
import { createGroup } from '@/lib/org/groups';

type P = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: P) {
  const { slug } = await params;
  const g = await guardOrg(req, slug, ['org_admin']);
  if (g instanceof Response) return g;
  const title = (await readBody(req))?.title;
  if (typeof title !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => NextResponse.json(
    { group: await createGroup(g.membership.orgId, title) }, { status: 201 }));
}
