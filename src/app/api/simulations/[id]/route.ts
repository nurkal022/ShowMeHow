import { NextResponse } from 'next/server';
import { getMeta, getRenderableArtifact, deleteSimulation } from '@/lib/storage';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

type P = { params: Promise<{ id: string }> };

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  try {
    const meta = await getMeta(TEMP_OWNER_ID, id);
    const html = await getRenderableArtifact(TEMP_OWNER_ID, id);
    if (!meta || html === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ meta, html });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  try {
    // deleteSimulation молча ничего не делает для неизвестного (или чужого) id —
    // удаление идемпотентно; здесь ловим только path-traversal из assertSafe.
    await deleteSimulation(TEMP_OWNER_ID, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}
