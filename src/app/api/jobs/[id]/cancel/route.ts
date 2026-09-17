import { NextResponse } from 'next/server';
import { getJobStore, getOwnedJob } from '@/lib/jobs/current';
import { JOB_NOT_FOUND_MESSAGE } from '@/lib/jobs/messages';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const job = await getOwnedJob(user.id, id);
  if (!job) return NextResponse.json({ error: JOB_NOT_FOUND_MESSAGE }, { status: 404 });
  const store = getJobStore();
  // Ожидающее закрываем сами: пайплайна, который бросил бы CancelledError, ещё нет.
  if (job.status === 'queued' && (await store.cancelQueued(id))) {
    return NextResponse.json({ ok: true });
  }
  // Идущее (или взятое воркером между чтением и отменой) останавливает воркер:
  // флаг он увидит в ближайшем сердцебиении. Для завершённого это ничего не меняет.
  await store.requestCancel(id);
  return NextResponse.json({ ok: true });
}
