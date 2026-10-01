import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { notFound, type IdParams } from '@/lib/http/route-kit';
import { duplicateItem } from '@/lib/research/store';

export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const item = await duplicateItem(user.id, (await params).id);
  return item ? NextResponse.json({ item }, { status: 201 }) : notFound();
}
