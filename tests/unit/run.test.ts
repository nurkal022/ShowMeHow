import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline, refineExisting, MODES } from '@/lib/pipeline/run';
import type { Ctx } from '@/lib/pipeline/stages';
import { getArtifact, getMeta, listHistory, createSimulation } from '@/lib/storage';
import type { PipelineEvent, RenderReport } from '@/lib/types';

const SPEC = { title: 'Маятник', subject: 'Физика', mode: '2d', learningGoals: ['x'],
  physics: 'F=ma', parameters: [], visualPlan: 'v' };
const HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas></body></html>';
const okRender: RenderReport = { ok: true, errors: [], animated: true,
  screenshots: [Buffer.from('png')] };
const GOOD = { physics: 9, clarity: 9, interactivity: 9, aesthetics: 9 };
const WEAK = { physics: 6, clarity: 9, interactivity: 9, aesthetics: 9 };

function fakeCtx(opts: { firstScores?: object; renders?: RenderReport[] } = {}): {
  ctx: Ctx; events: PipelineEvent[];
} {
  const events: PipelineEvent[] = [];
  let judgeCall = 0;
  const renders = opts.renders;
  const ctx: Ctx = {
    genChat: vi.fn(async (msgs) => {
      const sys = String(msgs[0].content);
      if (sys.includes('методист')) return JSON.stringify(SPEC);
      return '```html\n' + HTML + '\n```';
    }),
    visionChat: vi.fn(async (msgs) => {
      const sys = String(msgs[0].content);
      // ВАЖНО: сначала проверяем судью — JUDGE_SYSTEM тоже содержит слово «рецензента»
      if (!sys.includes('судья качества')) return '{"physicsOk": true, "issues": []}';
      // судья: первый вызов — заданные баллы, дальше — хорошие
      const s = judgeCall++ === 0 ? (opts.firstScores ?? GOOD) : GOOD;
      const user = JSON.stringify(msgs[1].content);
      const n = (user.match(/Кандидат /g) ?? ['x']).length;
      return JSON.stringify({ winnerIndex: 0,
        scores: Array.from({ length: n }, () => s), feedback: 'улучшить' });
    }),
    render: vi.fn(async () => renders ? renders.shift() ?? okRender : okRender),
    emit: (e) => events.push(e),
  };
  return { ctx, events };
}

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
});

describe('runPipeline', () => {
  it('fast mode: 1 candidate, no judge, saves simulation', async () => {
    const { ctx, events } = fakeCtx();
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'fast' });
    expect(getMeta(meta.id).title).toBe('Маятник');
    expect(getArtifact(meta.id)).toContain('showmehow-runtime');
    expect(ctx.visionChat).toHaveBeenCalledTimes(1); // только критик, судьи нет
    expect(events.at(-1)).toEqual({ type: 'done', simulationId: meta.id });
  });

  it('max mode: refines until threshold met', async () => {
    const { ctx } = fakeCtx({ firstScores: WEAK }); // первый суд: physics=6 < 8
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    // genChat: план + 3 кандидата + 1 рефайн = 5
    expect(ctx.genChat).toHaveBeenCalledTimes(5);
  });

  it('all candidates broken: saves best-effort with warning', async () => {
    const bad: RenderReport = { ok: false, errors: ['err'], animated: false, screenshots: [] };
    const { ctx, events } = fakeCtx({ renders: Array(20).fill(bad) });
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'fast' });
    expect(getMeta(meta.id).warning).toMatch(/ошибк/i);
    expect(events.some((e) => e.type === 'warning')).toBe(true);
  });

  it('winner not animated after fix attempts: saved with animation warning', async () => {
    const staticReport: RenderReport = { ok: true, errors: [], animated: false,
      screenshots: [Buffer.from('png')] };
    const { ctx, events } = fakeCtx({ renders: Array(20).fill(staticReport) });
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'fast' });
    expect(getMeta(meta.id).warning).toMatch(/анимация/i);
    expect(events.some((e) => e.type === 'warning' && /анимация/i.test(e.message))).toBe(true);
  });

  it('vision unavailable: standard mode degrades with warning', async () => {
    const { ctx, events } = fakeCtx();
    ctx.visionChat = null;
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'standard' });
    expect(getMeta(meta.id).warning).toMatch(/vision/i);
    expect(events.some((e) => e.type === 'warning')).toBe(true);
  });

  // --- Guard: judge/rescore must never crash the whole pipeline ---

  it('guard: judge returns malformed JSON -> falls back to first candidate with warning', async () => {
    const events: PipelineEvent[] = [];
    const ctx: Ctx = {
      genChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('методист')) return JSON.stringify(SPEC);
        return '```html\n' + HTML + '\n```';
      }),
      visionChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('судья качества')) return 'это не JSON, а обычный текст без скобок';
        return '{"physicsOk": true, "issues": []}';
      }),
      render: vi.fn(async () => okRender),
      emit: (e) => events.push(e),
    };
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'standard' });
    expect(getMeta(meta.id).warning).toMatch(/судья/i);
    expect(getArtifact(meta.id)).toContain('showmehow-runtime');
    expect(events.some((e) => e.type === 'warning')).toBe(true);
  });

  it('guard: scores array shorter than candidates does not crash', async () => {
    const events: PipelineEvent[] = [];
    let judgeCall = 0;
    const ctx: Ctx = {
      genChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('методист')) return JSON.stringify(SPEC);
        return '```html\n' + HTML + '\n```';
      }),
      visionChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (!sys.includes('судья качества')) return '{"physicsOk": true, "issues": []}';
        if (judgeCall++ === 0) {
          // намеренно короче числа кандидатов (3): winnerIndex указывает за пределы массива scores
          return JSON.stringify({ winnerIndex: 2, scores: [GOOD], feedback: 'улучшить' });
        }
        return JSON.stringify({ winnerIndex: 0, scores: [GOOD], feedback: '' });
      }),
      render: vi.fn(async () => okRender),
      emit: (e) => events.push(e),
    };
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    expect(getArtifact(meta.id)).toContain('showmehow-runtime');
    // Дискриминация от guard 1: без `?? ZERO_SCORES` minScore(undefined) кидает ВНЕ
    // внутреннего try, попадает во внешний catch, и пайплайн деградирует с предупреждением
    // «Судья недоступен» без рефайна. Проверяем, что этого НЕ произошло:
    expect(getMeta(meta.id).warning ?? '').not.toMatch(/судья недоступен/i);
    // ...и что рефайн реально состоялся: план(1) + 3 кандидата(3) + 1 рефайн(1) = 5
    // (нулевые баллы < порога 8 → круг 1; rescore возвращает GOOD ≥ 8 → стоп).
    expect(ctx.genChat).toHaveBeenCalledTimes(5);
    expect(events.filter((e) => e.type === 'scores')).toHaveLength(2);
  });
});

describe('refineExisting', () => {
  it('updates artifact and keeps history', async () => {
    const meta = createSimulation(
      { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>');
    const { ctx } = fakeCtx();
    await refineExisting(ctx, meta.id, 'сделай медленнее');
    expect(getArtifact(meta.id)).toContain('showmehow-runtime');
    expect(listHistory(meta.id)).toHaveLength(1);
  });
});

describe('MODES', () => {
  it('matches spec', () => {
    expect(MODES.fast).toEqual({ candidates: 1, useJudge: false, maxRefine: 0, threshold: 0 });
    expect(MODES.standard).toEqual({ candidates: 2, useJudge: true, maxRefine: 1, threshold: 0 });
    expect(MODES.max).toEqual({ candidates: 3, useJudge: true, maxRefine: 3, threshold: 8 });
  });
});
