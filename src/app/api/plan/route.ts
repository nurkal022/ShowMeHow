import { NextResponse } from 'next/server';
import {
  EMPTY_PROMPT_MESSAGE, INVALID_REQUEST_MESSAGE, INVALID_IMAGE_MESSAGE,
  MAX_IMAGE_DATA_URL_LENGTH, MAX_PROMPT_LENGTH, PROMPT_TOO_LONG_MESSAGE,
} from '@/lib/jobs/messages';
import { readJsonObject } from '@/lib/jobs/request-body';
import { activeProvider, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { listMemberships } from '@/lib/org/access';
import { canGenerate, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';
import { makeCtx } from '@/lib/pipeline/run';
import { plan, replan } from '@/lib/pipeline/stages';
import { isLevel, normalizeSpec } from '@/lib/pipeline/spec';
import { throttled } from '@/lib/http/throttle';

export const maxDuration = 120;

/**
 * План до генерации. Карточка плана — самое дешёвое место поправить тренажёр: правка
 * здесь стоит секунды, а неверно понятая тема обнаруживается только после минут
 * генерации. Это разговор, а не работа: очередь и квота не трогаются, как и у уточнения.
 *
 * {prompt, imageDataUrl?, level?, audience?} — новый план;
 * {spec, correction} — поправка к готовому плану.
 */
export async function POST(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const memberships = await listMemberships(user.id);
  if (!canGenerate(user, memberships)) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: INVALID_REQUEST_MESSAGE }, { status: 400 });
  if (!activeProvider()) return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 400 });
  // Квоту план не тратит, поэтому его сдерживает предохранитель: один запрос за раз и не чаще лимита.
  return throttled(user.id, 'plan', () => runPlan(body));
}

async function runPlan(body: Record<string, unknown>): Promise<NextResponse> {
  const ctx = makeCtx(() => {});
  try {
    if (body.spec && typeof body.correction === 'string') {
      const correction = body.correction.trim().slice(0, 2000);
      const current = normalizeSpec(body.spec).spec;
      if (!correction) return NextResponse.json({ spec: current });
      return NextResponse.json({ spec: await replan(ctx, current, correction) });
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return NextResponse.json({ error: EMPTY_PROMPT_MESSAGE }, { status: 400 });
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: PROMPT_TOO_LONG_MESSAGE }, { status: 400 });
    }
    const image = typeof body.imageDataUrl === 'string' && body.imageDataUrl ? body.imageDataUrl : undefined;
    if (image && (!image.startsWith('data:image/') || image.length > MAX_IMAGE_DATA_URL_LENGTH)) {
      return NextResponse.json({ error: INVALID_IMAGE_MESSAGE }, { status: 400 });
    }
    const spec = await plan(ctx, prompt, image, {
      level: isLevel(body.level) ? body.level : undefined,
      audience: typeof body.audience === 'string' ? body.audience.trim().slice(0, 80) || undefined : undefined,
    });
    return NextResponse.json({ spec });
  } catch (e) {
    return NextResponse.json(
      { error: 'Не удалось составить план: ' + (e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}
