import { isValidLogin, normalizeIdentifier } from '../auth/identifier';

/**
 * «Почта или логин и имя» из формы админки и кабинета. Модуль чистый:
 * роут проверяет ввод до того, как что-то создавать.
 */

export const MAX_DISPLAY_NAME = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PersonInput =
  | { kind: 'email'; email: string; displayName: string | null }
  | { kind: 'login'; login: string; displayName: string };

export function parsePersonInput(raw: unknown): PersonInput | { error: string } {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const name = typeof src.displayName === 'string' ? src.displayName.trim().replace(/\s+/g, ' ') : '';
  if (name.length > MAX_DISPLAY_NAME) return { error: `Имя — не длиннее ${MAX_DISPLAY_NAME} символов.` };
  const email = typeof src.email === 'string' ? normalizeIdentifier(src.email) : '';
  if (email) {
    if (email.length > 254 || !EMAIL_RE.test(email)) return { error: 'Почта указана неверно.' };
    return { kind: 'email', email, displayName: name || null };
  }
  const login = typeof src.login === 'string' ? normalizeIdentifier(src.login) : '';
  if (!login) return { error: 'Укажите почту или логин.' };
  if (!isValidLogin(login)) {
    return { error: 'Логин может содержать только строчные латинские буквы, цифры, точку, дефис и подчёркивание, '
      + 'от 3 до 40 символов.' };
  }
  if (!name) return { error: 'Для входа по логину укажите имя человека.' };
  return { kind: 'login', login, displayName: name };
}
