import { NextResponse } from 'next/server';
import { getMeta, getRenderableArtifact, deleteSimulation } from '@/lib/storage';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const meta = await getMeta(user.id, id);
    const html = await getRenderableArtifact(user.id, id);
    if (!meta || html === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ meta, html });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}

export async function DELETE(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    // deleteSimulation отличает "удалено" от "не найдено или чужое" — на втором
    // случае отвечаем 404, одинаково для неизвестного id и чужой записи.
    const ok = await deleteSimulation(user.id, id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}
