import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { executeJob, type ExecuteDeps } from '@/lib/worker/execute';
import { CancelledError } from '@/lib/pipeline/run';
import { NO_PROVIDER_MESSAGE } from '@/lib/settings';
import type { ClaimedJob } from '@/lib/jobs/store';
import type { JobIO } from '@/lib/worker/worker';
import type { Ctx } from '@/lib/pipeline/stages';
import type { SimulationMeta } from '@/lib/types';

const OWNER = '11111111-1111-1111-1111-111111111111';
const SIM = '55555555-5555-5555-5555-555555555555';

function claimed(extra: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: crypto.randomUUID(), ownerId: OWNER, kind: 'generate', status: 'running', priority: 0,
    request: { prompt: 'маятник', mode: 'fast', hasImage: true },
    targetSimulationId: null, simulationId: null, error: null, attempts: 1, cancelRequested: false,
    createdAt: '2026-09-17T10:00:00.000Z', startedAt: '2026-09-17T10:00:01.000Z', finishedAt: null,
    imageDataUrl: 'data:image/png;base64,AA',
    ...extra,
  };
}

function makeIo(): JobIO {
  return { emit: vi.fn(), cancelled: vi.fn(() => false), markSaved: vi.fn(async () => {}) };
}

function makeDeps(over: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    makeCtx: vi.fn(() => ({}) as Ctx),
    runPipeline: vi.fn(async () => ({ id: SIM }) as SimulationMeta),
    refineExisting: vi.fn(async () => {}),
    ...over,
  };
}

describe('executeJob', () => {
  it('генерация: передаёт вход, картинку, отмену и onSaved', async () => {
    const io = makeIo();
    const deps = makeDeps();
    expect(await executeJob(claimed(), io, deps)).toEqual({ status: 'done', simulationId: SIM });
    expect(deps.makeCtx).toHaveBeenCalledWith(io.emit);
    expect(deps.runPipeline).toHaveBeenCalledWith({}, {
      ownerId: OWNER, prompt: 'маятник', mode: 'fast',
      imageDataUrl: 'data:image/png;base64,AA', onSaved: io.markSaved,
    }, io.cancelled);
  });

  it('доработка: правит целевую симуляцию и возвращает её id', async () => {
    const io = makeIo();
    const deps = makeDeps();
    const job = claimed({
      kind: 'refine', request: { instruction: 'медленнее' }, targetSimulationId: SIM, imageDataUrl: null,
    });
    expect(await executeJob(job, io, deps)).toEqual({ status: 'done', simulationId: SIM });
    expect(deps.refineExisting).toHaveBeenCalledWith({}, OWNER, SIM, 'медленнее',
      { signal: io.cancelled, onSaved: io.markSaved });
    expect(deps.runPipeline).not.toHaveBeenCalled();
  });

  it('сохранённое задание завершается без повторной генерации', async () => {
    const deps = makeDeps();
    expect(await executeJob(claimed({ simulationId: SIM }), makeIo(), deps))
      .toEqual({ status: 'done', simulationId: SIM });
    expect(deps.makeCtx).not.toHaveBeenCalled();
    expect(deps.runPipeline).not.toHaveBeenCalled();
  });

  it('CancelledError — отмена', async () => {
    const deps = makeDeps({ runPipeline: vi.fn(async () => { throw new CancelledError(); }) });
    expect(await executeJob(claimed(), makeIo(), deps)).toEqual({ status: 'cancelled' });
  });

  it('прочие исключения — ошибка с текстом', async () => {
    const deps = makeDeps({ runPipeline: vi.fn(async () => { throw new Error('Модель не ответила.'); }) });
    expect(await executeJob(claimed(), makeIo(), deps))
      .toEqual({ status: 'error', message: 'Модель не ответила.' });
  });

  it('провайдер не настроен — ошибка, а не падение воркера', async () => {
    const deps = makeDeps({ makeCtx: vi.fn(() => { throw new Error(NO_PROVIDER_MESSAGE); }) });
    expect(await executeJob(claimed(), makeIo(), deps))
      .toEqual({ status: 'error', message: NO_PROVIDER_MESSAGE });
  });

  it('доработка без целевой симуляции — ошибка', async () => {
    const job = claimed({ kind: 'refine', request: { instruction: 'x' }, targetSimulationId: null });
    expect(await executeJob(job, makeIo(), makeDeps()))
      .toEqual({ status: 'error', message: 'У задания доработки не указана симуляция.' });
  });
});
