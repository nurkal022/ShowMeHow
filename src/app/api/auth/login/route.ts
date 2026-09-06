import { NextResponse } from 'next/server';
import { findUserByEmail, normalizeEmail } from '@/lib/auth/users';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { isLimited, recordFailure } from '@/lib/auth/rate-limit';
import { setSessionCookie, isSecureRequest } from '@/lib/auth/cookie';

// Один и тот же текст для неизвестной почты и неверного пароля: иначе форма входа
// превращается в способ узнать, кто зарегистрирован.
const WRONG = 'Неверная почта или пароль.';

// Хеш-пустышка того же формата и стоимости scrypt, что и у настоящих паролей.
// Считаем его один раз при загрузке модуля и сверяем с ним пароль, когда почта не
// найдена: иначе verifyPassword вызывается только для существующих пользователей,
// а время ответа стабильно отличается — это тайминговый оракул перечисления почт.
const DUMMY_PASSWORD_HASH = hashPassword('заглушка-для-константного-времени-ответа');

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  // Заголовок клиент подделывает как угодно — это лишь первый, слабый барьер.
  // Настоящую защиту от подбора пароля к конкретному аккаунту даёт лимит по почте ниже.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const emailKey = email ? normalizeEmail(email) : undefined;

  // Лимит проверяем ДО обращения к базе, но не расходуем на самой проверке:
  // расход происходит только при подтверждённой неудаче, см. fail() ниже.
  if (isLimited(ip) || (emailKey !== undefined && isLimited(emailKey))) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }

  const fail = () => {
    recordFailure(ip);
    if (emailKey !== undefined) recordFailure(emailKey);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  };

  if (!email || !password || emailKey === undefined) {
    return fail();
  }

  const found = await findUserByEmail(emailKey);
  // Пароль сверяем всегда — даже когда почта не найдена, тогда против DUMMY_PASSWORD_HASH.
  // Результат в этом случае не имеет значения, важно лишь потратить то же время.
  const passwordOk = verifyPassword(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!found || !passwordOk) {
    return fail();
  }

  const token = await createSession(found.id);
  const user = { id: found.id, email: found.email, role: found.role };
  return setSessionCookie(NextResponse.json({ user }), token, isSecureRequest(req));
}
