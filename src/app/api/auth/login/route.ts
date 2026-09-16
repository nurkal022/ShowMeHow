import { NextResponse } from 'next/server';
import { findUserByIdentifier } from '@/lib/auth/users';
import { normalizeIdentifier } from '@/lib/auth/identifier';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { isLimited, recordFailure } from '@/lib/auth/rate-limit';
import { setSessionCookie, isSecureRequest } from '@/lib/auth/cookie';

// Один и тот же текст для неизвестного аккаунта и неверного пароля: иначе форма входа
// превращается в способ узнать, кто зарегистрирован.
const WRONG = 'Неверный логин, почта или пароль.';

// Хеш-пустышка того же формата и стоимости scrypt, что и у настоящих паролей.
// Сверяем с ним пароль, когда аккаунт не найден: иначе время ответа выдаёт,
// существует ли аккаунт.
const DUMMY_PASSWORD_HASH = hashPassword('заглушка-для-константного-времени-ответа');

export async function POST(req: Request) {
  const body = (await req.json()) as { identifier?: unknown; email?: unknown; password?: string };
  // Старые клиенты присылают поле email — принимаем его как идентификатор.
  const raw = body.identifier ?? body.email;
  const password = body.password;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const key = typeof raw === 'string' && raw.trim() ? normalizeIdentifier(raw) : undefined;

  if (isLimited(ip) || (key !== undefined && isLimited(key))) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }

  const fail = () => {
    recordFailure(ip);
    if (key !== undefined) recordFailure(key);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  };

  if (key === undefined || !password) return fail();

  const found = await findUserByIdentifier(key);
  const passwordOk = verifyPassword(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!found || !passwordOk) return fail();

  const token = await createSession(found.id);
  const { passwordHash: _ph, disabledAt: _da, ...user } = found;
  return setSessionCookie(NextResponse.json({ user }), token, isSecureRequest(req));
}
