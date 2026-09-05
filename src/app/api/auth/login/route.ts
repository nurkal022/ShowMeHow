import { NextResponse } from 'next/server';
import { findUserByEmail, normalizeEmail } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { hitLimit } from '@/lib/auth/rate-limit';
import { setSessionCookie } from '@/lib/auth/cookie';

// Один и тот же текст для неизвестной почты и неверного пароля: иначе форма входа
// превращается в способ узнать, кто зарегистрирован.
const WRONG = 'Неверная почта или пароль.';

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  if (hitLimit(ip)) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }
  const found = await findUserByEmail(normalizeEmail(email));
  if (!found || !verifyPassword(password, found.passwordHash)) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }
  const token = await createSession(found.id);
  const user = { id: found.id, email: found.email, role: found.role };
  return setSessionCookie(NextResponse.json({ user }), token);
}
