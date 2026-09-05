import { NextResponse } from 'next/server';
import { makeCtx, refineExisting } from '@/lib/pipeline/run';
import { getArtifact } from '@/lib/storage';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { instruction } = await req.json();
  try {
    await refineExisting(makeCtx(() => {}), TEMP_OWNER_ID, id, instruction);
    return NextResponse.json({ html: await getArtifact(TEMP_OWNER_ID, id) });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) },
      { status: 500 });
  }
}
