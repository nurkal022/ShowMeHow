import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { startImpersonation } from '@/lib/auth/impersonation';
import { getUserCard } from '@/lib/admin/users';
import { logAdminAction } from '@/lib/admin/actions';
import { userContact } from '@/lib/auth/identifier';

/** Админ платформы входит от имени человека: { userId, org? }. */
export async function POST(req: Request) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readBody(req);
  if (!body || typeof body.userId !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  const org = typeof body.org === 'string' ? body.org : undefined;
  const res = await startImpersonation(req, admin, body.userId, org);
  if (res.ok) {
    const card = await getUserCard(body.userId);
    await logAdminAction(admin.id, 'user.impersonate', card ? userContact(card) : body.userId);
  }
  return res;
}
