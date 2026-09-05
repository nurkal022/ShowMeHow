import { NextResponse } from 'next/server';
import {
  createJob, appendEvent, markCancelled, isCancelled, setStatus,
} from '@/lib/jobs';
import { hasActive, submit, queuePosition } from '@/lib/limits';
import { quotaStatus, QUOTA_EXHAUSTED_MESSAGE } from '@/lib/quota';
import { makeCtx, runPipeline, CancelledError } from '@/lib/pipeline/run';
import { activeProvider, resolveMode, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import type { QualityMode } from '@/lib/types';

export const maxDuration = 600;

interface GenerateInput {
  ownerId: string;
  prompt: string;
  imageDataUrl?: string;
  mode: QualityMode;
}

export async function POST(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { prompt, imageDataUrl, mode: bodyMode } =
    (await req.json()) as {
      prompt: string; imageDataUrl?: string; mode?: QualityMode;
    };
  // Провайдер проверяется ДО createJob: если он не настроен, job не создаётся вовсе —
  // клиент получает 400 без побочных эффектов (никакого осиротевшего задания).
  if (!activeProvider()) {
    return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 400 });
  }
  const quota = await quotaStatus(user);
  if (quota.remaining !== null && quota.remaining <= 0) {
    return NextResponse.json({ error: QUOTA_EXHAUSTED_MESSAGE }, { status: 403 });
  }
  if (hasActive(user.id)) {
    return NextResponse.json(
      { error: 'У вас уже идёт генерация. Дождитесь её окончания или отмените.' }, { status: 409 });
  }
  const mode = resolveMode(bodyMode);
  const job = await createJob(user.id, { prompt, mode, hasImage: !!imageDataUrl });
  const state = submit(job.id, user.id,
    () => void runDetached(job.id, { ownerId: user.id, prompt, imageDataUrl, mode }));
  setStatus(job.id, state === 'running' ? 'running' : 'queued');
  if (state === 'queued') {
    appendEvent(job.id, { type: 'queued', position: queuePosition(job.id) });
  }
  return NextResponse.json({ jobId: job.id });
}

async function runDetached(jobId: string, input: GenerateInput): Promise<void> {
  try {
    // makeCtx конструируется здесь (не в POST), потому что emit должен писать
    // в конкретный jobId через appendEvent — привязка к job происходит на границе
    // detached-запуска, а не в обработчике HTTP-запроса.
    const ctx = makeCtx((e) => appendEvent(jobId, e));
    await runPipeline(ctx, input, () => isCancelled(jobId));
  } catch (e) {
    if (e instanceof CancelledError) {
      markCancelled(jobId);
    } else {
      appendEvent(jobId, { type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }
}
