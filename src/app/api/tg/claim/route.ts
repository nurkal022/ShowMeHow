import { NextResponse } from 'next/server';
import { createUser, EmailTakenError, normalizeEmail, type AuthUser } from '@/lib/auth/users';
import { createSession, currentUserFromRequest, readCookie, resolveSessionDetails, SESSION_COOKIE } from '@/lib/auth/session';
import { setSessionCookie, isSecureRequest, MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';
import { MAX_IDENTIFIER_LENGTH, userLabel } from '@/lib/auth/identifier';
import { LOCALE_COOKIE } from '@/i18n/config';
import { consumeClaim, linkAccount, peekClaim, TelegramTakenError, userStatus } from '@/lib/telegram/store';
import { personaHome } from '@/lib/telegram/urls';
import { notifyLinked } from '@/lib/telegram/bot';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRED = 'Ссылка устарела или уже использована. Получите новую в боте: /start.';

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/**
 * Привязка Telegram по одноразовой ссылке из бота. Вошедший привязывает текущий
 * аккаунт; гость создаёт новый по почте и паролю. Ссылка из бота — приглашение,
 * поэтому закрытая регистрация на сайте её не останавливает.
 */
export async function POST(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Тело — чужой ввод: не строка там, где ждём строку, — считаем, что поля нет.
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const body = { email: str(raw?.email), password: str(raw?.password) };
  const token = (str(raw?.token) ?? '').slice(0, 200);
  const pending = token ? await peekClaim(token) : null;
  if (!pending) return bad(EXPIRED, 410);
  // Telegram уже у заблокированного аккаунта: новый аккаунт через бота — обход блокировки.
  if ((await userStatus(pending.userId)) === 'disabled') {
    return bad('Аккаунт, к которому привязан этот Telegram, заблокирован. Обратитесь к администратору.', 403);
  }
  // Админ, вошедший от имени другого, не должен привязать свой Telegram к чужому аккаунту.
  if ((await resolveSessionDetails(readCookie(req, SESSION_COOKIE)))?.impersonator) {
    return bad('Вы вошли от имени другого пользователя. Вернитесь в свой аккаунт и откройте ссылку снова.', 403);
  }

  let user: AuthUser | null = await currentUserFromRequest(req);
  let newSession: string | null = null;
  if (!user) {
    const email = body.email ? normalizeEmail(body.email) : '';
    if (!email || !EMAIL_RE.test(email) || email.length > MAX_IDENTIFIER_LENGTH) {
      return bad('Введите корректный адрес почты.');
    }
    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      return bad(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
    }
    try {
      user = await createUser(email, body.password);
    } catch (e) {
      if (e instanceof EmailTakenError) return bad('Такая почта уже зарегистрирована. Войдите, и ссылка привяжет аккаунт.', 409);
      throw e;
    }
    newSession = await createSession(user.id);
  }

  const acc = await consumeClaim(token);
  if (!acc) return bad(EXPIRED, 410);
  try {
    await linkAccount(acc.tgUserId, user.id);
  } catch (e) {
    if (e instanceof TelegramTakenError) return bad(e.message, 409);
    throw e;
  }
  // Сообщения в Telegram не держат ответ: человек уже ждёт перехода.
  notifyLinked(acc, userLabel(user)).catch((e) => console.warn('[telegram] notify:', (e as Error).message));

  const res = NextResponse.json({ ok: true, next: personaHome(acc.persona) });
  if (acc.lang) res.cookies.set(LOCALE_COOKIE, acc.lang, { path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax' });
  return newSession ? setSessionCookie(res, newSession, isSecureRequest(req)) : res;
}
