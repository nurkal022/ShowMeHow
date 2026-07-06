import { NextResponse } from 'next/server';
import { getMeta, getArtifact, deleteSimulation } from '@/lib/storage';

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  try {
    return NextResponse.json({ meta: getMeta(id), html: getArtifact(id) });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  deleteSimulation(id);
  return NextResponse.json({ ok: true });
}
