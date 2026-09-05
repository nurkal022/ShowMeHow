import { NextResponse } from 'next/server';
import { listSimulations } from '@/lib/storage';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

export async function GET(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  return NextResponse.json(await listSimulations(user.id));
}
