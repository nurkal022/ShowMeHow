import fs from 'node:fs';
import { getThumbnailPath } from '@/lib/storage';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const p = await getThumbnailPath(TEMP_OWNER_ID, id);
    if (!p) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(fs.readFileSync(p)),
      { headers: { 'Content-Type': 'image/png' } });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return new Response(null, { status });
  }
}
