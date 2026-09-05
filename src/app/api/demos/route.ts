import { NextResponse } from 'next/server';
import { installDemos } from '@/lib/demos';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

export const maxDuration = 600;

export async function POST(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    return NextResponse.json(await installDemos(user.id));
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) },
      { status: 500 });
  }
}
