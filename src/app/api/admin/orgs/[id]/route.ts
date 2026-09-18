import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { getOrgById, setOrgArchived, updateOrgSettings } from '@/lib/org/orgs';
import { logAdminAction } from '@/lib/admin/actions';

/** Архив и настройки организации. Пустое тело просто отдаёт текущее состояние. */
export async function PATCH(req: Request, { params }: IdParams) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const org = await getOrgById(id);
  if (!org) return notFound();
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  if (typeof body.archived === 'boolean') {
    await setOrgArchived(org.id, body.archived);
    await logAdminAction(admin.id, body.archived ? 'org.archive' : 'org.restore', org.slug);
  }
  if (body.settings !== undefined) {
    const settings = await updateOrgSettings(org.id, body.settings);
    await logAdminAction(admin.id, 'org.settings', org.slug, { ...settings });
  }
  const fresh = (await getOrgById(org.id))!;
  return NextResponse.json({ org: fresh, settings: fresh.settings });
}
