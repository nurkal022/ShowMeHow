import { NextResponse } from 'next/server';
import { getJobStore } from '@/lib/jobs/current';
import { ActiveJobExistsError } from '@/lib/jobs/store';
import { jobPriority } from '@/lib/jobs/policy';
import {
  EMPTY_PROMPT_MESSAGE, GENERATION_BUSY_MESSAGE, INVALID_IMAGE_MESSAGE, INVALID_REQUEST_MESSAGE,
  MAX_IMAGE_DATA_URL_LENGTH,
} from '@/lib/jobs/messages';
import { quotaStatus, quotaExhaustedMessage } from '@/lib/quota';
import { activeProvider, resolveMode, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { listMemberships } from '@/lib/org/access';
import { canGenerate, hasStaffRole, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';
import type { QualityMode } from '@/lib/types';

export const maxDuration = 600;

/**
 * Веб только ставит заявку в очередь: пайплайн и Chromium живут в воркере.
 * «Одна генерация на человека» держит уникальный индекс базы, а не память процесса,
 * поэтому второй одновременный POST получает 409 без всякой резервации.
 */
export async function POST(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const memberships = await listMemberships(user.id);
  if (!canGenerate(user, memberships)) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const body = await readBody(req);
  if (!body) {
    return NextResponse.json({ error: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: EMPTY_PROMPT_MESSAGE }, { status: 400 });
  }
  // Картинка пишется в базу вместе с заданием, поэтому формат и размер проверяются здесь.
  const rawImage = body.imageDataUrl;
  const imageDataUrl = rawImage === undefined || rawImage === null || rawImage === ''
    ? undefined : rawImage;
  if (imageDataUrl !== undefined && !isImageDataUrl(imageDataUrl)) {
    return NextResponse.json({ error: INVALID_IMAGE_MESSAGE }, { status: 400 });
  }
  // Провайдер проверяется до создания задания: без него воркеру нечего делать.
  if (!activeProvider()) {
    return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 400 });
  }
  const quota = await quotaStatus(user, memberships);
  if (quota.limit !== null && quota.remaining !== null && quota.remaining <= 0) {
    return NextResponse.json(
      { error: quotaExhaustedMessage(quota.limit, hasStaffRole(memberships)) }, { status: 403 });
  }
  try {
    const job = await getJobStore().create({
      ownerId: user.id,
      kind: 'generate',
      priority: jobPriority(user, memberships),
      request: { prompt, mode: resolveMode(body.mode), hasImage: !!imageDataUrl },
      imageDataUrl,
    });
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    if (e instanceof ActiveJobExistsError) {
      return NextResponse.json({ error: GENERATION_BUSY_MESSAGE }, { status: 409 });
    }
    throw e;
  }
}

interface GenerateBody { prompt?: unknown; imageDataUrl?: unknown; mode?: QualityMode }

/** null — тело не JSON-объект: такой запрос не от нашего клиента, но 500 он не заслуживает. */
async function readBody(req: Request): Promise<GenerateBody | null> {
  try {
    const body: unknown = await req.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as GenerateBody : null;
  } catch {
    return null;
  }
}

function isImageDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/') && v.length <= MAX_IMAGE_DATA_URL_LENGTH;
}
