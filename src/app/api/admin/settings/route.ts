import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { setRegistrationOpen } from '@/lib/platform-settings';
import { logAdminAction } from '@/lib/admin/actions';

export async function PATCH(req: Request) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readBody(req);
  if (!body || typeof body.registrationOpen !== 'boolean') return badRequest(INVALID_BODY_MESSAGE);
  await setRegistrationOpen(body.registrationOpen);
  await logAdminAction(admin.id, 'platform.registration', body.registrationOpen ? 'открыта' : 'закрыта');
  return NextResponse.json({ ok: true });
}
