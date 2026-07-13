import { NextResponse } from 'next/server';
import { createJob, appendEvent, markCancelled, isCancelled } from '@/lib/jobs';
import { makeCtx, runPipeline, resolveCandidates, CancelledError } from '@/lib/pipeline/run';
import { activeProvider, resolveMode } from '@/lib/settings';
import type { QualityMode } from '@/lib/types';

export const maxDuration = 600;

interface GenerateInput {
  prompt: string;
  imageDataUrl?: string;
  mode: QualityMode;
  candidates: number;
}

export async function POST(req: Request) {
  const { prompt, imageDataUrl, mode: bodyMode, candidates: bodyCandidates } =
    (await req.json()) as {
      prompt: string; imageDataUrl?: string; mode?: QualityMode; candidates?: number;
    };
  // Провайдер проверяется ДО createJob: если он не настроен, job не создаётся вовсе —
  // клиент получает 400 без побочных эффектов (никакого осиротевшего job-файла).
  if (!activeProvider()) {
    return NextResponse.json(
      { error: 'Провайдер не настроен. Откройте Настройки.' }, { status: 400 });
  }
  const mode = resolveMode(bodyMode);
  const candidates = resolveCandidates(mode, bodyCandidates);
  const job = createJob({ prompt, mode, candidates, hasImage: !!imageDataUrl });
  void runDetached(job.id, { prompt, imageDataUrl, mode, candidates });
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
