import fs from 'node:fs';
import { getThumbnailPath } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getThumbnailPath(id);
  if (!p) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(p)),
    { headers: { 'Content-Type': 'image/png' } });
}
