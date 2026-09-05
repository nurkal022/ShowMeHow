import { NextResponse } from 'next/server';
import { currentUserFromRequest } from '@/lib/auth/session';
import { quotaStatus, QUOTA_EXHAUSTED_MESSAGE } from '@/lib/quota';

export async function GET(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const quota = await quotaStatus(user);
  // Текст сообщения об исчерпанной квоте живёт в серверном lib/quota.ts (там же, где
  // импорт 'pg') — клиентский компонент не может импортировать его напрямую, поэтому
  // строку отдаём в ответе, и только когда остаток действительно нулевой.
  const quotaMessage = quota.remaining === 0 ? QUOTA_EXHAUSTED_MESSAGE : undefined;
  return NextResponse.json({ user, quota, ...(quotaMessage ? { quotaMessage } : {}) });
}
