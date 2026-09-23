import { NextResponse } from 'next/server';
import { setExemplar } from '@/lib/storage';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { readJsonObject } from '@/lib/jobs/request-body';

/**
 * «Сделать эталоном»: следующие генерации автора берут из этого тренажёра приборы,
 * виды и сценарий урока как образец. {on: true|false}.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await readJsonObject(req);
  try {
    const ok = await setExemplar(user.id, id, body?.on !== false);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ exemplar: body?.on !== false });
  } catch (e) {
    const status = e instanceof Error && e.message.includes('invalid path segment') ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}
