import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { updateOrgSettings } from '@/lib/org/orgs';

type P = { params: Promise<{ slug: string }> };

/** Три переключателя цикла 0. Неверные значения молча отбрасывает белый список. */
export async function PATCH(req: Request, { params }: P) {
  const { slug } = await params;
  const g = await guardOrg(req, slug, ['org_admin']);
  if (g instanceof Response) return g;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const settings = await updateOrgSettings(g.membership.orgId, body.settings ?? {});
  return NextResponse.json({ settings });
}
