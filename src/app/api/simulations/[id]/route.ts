import { NextResponse } from 'next/server';
import { getMeta, getRenderableArtifact, deleteSimulation } from '@/lib/storage';

type P = { params: Promise<{ id: string }> };

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  try {
    return NextResponse.json({ meta: getMeta(id), html: getRenderableArtifact(id) });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  try {
    // deleteSimulation вызывает fs.rmSync(..., {force: true}) — удаление неизвестного,
    // но валидного id идемпотентно и не бросает; здесь ловим только path-traversal из assertSafe.
    deleteSimulation(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}
