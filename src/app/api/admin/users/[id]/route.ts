import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { getUserCard, setPlatformRole } from '@/lib/admin/users';
import { logAdminAction } from '@/lib/admin/actions';
import { disableUser, enableUser, setTemporaryPassword } from '@/lib/auth/users';
import { generateTempPassword } from '@/lib/auth/temp-password';
import { userContact } from '@/lib/auth/identifier';

/** Действия над пользователем из карточки админки. */
export async function POST(req: Request, { params }: IdParams) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const card = await getUserCard(id);
  if (!card) return notFound();
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const target = userContact(card);
  const self = card.id === admin.id;
  switch (body.action) {
    case 'reset-password': {
      const password = generateTempPassword();
      await setTemporaryPassword(card.id, password);
      await logAdminAction(admin.id, 'user.reset_password', target);
      return NextResponse.json({ ok: true, password });
    }
    case 'disable':
      if (self) return badRequest('Нельзя заблокировать самого себя.');
      await disableUser(card.id);
      await logAdminAction(admin.id, 'user.disable', target);
      return NextResponse.json({ ok: true });
    case 'enable':
      await enableUser(card.id);
      await logAdminAction(admin.id, 'user.enable', target);
      return NextResponse.json({ ok: true });
    case 'make-admin':
      await setPlatformRole(card.id, 'admin');
      await logAdminAction(admin.id, 'user.make_admin', target);
      return NextResponse.json({ ok: true });
    case 'revoke-admin':
      if (self) return badRequest('Нельзя снять права администратора с самого себя.');
      await setPlatformRole(card.id, 'user');
      await logAdminAction(admin.id, 'user.revoke_admin', target);
      return NextResponse.json({ ok: true });
    default:
      return badRequest('Неизвестное действие.');
  }
}
