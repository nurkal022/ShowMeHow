import { NextResponse } from 'next/server';
import { listMemberships } from '../org/access';
import { withOrgParam } from '../lms/links';
import { findActiveUserById, type AuthUser } from './users';
import { isSecureRequest, setSessionCookie } from './cookie';
import {
  SESSION_COOKIE, SESSION_TTL_MS, SHORT_SESSION_TTL_MS, createSession, destroySession, readCookie, resolveSessionDetails,
} from './session';

/**
 * «Войти как» для админа платформы. Своя сессия админа не закрывается: её токен
 * лежит в отдельной cookie и возвращается на место кнопкой «Вернуться в админку».
 */
export const RETURN_COOKIE = 'showmehow_admin_return';

/** Куда вести после входа: в кабинет по самой старшей роли, ученика — в его курсы. */
export async function landingFor(userId: string, orgSlug?: string): Promise<string> {
  const all = await listMemberships(userId);
  const scoped = orgSlug ? all.filter((m) => m.orgSlug === orgSlug) : all;
  const pick = (role: string) => scoped.find((m) => m.role === role);
  const admin = pick('org_admin');
  if (admin) return withOrgParam('/org', admin.orgSlug);
  const teacher = pick('teacher');
  if (teacher) return withOrgParam('/teach', teacher.orgSlug);
  if (pick('student')) return '/learn';
  return '/';
}

export async function startImpersonation(
  req: Request, admin: AuthUser, targetId: string, orgSlug?: string,
): Promise<NextResponse> {
  const target = await findActiveUserById(targetId);
  if (!target) return NextResponse.json({ error: 'Человек не найден или заблокирован.' }, { status: 404 });
  if (target.id === admin.id) return NextResponse.json({ error: 'Это вы.' }, { status: 400 });
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'Войти от имени другого админа платформы нельзя.' }, { status: 400 });
  }
  const current = readCookie(req, SESSION_COOKIE);
  // Переход «из одного чужого аккаунта в другой»: промежуточную сессию закрываем, возврат — прежний.
  const details = await resolveSessionDetails(current);
  const returnToken = details?.impersonator ? readCookie(req, RETURN_COOKIE) : current;
  if (details?.impersonator) await destroySession(current);
  const token = await createSession(target.id, 'short', admin.id);
  const secure = isSecureRequest(req);
  const res = setSessionCookie(
    NextResponse.json({ ok: true, next: await landingFor(target.id, orgSlug) }), token, secure, SHORT_SESSION_TTL_MS);
  if (returnToken) {
    res.cookies.set(RETURN_COOKIE, returnToken, {
      httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: Math.floor(SHORT_SESSION_TTL_MS / 1000),
    });
  }
  return res;
}

/** Закрывает чужую сессию и возвращает админу его собственную, если она ещё жива. */
export async function stopImpersonation(req: Request): Promise<NextResponse> {
  const current = readCookie(req, SESSION_COOKIE);
  const details = await resolveSessionDetails(current);
  if (!details?.impersonator) return NextResponse.json({ error: 'Вы и так в своём аккаунте.' }, { status: 400 });
  await destroySession(current);
  const back = readCookie(req, RETURN_COOKIE);
  const own = await resolveSessionDetails(back);
  const res = NextResponse.json({ ok: true, next: own ? '/admin' : '/login' });
  res.cookies.set(RETURN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  if (own && back && own.user.id === details.impersonator.id) {
    // Сессия админа длинная и скользящая: срок cookie — как при обычном входе.
    return setSessionCookie(res, back, isSecureRequest(req), SESSION_TTL_MS);
  }
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
