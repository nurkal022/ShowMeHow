import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { searchEverything } from '@/lib/search';

export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return NextResponse.json({ hits: await searchEverything(user, q) });
}
