import { getMeta, getRenderableArtifact } from '@/lib/storage';

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const meta = getMeta(id);
    return new Response(getRenderableArtifact(id), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition':
          `attachment; filename*=UTF-8''${encodeURIComponent(meta.title)}.html`,
      },
    });
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return new Response(JSON.stringify({ error: 'not found' }),
      { status, headers: { 'Content-Type': 'application/json' } });
  }
}
