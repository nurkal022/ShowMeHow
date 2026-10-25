import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { LIMIT_KEYS, setPlatformLimit, setRegistrationOpen } from '@/lib/platform-settings';
import { logAdminAction } from '@/lib/admin/actions';

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100000;

export async function PATCH(req: Request) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  if (typeof body.registrationOpen === 'boolean') {
    await setRegistrationOpen(body.registrationOpen);
    await logAdminAction(admin.id, 'platform.registration', body.registrationOpen ? 'открыта' : 'закрыта');
    return NextResponse.json({ ok: true });
  }
  const key = LIMIT_KEYS.find((k) => k in body);
  if (!key || !isCount(body[key])) return badRequest(INVALID_BODY_MESSAGE);
  await setPlatformLimit(key, body[key]);
  await logAdminAction(admin.id, 'platform.limit', `${key} = ${body[key]}`);
  return NextResponse.json({ ok: true });
}
