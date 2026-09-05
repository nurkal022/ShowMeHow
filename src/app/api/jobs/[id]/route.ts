import { NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const job = await getJob(user.id, id);
  // Чужое задание неотличимо от несуществующего: иначе по угаданному id
  // посторонний узнал бы чужой промпт и весь журнал пайплайна.
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Job без журнала событий — для лёгкого поллинга/mount-проверки статуса.
  const { events: _events, ownerId: _ownerId, ...rest } = job;
  return NextResponse.json(rest);
}
