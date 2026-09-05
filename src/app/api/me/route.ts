import { NextResponse } from 'next/server';
import { currentUserFromRequest } from '@/lib/auth/session';

export async function GET(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ user });
}
