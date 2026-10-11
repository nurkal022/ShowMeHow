import crypto from 'node:crypto';
import { db } from '../db/client';
import { isLocale, type Locale } from '@/i18n/config';
import type { TgUser } from './api';

export type Persona = 'teacher' | 'student' | 'researcher';
export const PERSONAS: Persona[] = ['teacher', 'student', 'researcher'];
export function isPersona(v: unknown): v is Persona {
  return typeof v === 'string' && (PERSONAS as string[]).includes(v);
}

/** Одноразовая ссылка живёт 15 минут: она даёт вход в аккаунт без пароля. */
export const CLAIM_TTL_MS = 15 * 60 * 1000;

export interface TgAccount {
  tgUserId: number;
  userId: string | null;
  username: string | null;
  firstName: string | null;
  lang: Locale | null;
  persona: Persona | null;
  linkedAt: Date | null;
}

interface Row {
  tg_user_id: string; user_id: string | null; username: string | null; first_name: string | null;
  lang: string | null; persona: string | null; linked_at: Date | null;
}

function toAccount(r: Row): TgAccount {
  return {
    tgUserId: Number(r.tg_user_id), userId: r.user_id, username: r.username, firstName: r.first_name,
    lang: isLocale(r.lang) ? r.lang : null, persona: isPersona(r.persona) ? r.persona : null, linkedAt: r.linked_at,
  };
}

const COLS = 'tg_user_id, user_id, username, first_name, lang, persona, linked_at';

/** Заводит запись при первом контакте и освежает имя/username при каждом следующем. */
export async function touchAccount(u: TgUser): Promise<TgAccount> {
  const r = await db().query<Row>(
    `INSERT INTO telegram_accounts (tg_user_id, username, first_name) VALUES ($1,$2,$3)
     ON CONFLICT (tg_user_id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name, updated_at = now()
     RETURNING ${COLS}`,
    [u.id, u.username ?? null, u.first_name]);
  return toAccount(r.rows[0]);
}

export async function getAccount(tgUserId: number): Promise<TgAccount | null> {
  const r = await db().query<Row>(`SELECT ${COLS} FROM telegram_accounts WHERE tg_user_id = $1`, [tgUserId]);
  return r.rows[0] ? toAccount(r.rows[0]) : null;
}

export async function getAccountByUser(userId: string): Promise<TgAccount | null> {
  const r = await db().query<Row>(`SELECT ${COLS} FROM telegram_accounts WHERE user_id = $1`, [userId]);
  return r.rows[0] ? toAccount(r.rows[0]) : null;
}

export async function setLang(tgUserId: number, lang: Locale): Promise<void> {
  await db().query('UPDATE telegram_accounts SET lang = $2, updated_at = now() WHERE tg_user_id = $1', [tgUserId, lang]);
}

export async function setPersona(tgUserId: number, persona: Persona): Promise<void> {
  await db().query('UPDATE telegram_accounts SET persona = $2, updated_at = now() WHERE tg_user_id = $1', [tgUserId, persona]);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Новая ссылка гасит прежние неиспользованные: в чате живой остаётся только последняя. */
export async function issueClaim(tgUserId: number): Promise<string> {
  const token = crypto.randomBytes(24).toString('base64url');
  await db().query('DELETE FROM telegram_claims WHERE tg_user_id = $1 AND used_at IS NULL', [tgUserId]);
  await db().query('INSERT INTO telegram_claims (token_hash, tg_user_id, expires_at) VALUES ($1,$2,$3)',
    [hashToken(token), tgUserId, new Date(Date.now() + CLAIM_TTL_MS)]);
  return token;
}

/** Живая ссылка без погашения — для показа страницы. */
export async function peekClaim(token: string): Promise<TgAccount | null> {
  const r = await db().query<Row>(
    `SELECT ${COLS.split(', ').map((c) => `a.${c}`).join(', ')}
     FROM telegram_claims c JOIN telegram_accounts a USING (tg_user_id)
     WHERE c.token_hash = $1 AND c.used_at IS NULL AND c.expires_at > now()`,
    [hashToken(token)]);
  return r.rows[0] ? toAccount(r.rows[0]) : null;
}

/** Атомарно гасит ссылку. null — ссылка чужая, просрочена или уже использована. */
export async function consumeClaim(token: string): Promise<TgAccount | null> {
  const r = await db().query<{ tg_user_id: string }>(
    `UPDATE telegram_claims SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING tg_user_id`,
    [hashToken(token)]);
  if (!r.rows[0]) return null;
  return getAccount(Number(r.rows[0].tg_user_id));
}

export class TelegramTakenError extends Error {
  constructor() { super('Этот аккаунт платформы уже привязан к другому Telegram.'); }
}

/** Привязывает Telegram к аккаунту. Один аккаунт — один Telegram и наоборот. */
export async function linkAccount(tgUserId: number, userId: string): Promise<void> {
  const other = await getAccountByUser(userId);
  if (other && other.tgUserId !== tgUserId) throw new TelegramTakenError();
  try {
    await db().query(
      'UPDATE telegram_accounts SET user_id = $2, linked_at = now(), updated_at = now() WHERE tg_user_id = $1',
      [tgUserId, userId]);
  } catch (e) {
    // Гонка: другой Telegram успел привязаться к этому аккаунту между проверкой и записью.
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') throw new TelegramTakenError();
    throw e;
  }
}

export async function unlinkUser(userId: string): Promise<number | null> {
  const r = await db().query<{ tg_user_id: string }>(
    'UPDATE telegram_accounts SET user_id = NULL, linked_at = NULL, updated_at = now() WHERE user_id = $1 RETURNING tg_user_id',
    [userId]);
  return r.rows[0] ? Number(r.rows[0].tg_user_id) : null;
}

export async function stats(): Promise<{ total: number; linked: number }> {
  const r = await db().query<{ total: string; linked: string }>(
    'SELECT count(*) AS total, count(user_id) AS linked FROM telegram_accounts');
  return { total: Number(r.rows[0].total), linked: Number(r.rows[0].linked) };
}

// ── Служебное состояние ───────────────────────────────────────────

export async function getState<T>(key: string): Promise<T | null> {
  const r = await db().query<{ value: T }>('SELECT value FROM telegram_state WHERE key = $1', [key]);
  return r.rows[0]?.value ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await db().query(
    `INSERT INTO telegram_state (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]);
}

// ── Привязка с сайта ──────────────────────────────────────────────

/** Токен для deep link: Telegram пропускает в start-параметре до 64 символов [A-Za-z0-9_-]. */
export async function issueSiteLink(userId: string): Promise<string> {
  const token = crypto.randomBytes(18).toString('base64url');
  await db().query('DELETE FROM telegram_site_links WHERE user_id = $1', [userId]);
  await db().query('INSERT INTO telegram_site_links (token_hash, user_id, expires_at) VALUES ($1,$2,$3)',
    [hashToken(token), userId, new Date(Date.now() + CLAIM_TTL_MS)]);
  return token;
}

export async function consumeSiteLink(token: string): Promise<string | null> {
  const r = await db().query<{ user_id: string }>(
    'DELETE FROM telegram_site_links WHERE token_hash = $1 AND expires_at > now() RETURNING user_id', [hashToken(token)]);
  return r.rows[0]?.user_id ?? null;
}

// ── Админка ───────────────────────────────────────────────────────

export interface TgAccountRow extends TgAccount {
  createdAt: Date;
  email: string | null;
  login: string | null;
  displayName: string | null;
  disabled: boolean;
}

export async function listAccounts(limit = 300): Promise<TgAccountRow[]> {
  const r = await db().query<Row & { created_at: Date; email: string | null; login: string | null; display_name: string | null; disabled_at: Date | null }>(
    `SELECT ${COLS.split(', ').map((c) => `a.${c}`).join(', ')}, a.created_at, u.email, u.login, u.display_name, u.disabled_at
     FROM telegram_accounts a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT $1`, [limit]);
  return r.rows.map((x) => ({
    ...toAccount(x), createdAt: x.created_at, email: x.email, login: x.login, displayName: x.display_name, disabled: !!x.disabled_at,
  }));
}

export async function personaStats(): Promise<{ persona: string; n: number }[]> {
  const r = await db().query<{ persona: string | null; n: string }>(
    'SELECT persona, count(*) AS n FROM telegram_accounts WHERE user_id IS NOT NULL GROUP BY persona ORDER BY n DESC');
  return r.rows.map((x) => ({ persona: x.persona ?? '—', n: Number(x.n) }));
}

export async function joinedSince(days: number): Promise<number> {
  const r = await db().query<{ n: string }>(
    `SELECT count(*) AS n FROM telegram_accounts WHERE linked_at > now() - make_interval(days => $1)`, [days]);
  return Number(r.rows[0].n);
}

export type UserStatus = 'active' | 'disabled' | 'missing';

/** Отличает заблокированный аккаунт от удалённого: заблокированному нельзя завести новый через бота. */
export async function userStatus(userId: string | null): Promise<UserStatus> {
  if (!userId) return 'missing';
  const r = await db().query<{ disabled_at: Date | null }>('SELECT disabled_at FROM users WHERE id = $1', [userId]);
  if (!r.rows[0]) return 'missing';
  return r.rows[0].disabled_at ? 'disabled' : 'active';
}
