import { NextResponse } from 'next/server';
import { listHistory, restoreVersion, getArtifact, saveThumbnail } from '@/lib/storage';
import { renderArtifact } from '@/lib/renderer';

type P = { params: Promise<{ id: string }> };

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  try {
    return NextResponse.json(listHistory(id));
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: 'not found' }, { status });
  }
}

export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  const { name } = (await req.json()) as { name: string };
  try {
    restoreVersion(id, name);
    const html = getArtifact(id);
    try {
      const report = await renderArtifact(html);
      const shot = report.screenshots[1] ?? report.screenshots[0];
      if (shot) saveThumbnail(id, shot);
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
