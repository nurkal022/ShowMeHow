import { NextResponse } from 'next/server';
import { currentUserAllowingPasswordChange, SESSION_COOKIE, readCookie } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { findUserPasswordHash, updatePassword } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';
import { db } from '@/lib/db/client';
import crypto from 'node:crypto';

/**
 * Смена пароля. После неё все прочие сессии пользователя удаляются — иначе
 * украденная кука продолжала бы работать, а именно от неё пароль и меняют.
 * Текущая сессия остаётся живой, чтобы не выкидывать человека из интерфейса.
 */
export async function POST(req: Request) {
  // Разрешающий вариант: сюда приходит человек с временным паролем.
  const user = await currentUserAllowingPasswordChange(req);
  if (!user) return unauthorized();
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  const { currentPassword, newPassword } = body;
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }
  // При временном пароле текущий не спрашиваем: человек только что вошёл с ним,
  // а школьник его уже не помнит.
  if (!user.mustChangePassword) {
    const hash = await findUserPasswordHash(user.id);
    if (!hash || !verifyPassword(currentPassword ?? '', hash)) {
      return NextResponse.json({ error: 'Текущий пароль указан неверно.' }, { status: 403 });
    }
  }
  await updatePassword(user.id, newPassword);
  const token = readCookie(req, SESSION_COOKIE);
  const keep = token ? crypto.createHash('sha256').update(token).digest('hex') : '';
  await db().query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, keep]);
  return NextResponse.json({ ok: true });
}
