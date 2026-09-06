import crypto from 'node:crypto';
import { db } from '../db/client';
import { hashPassword } from './password';
import { mergePrefs, sanitizePrefs, type UserPrefs } from './prefs';

export type Role = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export class EmailTakenError extends Error {
  constructor() { super('Такая почта уже зарегистрирована'); }
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Админ ровно один и задаётся окружением: отдельного интерфейса управления ролями нет. */
export function roleForEmail(email: string): Role {
  const admin = process.env.SHOWMEHOW_ADMIN_EMAIL;
  return admin && normalizeEmail(admin) === normalizeEmail(email) ? 'admin' : 'user';
}

export async function createUser(rawEmail: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(rawEmail);
  const user: AuthUser = { id: crypto.randomUUID(), email, role: roleForEmail(email) };
  try {
    await db().query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1,$2,$3,$4)',
      [user.id, email, hashPassword(password), user.role]);
  } catch (e) {
    // 23505 — нарушение UNIQUE по email.
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
      throw new EmailTakenError();
    }
    throw e;
  }
  return user;
}

export async function findUserByEmail(
  rawEmail: string,
): Promise<(AuthUser & { passwordHash: string }) | null> {
  const { rows } = await db().query<{ id: string; email: string; role: Role; password_hash: string }>(
    'SELECT id, email, role, password_hash FROM users WHERE email = $1', [normalizeEmail(rawEmail)]);
  const r = rows[0];
  return r ? { id: r.id, email: r.email, role: r.role, passwordHash: r.password_hash } : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await db().query<{ id: string; email: string; role: Role }>(
    'SELECT id, email, role FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/**
 * Профиль отделён от AuthUser намеренно: AuthUser — то, что нужно для проверки
 * доступа на каждом запросе, и он не должен раздуваться настройками интерфейса.
 */
export interface UserProfile extends AuthUser {
  displayName: string | null;
  prefs: UserPrefs;
  createdAt: string;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { rows } = await db().query<{
    id: string; email: string; role: Role;
    display_name: string | null; prefs: unknown; created_at: Date;
  }>('SELECT id, email, role, display_name, prefs, created_at FROM users WHERE id = $1', [userId]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, email: r.email, role: r.role,
    displayName: r.display_name,
    prefs: sanitizePrefs(r.prefs),
    createdAt: r.created_at.toISOString(),
  };
}

export async function updateProfile(
  userId: string,
  patch: { displayName?: string | null; prefs?: unknown },
): Promise<UserProfile | null> {
  const current = await getProfile(userId);
  if (!current) return null;
  const displayName = patch.displayName === undefined ? current.displayName : patch.displayName;
  const prefs = patch.prefs === undefined ? current.prefs : mergePrefs(current.prefs, patch.prefs);
  await db().query('UPDATE users SET display_name = $2, prefs = $3 WHERE id = $1',
    [userId, displayName, JSON.stringify(prefs)]);
  return { ...current, displayName, prefs };
}

/** Смена пароля. Все прочие сессии не трогаем — этим занимается вызывающий роут. */
export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  await db().query('UPDATE users SET password_hash = $2 WHERE id = $1',
    [userId, hashPassword(newPassword)]);
}

export async function findUserPasswordHash(userId: string): Promise<string | null> {
  const { rows } = await db().query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1', [userId]);
  return rows[0]?.password_hash ?? null;
}
