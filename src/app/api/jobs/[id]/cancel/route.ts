import { NextResponse } from 'next/server';
import { getJob, requestCancel } from '@/lib/jobs';

type P = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: P) {
  const { id } = await params;
  if (!getJob(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Идемпотентно: requestCancel просто ставит флаг, повторный вызов ничего не ломает.
  requestCancel(id);
  return NextResponse.json({ ok: true });
}
