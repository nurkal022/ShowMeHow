import crypto from 'node:crypto';
import { db } from '../db/client';
import { findActiveUserById, type AuthUser } from './users';
import { SESSION_COOKIE } from './session-cookie';
import type { SessionKind } from '../org/policy';

export { SESSION_COOKIE };
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Продлеваем срок не чаще раза в сутки, чтобы не писать в базу на каждый запрос. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/** Ученическая сессия: школьный компьютер общий, поэтому живёт один учебный день. */
export const SHORT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function sessionTtlMs(kind: SessionKind): number {
  return kind === 'short' ? SHORT_SESSION_TTL_MS : SESSION_TTL_MS;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Тип определяется при входе и дальше не пересчитывается; короткая сессия не продлевается. */
export async function createSession(userId: string, kind: SessionKind = 'long'): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db().query(
    'INSERT INTO sessions (token_hash, user_id, expires_at, sliding) VALUES ($1,$2,$3,$4)',
    [hashToken(token), userId, new Date(Date.now() + sessionTtlMs(kind)), kind === 'long']);
  return token;
}

export async function resolveSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const hash = hashToken(token);
  const { rows } = await db().query<{ user_id: string; expires_at: Date; sliding: boolean }>(
    'SELECT user_id, expires_at, sliding FROM sessions WHERE token_hash = $1', [hash]);
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) {
    // Просроченную строку убираем лениво, при первом же обращении.
    await db().query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
    return null;
  }
  if (row.sliding && row.expires_at.getTime() - Date.now() < SESSION_TTL_MS - RENEW_AFTER_MS) {
    await db().query('UPDATE sessions SET expires_at = $2 WHERE token_hash = $1',
      [hash, new Date(Date.now() + SESSION_TTL_MS)]);
  }
  return findActiveUserById(row.user_id);
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
