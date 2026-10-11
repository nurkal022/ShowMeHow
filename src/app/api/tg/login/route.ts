import { NextResponse } from 'next/server';
import { findActiveUserById } from '@/lib/auth/users';
import { createSession, sessionTtlMs } from '@/lib/auth/session';
import { setSessionCookie, isSecureRequest } from '@/lib/auth/cookie';
import { listMemberships } from '@/lib/org/access';
import { sessionKind } from '@/lib/org/policy';
import { consumeClaim } from '@/lib/telegram/store';
import { personaHome } from '@/lib/telegram/urls';

/**
 * Вход по одноразовой ссылке из бота (/login). Работает только для привязанного
 * Telegram и не для администратора платформы: его аккаунт защищает только пароль.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  const acc = token ? await consumeClaim(token) : null;
  const user = acc?.userId ? await findActiveUserById(acc.userId) : null;
  if (!acc || !user || user.role === 'admin') {
    return NextResponse.redirect(new URL('/tg/claim?expired=1', req.url));
  }
  const kind = sessionKind(user, await listMemberships(user.id));
  const session = await createSession(user.id, kind);
  const res = NextResponse.redirect(new URL(personaHome(acc.persona), req.url));
  return setSessionCookie(res, session, isSecureRequest(req), sessionTtlMs(kind));
}
