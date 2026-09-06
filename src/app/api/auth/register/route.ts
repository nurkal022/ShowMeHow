import { NextResponse } from 'next/server';
import { createUser, EmailTakenError, normalizeEmail } from '@/lib/auth/users';
import { createSession } from '@/lib/auth/session';
import { setSessionCookie, isSecureRequest, MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !EMAIL_RE.test(normalizeEmail(email))) {
    return NextResponse.json({ error: 'Введите корректный адрес почты.' }, { status: 400 });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }
  try {
    const user = await createUser(email, password);
    const token = await createSession(user.id);
    return setSessionCookie(NextResponse.json({ user }), token, isSecureRequest(req));
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: 'Такая почта уже зарегистрирована.' }, { status: 409 });
    }
    throw e;
  }
}
