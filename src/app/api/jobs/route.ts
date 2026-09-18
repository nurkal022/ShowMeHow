import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/jobs/sessions';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

/** История сессий человека: генерации с доработками, включая отменённые и упавшие. */
export async function GET(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  return NextResponse.json({ sessions: await listSessions(user.id) });
}
