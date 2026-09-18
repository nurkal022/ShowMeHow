import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { setSimulationVisibility } from '@/lib/admin/catalog';
import { logAdminAction } from '@/lib/admin/actions';
import { getRepo } from '@/lib/db/repo';
import { isUuid } from '@/lib/org/access';

/** Флажок «В общем каталоге». */
export async function PATCH(req: Request, { params }: IdParams) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const body = await readBody(req);
  if (!body || typeof body.catalog !== 'boolean') return badRequest(INVALID_BODY_MESSAGE);
  const sim = isUuid(id) ? await getRepo().get(id) : null;
  if (!sim || !(await setSimulationVisibility(id, body.catalog ? 'catalog' : 'private'))) return notFound();
  await logAdminAction(admin.id, body.catalog ? 'catalog.add' : 'catalog.remove', sim.title, { id });
  return NextResponse.json({ ok: true });
}
