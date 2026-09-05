import { getMeta, getRenderableArtifact } from '@/lib/storage';
import { currentUserFromRequest } from '@/lib/auth/session';

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

function notFound(status: number): Response {
  return new Response(JSON.stringify({ error: 'not found' }),
    { status, headers: { 'Content-Type': 'application/json' } });
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Требуется вход в систему.' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const meta = await getMeta(user.id, id);
    const html = await getRenderableArtifact(user.id, id);
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
