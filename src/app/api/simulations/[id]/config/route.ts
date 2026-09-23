import { NextResponse } from 'next/server';
import { getArtifact, getSpec, saveSpec, updateArtifact, saveThumbnail } from '@/lib/storage';
import { renderArtifact } from '@/lib/renderer';
import { reinstrument } from '@/lib/artifact';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { readJsonObject } from '@/lib/jobs/request-body';
import { readConfig, sanitizeConfig, writeConfig } from '@/lib/pipeline/config';
import { specWithConfig } from '@/lib/pipeline/run';
import { acquire, throttled, THROTTLE_MESSAGE } from '@/lib/http/throttle';
import { listMemberships } from '@/lib/org/access';
import { canGenerate, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';

/** Настройки меняют тренажёр — это правка, и она закрыта тому, кому закрыта генерация. */
async function forbidden(user: Parameters<typeof canGenerate>[0] & { id: string }): Promise<NextResponse | null> {
  return canGenerate(user, await listMemberships(user.id))
    ? null : NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
}

type P = { params: Promise<{ id: string }> };

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

/**
 * Настройки тренажёра без модели: подписи, диапазоны, начальные значения, пресеты,
 * название. Правится только JSON-наложение — код не трогается, ответ за секунды.
 *
 * GET отдаёт текущее наложение и параметры, от которых его показывать: из плана,
 * а для старых симуляций без плана — из самой страницы.
 */
export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const html = await getArtifact(user.id, id);
    if (html === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const spec = await getSpec(user.id, id);
    let parameters = spec?.parameters ?? [];
    if (parameters.length === 0) {
      // Плана нет — берём слайдеры с живой страницы. Это Chromium: под предохранителем.
      const denied = await forbidden(user);
      if (denied) return denied;
      const release = acquire(user.id, 'config');
      if (!release) return NextResponse.json({ error: THROTTLE_MESSAGE }, { status: 429 });
      let report;
      try {
        report = await renderArtifact(reinstrument(html), { shotTimes: [300], probes: true });
      } finally {
        release();
      }
      parameters = (report.probes?.controls ?? []).filter((c) => c.kind === 'slider')
        .map((c) => ({ name: c.name, label: c.label, min: 0, max: 0, step: 0, value: 0, unit: '' }));
    }
    return NextResponse.json({
      config: readConfig(html), title: spec?.title ?? '', parameters, presets: spec?.presets ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: isInvalidSegment(e) ? 400 : 404 });
  }
}

export async function PUT(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const denied = await forbidden(user);
  if (denied) return denied;
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  return throttled(user.id, 'config', () => saveConfig(user.id, id, body));
}

async function saveConfig(userId: string, id: string, body: Record<string, unknown>): Promise<NextResponse> {
  const user = { id: userId };
  try {
    const html = await getArtifact(user.id, id);
    if (html === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const config = sanitizeConfig(body.config);
    const next = writeConfig(html, config);
    const report = await renderArtifact(reinstrument(next));
    if (!report.ok) {
      return NextResponse.json(
        { error: 'С такими настройками тренажёр не запускается: ' + report.errors.slice(0, 2).join('; ') },
        { status: 422 });
    }
    await updateArtifact(user.id, id, next);
    const spec = await getSpec(user.id, id);
    if (spec) await saveSpec(user.id, id, specWithConfig(spec, config));
    const shot = report.screenshots[1] ?? report.screenshots[0];
    if (shot) await saveThumbnail(user.id, id, shot);
    return NextResponse.json({ html: reinstrument(next), config });
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: isInvalidSegment(e) ? 400 : 404 });
  }
}
