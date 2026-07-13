import { NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Job без журнала событий — для лёгкого поллинга/mount-проверки статуса.
  const { events: _events, ...rest } = job;
  return NextResponse.json(rest);
}
