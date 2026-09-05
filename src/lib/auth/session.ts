import crypto from 'node:crypto';
import { db } from '../db/client';
import { findUserById, type AuthUser } from './users';

export const SESSION_COOKIE = 'showmehow_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Продлеваем срок не чаще раза в сутки, чтобы не писать в базу на каждый запрос. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db().query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)',
    [hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS)]);
  return token;
}

export async function resolveSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const hash = hashToken(token);
  const { rows } = await db().query<{ user_id: string; expires_at: Date }>(
    'SELECT user_id, expires_at FROM sessions WHERE token_hash = $1', [hash]);
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) {
    // Просроченную строку убираем лениво, при первом же обращении.
    await db().query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
    return null;
  }
  if (row.expires_at.getTime() - Date.now() < SESSION_TTL_MS - RENEW_AFTER_MS) {
    await db().query('UPDATE sessions SET expires_at = $2 WHERE token_hash = $1',
      [hash, new Date(Date.now() + SESSION_TTL_MS)]);
  }
  return findUserById(row.user_id);
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db().query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Для роутов: токен берётся из заголовка запроса, а не из next/headers — так роут тестируется вызовом. */
export async function currentUserFromRequest(req: Request): Promise<AuthUser | null> {
  return resolveSession(readCookie(req, SESSION_COOKIE));
}

/** Для серверных компонентов и страниц, где Request недоступен. */
export async function currentUserFromCookies(): Promise<AuthUser | null> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}
