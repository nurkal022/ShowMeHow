import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { getGroup } from '@/lib/org/groups';
import { createStudents, previewStudents } from '@/lib/org/bulk';

type P = { params: Promise<{ slug: string; groupId: string }> };

/** Ученики списком: dryRun — предпросмотр, иначе создание. Только админ организации. */
export async function POST(req: Request, { params }: P) {
  const { slug, groupId } = await params;
  const g = await guardOrg(req, slug, ['org_admin']);
  if (g instanceof Response) return g;
  const group = await getGroup(groupId);
  if (!group || group.orgId !== g.membership.orgId) return notFound();
  const body = await readBody(req);
  const text = body?.text;
  if (!body || typeof text !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    if (body.dryRun === true) return NextResponse.json(await previewStudents(group.id, text));
    return NextResponse.json({ created: await createStudents(group.id, text) }, { status: 201 });
  });
}
