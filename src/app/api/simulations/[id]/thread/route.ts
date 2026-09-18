import { NextResponse } from 'next/server';
import { simulationThread } from '@/lib/jobs/sessions';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

/** Переписка по симуляции: исходный запрос и доработки. Чужая симуляция даёт пустой список. */
export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  return NextResponse.json({ messages: await simulationThread(user.id, (await params).id) });
}
