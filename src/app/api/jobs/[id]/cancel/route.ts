import { NextResponse } from 'next/server';
import { getJob, requestCancel, markCancelled } from '@/lib/jobs';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const job = await getJob(user.id, id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Идемпотентно: requestCancel просто ставит флаг, повторный вызов ничего не ломает.
  requestCancel(id);
  // Ожидающее задание ещё не запускало пайплайн, поэтому CancelledError некому бросить:
  // снимаем его с очереди и закрываем сами (markCancelled зовёт finish).
  if (job.status === 'queued') markCancelled(id);
  return NextResponse.json({ ok: true });
}
