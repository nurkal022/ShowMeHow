import fs from 'node:fs';
import { getThumbnailPath } from '@/lib/storage';
import { currentUserFromRequest } from '@/lib/auth/session';

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromRequest(req);
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  try {
    const p = await getThumbnailPath(user.id, id);
    if (!p) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(fs.readFileSync(p)),
      { headers: { 'Content-Type': 'image/png' } });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return new Response(null, { status });
  }
}
