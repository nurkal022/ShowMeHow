import { getMeta, getRenderableArtifact } from '@/lib/storage';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

function notFound(status: number): Response {
  return new Response(JSON.stringify({ error: 'not found' }),
    { status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const meta = await getMeta(TEMP_OWNER_ID, id);
    const html = await getRenderableArtifact(TEMP_OWNER_ID, id);
    if (!meta || html === null) return notFound(404);
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition':
          `attachment; filename*=UTF-8''${encodeURIComponent(meta.title)}.html`,
      },
    });
  } catch (e) {
    return notFound(isInvalidSegment(e) ? 400 : 404);
  }
}
