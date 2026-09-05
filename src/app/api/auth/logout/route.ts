import { NextResponse } from 'next/server';
import { destroySession, readCookie, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: Request) {
  await destroySession(readCookie(req, SESSION_COOKIE));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
