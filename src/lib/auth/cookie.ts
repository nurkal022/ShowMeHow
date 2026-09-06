import type { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS } from './session';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * По какому протоколу пришёл запрос. Флаг Secure нельзя выводить из NODE_ENV:
 * браузер молча выбрасывает Secure-куку, пришедшую по http, и вход «удаётся»,
 * но сессия не сохраняется. За обратным прокси реальный протокол лежит в
 * x-forwarded-proto, поэтому смотрим сначала туда.
 */
export function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function setSessionCookie(res: NextResponse, token: string, secure: boolean): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
