import { NextResponse } from 'next/server';
import { listHistory, restoreVersion, getRenderableArtifact, saveThumbnail } from '@/lib/storage';
import { renderArtifact } from '@/lib/renderer';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const hist = await listHistory(user.id, id);
    if (hist === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(hist);
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}

export async function POST(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const { name } = (await req.json()) as { name: string };
  try {
    const ok = await restoreVersion(user.id, id, name);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const html = await getRenderableArtifact(user.id, id);
    if (html === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    try {
      const report = await renderArtifact(html);
      const shot = report.screenshots[1] ?? report.screenshots[0];
      if (shot) await saveThumbnail(user.id, id, shot);
    } catch {
      // рендер thumbnail упал — restore всё равно успешен, просто не обновляем превью
    }
    return NextResponse.json({ html });
  } catch (e) {
    if (isInvalidSegment(e)) {
      return NextResponse.json({ error: 'invalid path segment' }, { status: 400 });
    }
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
