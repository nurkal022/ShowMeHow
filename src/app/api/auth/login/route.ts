import { NextResponse } from 'next/server';
import { findUserByIdentifier, type AuthUser } from '@/lib/auth/users';
import { normalizeIdentifier } from '@/lib/auth/identifier';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, sessionTtlMs } from '@/lib/auth/session';
import { isLoginBlocked, recordLoginFailure } from '@/lib/auth/rate-limit';
import { setSessionCookie, isSecureRequest } from '@/lib/auth/cookie';
import { listMemberships } from '@/lib/org/access';
import { sessionKind } from '@/lib/org/policy';

// Один и тот же текст для неизвестного аккаунта и неверного пароля: иначе форма входа
// превращается в способ узнать, кто зарегистрирован.
const WRONG = 'Неверный логин, почта или пароль.';
const DISABLED = 'Аккаунт заблокирован. Обратитесь к администратору организации.';

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
  const key = typeof raw === 'string' && raw.trim() ? normalizeIdentifier(raw) : null;

  // Лимит проверяем ДО обращения к базе, но не расходуем на самой проверке:
  // расход происходит только при подтверждённой неудаче, см. fail() ниже.
  if (isLoginBlocked(ip, key)) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }

  const fail = () => {
    recordLoginFailure(ip, key);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  };

  if (key === null || !password) return fail();

  const found = await findUserByIdentifier(key);
  // Пароль сверяем всегда — даже когда аккаунт не найден, тогда против DUMMY_PASSWORD_HASH.
  // Результат в этом случае не имеет значения, важно лишь потратить то же время.
  const passwordOk = verifyPassword(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!found || !passwordOk) return fail();

  // О блокировке узнаёт только тот, кто знает пароль: с неверным — обычный 401 выше.
  // Неудачу в счётчик не пишем — верный пароль это не подбор.
  if (found.disabledAt) {
    return NextResponse.json({ error: DISABLED }, { status: 403 });
  }

  const kind = sessionKind(found, await listMemberships(found.id));
  const token = await createSession(found.id, kind);
  const user: AuthUser = {
    id: found.id, email: found.email, login: found.login, displayName: found.displayName,
    role: found.role, mustChangePassword: found.mustChangePassword,
  };
  return setSessionCookie(NextResponse.json({ user }), token, isSecureRequest(req), sessionTtlMs(kind));
}
