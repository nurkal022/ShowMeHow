import { NextResponse } from 'next/server';
import { getArtifact, getSpec } from '@/lib/storage';
import { renderArtifact } from '@/lib/renderer';
import { reinstrument } from '@/lib/artifact';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { qualityReport } from '@/lib/pipeline/quality';
import { throttled } from '@/lib/http/throttle';
import { listMemberships } from '@/lib/org/access';
import { canGenerate, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';

export const maxDuration = 120;

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

/**
 * Проверка качества открытого тренажёра: те же пробы, что при генерации, плюс сверка
 * с планом. Человек видит, что работает, а что нет, и может отдать провалы на починку.
 * Chromium здесь поднимается в веб-процессе — как и у превью версий: проверка короткая
 * и не ставится в очередь, её ждут, глядя на кнопку.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  // Проверка — часть работы над тренажёром: кому генерация закрыта, тому и Chromium в веб-процессе.
  if (!canGenerate(user, await listMemberships(user.id))) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const { id } = await params;
  return throttled(user.id, 'check', async () => {
    try {
      const html = await getArtifact(user.id, id);
      if (html === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
      const spec = await getSpec(user.id, id);
      const report = await renderArtifact(reinstrument(html), { probes: true });
      return NextResponse.json(qualityReport(report, spec, html));
    } catch (e) {
      return NextResponse.json({ error: 'not found' }, { status: isInvalidSegment(e) ? 400 : 404 });
    }
  });
}
