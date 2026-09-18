import { NextResponse } from 'next/server';
import { destroySession, readCookie, SESSION_COOKIE } from '@/lib/auth/session';
import { RETURN_COOKIE } from '@/lib/auth/impersonation';

// Выход не резолвит пользователя: он обязан работать при любом состоянии аккаунта,
// в том числе с временным паролем (форма смены пароля предлагает «Выйти»).
export async function POST(req: Request) {
  await destroySession(readCookie(req, SESSION_COOKIE));
  // Выход из чужого аккаунта закрывает и отложенную сессию админа: «Выйти» значит выйти совсем.
  await destroySession(readCookie(req, RETURN_COOKIE));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  res.cookies.set(RETURN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
