import { NextResponse } from 'next/server';
import { getOwnedJob } from '@/lib/jobs/current';
import { publicJob } from '@/lib/jobs/store';
import { JOB_NOT_FOUND_MESSAGE } from '@/lib/jobs/messages';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  // Чужое задание неотличимо от несуществующего: иначе по угаданному id
  // посторонний узнал бы чужой промпт.
  const job = await getOwnedJob(user.id, id);
  if (!job) return NextResponse.json({ error: JOB_NOT_FOUND_MESSAGE }, { status: 404 });
  // Статус читается из базы как есть: потерянные задания возвращает уборщик воркера.
  return NextResponse.json(publicJob(job));
}
