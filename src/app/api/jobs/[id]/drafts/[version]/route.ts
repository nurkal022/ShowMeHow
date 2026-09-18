import { NextResponse } from 'next/server';
import { getOwnedJob } from '@/lib/jobs/current';
import { getDraft } from '@/lib/jobs/drafts';
import { JOB_NOT_FOUND_MESSAGE } from '@/lib/jobs/messages';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string; version: string }> };

/** Версия симуляции по ходу генерации: то, что человек видит и пробует в рабочей области. */
export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id, version } = await params;
  const job = await getOwnedJob(user.id, id);
  const draft = job ? await getDraft(id, Number(version)) : null;
  if (!draft) return NextResponse.json({ error: JOB_NOT_FOUND_MESSAGE }, { status: 404 });
  return NextResponse.json(draft);
}
