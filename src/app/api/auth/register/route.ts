import { NextResponse } from 'next/server';
import { createUser, EmailTakenError, normalizeEmail } from '@/lib/auth/users';
import { createSession } from '@/lib/auth/session';
import { setSessionCookie, isSecureRequest, MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';
import { MAX_IDENTIFIER_LENGTH } from '@/lib/auth/identifier';
import { getPlatformSettings, REGISTRATION_CLOSED_MESSAGE } from '@/lib/platform-settings';
import { ensureSandbox } from '@/lib/demo/sandbox';
import { withOrgParam } from '@/lib/lms/links';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!(await getPlatformSettings()).registrationOpen) {
    return NextResponse.json({ error: REGISTRATION_CLOSED_MESSAGE }, { status: 403 });
  }
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  const normalized = email ? normalizeEmail(email) : '';
  if (!normalized || !EMAIL_RE.test(normalized)) {
    return NextResponse.json({ error: 'Введите корректный адрес почты.' }, { status: 400 });
  }
  // Вход не ищет идентификаторы длиннее MAX_IDENTIFIER_LENGTH: с такой почтой
  // аккаунт был бы создан, но войти в него было бы нельзя.
  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    return NextResponse.json(
      { error: `Адрес почты должен быть не длиннее ${MAX_IDENTIFIER_LENGTH} символов.` }, { status: 400 });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }
  try {
    const user = await createUser(normalized, password);
    const token = await createSession(user.id);
    // Пришедший по ссылке сразу видит всю систему на учебных данных. Не вышло — не беда:
    // аккаунт создан, а демо можно открыть позже кнопкой в полосе сверху.
    const box = await ensureSandbox(user).catch((e) => { console.error('Демо-университет не создан:', e); return null; });
    const next = box ? withOrgParam('/org', box.slug) : null;
    return setSessionCookie(NextResponse.json({ user, next }), token, isSecureRequest(req));
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: 'Такая почта уже зарегистрирована.' }, { status: 409 });
    }
    throw e;
  }
}
