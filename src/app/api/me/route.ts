import { NextResponse } from 'next/server';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { quotaStatus, QUOTA_EXHAUSTED_MESSAGE } from '@/lib/quota';
import { getProfile, updateProfile } from '@/lib/auth/users';
import { sanitizeDisplayName } from '@/lib/auth/prefs';

export async function GET(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const [quota, profile] = await Promise.all([quotaStatus(user), getProfile(user.id)]);
  // Текст сообщения об исчерпанной квоте живёт в серверном lib/quota.ts (там же, где
  // импорт 'pg') — клиентский компонент не может импортировать его напрямую, поэтому
  // строку отдаём в ответе, и только когда остаток действительно нулевой.
  const quotaMessage = quota.remaining === 0 ? QUOTA_EXHAUSTED_MESSAGE : undefined;
  return NextResponse.json({
    user,
    quota,
    profile,
    prefs: profile?.prefs ?? {},
    ...(quotaMessage ? { quotaMessage } : {}),
  });
}

/** Частичное обновление профиля: имя и/или настройки интерфейса. */
export async function PATCH(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  let body: { displayName?: unknown; prefs?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  const profile = await updateProfile(user.id, {
    displayName: sanitizeDisplayName(body.displayName),
    prefs: body.prefs,
  });
  if (!profile) return unauthorized();
  return NextResponse.json({ profile, prefs: profile.prefs });
}
