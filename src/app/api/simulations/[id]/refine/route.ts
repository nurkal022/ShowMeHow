import { NextResponse } from 'next/server';
import { makeCtx, refineExisting } from '@/lib/pipeline/run';
import { getArtifact } from '@/lib/storage';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { instruction } = await req.json();
  try {
    await refineExisting(makeCtx(() => {}), id, instruction);
    return NextResponse.json({ html: getArtifact(id) });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) },
      { status: 500 });
  }
}
