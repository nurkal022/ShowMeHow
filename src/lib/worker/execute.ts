import type { ClaimedJob, GenerateRequest, JobOutcome, RefineRequest } from '../jobs/store';
import { needsRun } from '../jobs/policy';
import { makeCtx, runPipeline, refineExisting, CancelledError } from '../pipeline/run';
import type { JobIO } from './worker';
import { saveDraft } from '../jobs/drafts';
import { loadCheckpoint, saveCheckpoint, clearCheckpoint } from '../jobs/checkpoints';

export interface ExecuteDeps {
  makeCtx: typeof makeCtx;
  runPipeline: typeof runPipeline;
  refineExisting: typeof refineExisting;
}

const DEFAULT_DEPS: ExecuteDeps = { makeCtx, runPipeline, refineExisting };

/**
 * Одно задание от начала до исхода. Не бросает: отмена и любые сбои становятся исходом,
 * который воркер запишет в базу одной транзакцией.
 */
export async function executeJob(
  job: ClaimedJob, io: JobIO, deps: ExecuteDeps = DEFAULT_DEPS,
): Promise<JobOutcome> {
  if (!needsRun(job)) {
    // Прошлая попытка успела сохранить результат и потеряла воркер до завершения.
    return { status: 'done', simulationId: job.simulationId! };
  }
  const outcome = await runJob(job, io, deps);
  // Исход записан — точки продолжения больше не нужны. При потере воркера сюда не дойдём,
  // и повтор задания продолжит с последнего этапа.
  clearCheckpoint(job.id);
  return outcome;
}

async function runJob(job: ClaimedJob, io: JobIO, deps: ExecuteDeps): Promise<JobOutcome> {
  try {
    const ctx = deps.makeCtx(io.emit);
    // Точки продолжения — только у генерации: доработка короткая и повторяется целиком.
    if (job.kind === 'generate') {
      ctx.checkpoint = {
        load: () => loadCheckpoint(job.id),
        save: (patch) => saveCheckpoint(job.id, patch),
      };
    }
    // Черновик сначала ложится в хранилище, потом о нём узнаёт поток: интерфейс не спросит то, чего ещё нет.
    ctx.draft = async (label, html) => {
      try {
        const version = await saveDraft(job.id, label, html);
        io.emit({ type: 'draft', version, label });
      } catch { /* черновик — удобство, генерацию он не роняет */ }
    };
    if (job.kind === 'refine') {
      const target = job.targetSimulationId;
      if (!target) return { status: 'error', message: 'У задания доработки не указана симуляция.' };
      const { instruction } = job.request as RefineRequest;
      await deps.refineExisting(ctx, job.ownerId, target, instruction,
        { signal: io.cancelled, onSaved: io.markSaved });
      return { status: 'done', simulationId: target };
    }
    const req = job.request as GenerateRequest;
    const meta = await deps.runPipeline(ctx, {
      ownerId: job.ownerId,
      prompt: req.prompt,
      mode: req.mode,
      spec: req.spec,
      brief: req.level || req.audience ? { level: req.level, audience: req.audience } : undefined,
      imageDataUrl: job.imageDataUrl ?? undefined,
      onSaved: io.markSaved,
    }, io.cancelled);
    return { status: 'done', simulationId: meta.id };
  } catch (e) {
    if (e instanceof CancelledError) return { status: 'cancelled' };
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
