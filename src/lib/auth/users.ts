import crypto from 'node:crypto';
import { db } from '../db/client';
import { hashPassword } from './password';
import { mergePrefs, sanitizePrefs, type UserPrefs } from './prefs';
import { isValidLogin, normalizeIdentifier, parseIdentifier } from './identifier';

export type Role = 'admin' | 'user';

/**
 * То, что нужно для проверки доступа на каждом запросе. Почты может не быть —
 * ученику логин выдаёт организация. displayName нужен шапке: у ученика это
 * единственная человеческая подпись.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  login: string | null;
  displayName: string | null;
  role: Role;
  mustChangePassword: boolean;
}

/** Пользователь вместе с тем, что нужно только входу. Наружу не отдаётся. */
export type StoredUser = AuthUser & { passwordHash: string; disabledAt: Date | null };

export class EmailTakenError extends Error {
  constructor() { super('Такая почта уже зарегистрирована'); }
}

export class LoginTakenError extends Error {
  constructor(login: string) { super(`Логин «${login}» уже занят.`); }
}

export class InvalidLoginError extends Error {
  constructor() {
    super('Логин может содержать только строчные латинские буквы, цифры, точку, дефис и подчёркивание, '
      + 'от 3 до 40 символов, и начинаться с буквы или цифры.');
  }
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Админ ровно один и задаётся окружением: отдельного интерфейса управления ролями нет. */
export function roleForEmail(email: string): Role {
  const admin = process.env.SHOWMEHOW_ADMIN_EMAIL;
  return admin && normalizeEmail(admin) === normalizeEmail(email) ? 'admin' : 'user';
}

const USER_COLUMNS = 'id, email, login, display_name, role, must_change_password, disabled_at';

interface UserRow {
  id: string;
  email: string | null;
  login: string | null;
  display_name: string | null;
  role: Role;
  must_change_password: boolean;
  disabled_at: Date | null;
}

function toAuthUser(r: UserRow): AuthUser {
  return {
    id: r.id, email: r.email, login: r.login, displayName: r.display_name,
    role: r.role, mustChangePassword: r.must_change_password,
  };
}

/** Экспортируется: другим таблицам (организации, группы) нужна та же проверка UNIQUE. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

export async function createUser(rawEmail: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(rawEmail);
  const user: AuthUser = {
    id: crypto.randomUUID(), email, login: null, displayName: null,
    role: roleForEmail(email), mustChangePassword: false,
  };
  try {
    await db().query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1,$2,$3,$4)',
      [user.id, email, hashPassword(password), user.role]);
  } catch (e) {
    // 23505 — нарушение UNIQUE по email.
    if (isUniqueViolation(e)) throw new EmailTakenError();
    throw e;
  }
  return user;
}

/**
 * Аккаунт без почты: логин выдаёт организация или скрипт scripts/org.ts.
 * Роль платформы всегда 'user' — админ определяется только почтой.
 */
export async function createLoginUser(input: {
  login: string; displayName: string | null; password: string; mustChangePassword: boolean;
}): Promise<AuthUser> {
  const login = normalizeIdentifier(input.login);
  if (!isValidLogin(login)) throw new InvalidLoginError();
  const user: AuthUser = {
    id: crypto.randomUUID(), email: null, login, displayName: input.displayName,
    role: 'user', mustChangePassword: input.mustChangePassword,
  };
  try {
    await db().query(
      `INSERT INTO users (id, login, display_name, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,'user',$5)`,
      [user.id, login, input.displayName, hashPassword(input.password), input.mustChangePassword]);
  } catch (e) {
    if (isUniqueViolation(e)) throw new LoginTakenError(login);
    throw e;
  }
  return user;
}

/** Почта, если во вводе есть @, иначе логин. Недопустимый ввод — null без запроса к базе. */
export async function findUserByIdentifier(raw: string): Promise<StoredUser | null> {
  const id = parseIdentifier(raw);
  if (!id) return null;
  const column = id.kind === 'email' ? 'email' : 'login';
  const { rows } = await db().query<UserRow & { password_hash: string }>(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE ${column} = $1`, [id.value]);
  const r = rows[0];
  return r ? { ...toAuthUser(r), passwordHash: r.password_hash, disabledAt: r.disabled_at } : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await db().query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? toAuthUser(rows[0]) : null;
}

/** Для резолва сессии: заблокированный пользователь не существует для приложения. */
export async function findActiveUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await db().query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND disabled_at IS NULL`, [id]);
  return rows[0] ? toAuthUser(rows[0]) : null;
}

/**
 * Блокировка: отметка и удаление всех сессий одним оператором, чтобы между ними
 * не проскочил запрос. Данные пользователя не трогаются.
 */
export async function disableUser(userId: string): Promise<void> {
  await db().query(
    `WITH dropped AS (DELETE FROM sessions WHERE user_id = $1)
     UPDATE users SET disabled_at = now() WHERE id = $1`, [userId]);
}

/**
 * Профиль отделён от AuthUser намеренно: AuthUser — то, что нужно для проверки
 * доступа на каждом запросе, и он не должен раздуваться настройками интерфейса.
 */
export interface UserProfile extends AuthUser {
  prefs: UserPrefs;
  createdAt: string;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { rows } = await db().query<UserRow & { prefs: unknown; created_at: Date }>(
    `SELECT ${USER_COLUMNS}, prefs, created_at FROM users WHERE id = $1`, [userId]);
  const r = rows[0];
  if (!r) return null;
  return { ...toAuthUser(r), prefs: sanitizePrefs(r.prefs), createdAt: r.created_at.toISOString() };
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
