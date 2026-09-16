/**
 * Идентификатор входа: почта или логин. Различаются по символу @ — у почты он
 * есть всегда, у логина не бывает никогда. Модуль без зависимостей от базы и
 * node:crypto: его импортируют клиентские компоненты.
 */
export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

/** Длиннее не бывает ни почта (RFC 5321), ни логин: такой ввод не ищем в базе. */
export const MAX_IDENTIFIER_LENGTH = 254;

export type Identifier = { kind: 'email'; value: string } | { kind: 'login'; value: string };

export function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidLogin(value: string): boolean {
  return LOGIN_RE.test(value);
}

/** null — ввод пустой или это не почта и не допустимый логин: такого аккаунта быть не может. */
export function parseIdentifier(raw: unknown): Identifier | null {
  if (typeof raw !== 'string') return null;
  const value = normalizeIdentifier(raw);
  if (!value) return null;
  if (value.includes('@')) return { kind: 'email', value };
  return isValidLogin(value) ? { kind: 'login', value } : null;
}

export interface LabeledUser {
  displayName: string | null;
  email: string | null;
  login: string | null;
}

/** Как показывать человека в шапке и профиле: у ученика почты может не быть. */
export function userLabel(u: LabeledUser): string {
  return u.displayName || u.email || u.login || '';
}

/** Строка «чем человек входит»: почта, а если её нет — логин. */
export function userContact(u: Pick<LabeledUser, 'email' | 'login'>): string {
  return u.email ?? u.login ?? '';
}
