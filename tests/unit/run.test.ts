import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline, refineExisting, MODES, resolveCandidates, CancelledError } from '@/lib/pipeline/run';
import type { Ctx } from '@/lib/pipeline/stages';
import { getArtifact, getMeta, listHistory, createSimulation } from '@/lib/storage';
import type { PipelineEvent, RenderReport } from '@/lib/types';
import { STYLE_NAMES } from '@/lib/pipeline/prompts';

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
    const { ctx, events } = fakeCtx({ firstScores: WEAK }); // первый суд: physics=6 < 8
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    // genChat: план + 3 кандидата + 1 рефайн = 5
    expect(ctx.genChat).toHaveBeenCalledTimes(5);
    const judgeEvents = events.filter((e) => e.type === 'judge-verdict');
    // единственный judge-verdict — от начального суда, маппит все три исходных индекса
    expect(judgeEvents).toHaveLength(1);
    expect(judgeEvents[0]).toMatchObject({ candidateIndices: [0, 1, 2], feedback: 'улучшить' });
    // рефайн-раунд несёт before/after вместо повторного judge-verdict
    const refineEvents = events.filter((e) => e.type === 'refine-round');
    expect(refineEvents).toHaveLength(1);
    expect(refineEvents[0]).toMatchObject({ round: 1, before: WEAK, after: GOOD });
  });

  it('emits plan-ready with a PlanSummary derived from the plan spec', async () => {
    const { ctx, events } = fakeCtx();
    await runPipeline(ctx, { prompt: 'маятник', mode: 'fast' });
    const planReady = events.find((e) => e.type === 'plan-ready');
    expect(planReady).toMatchObject({
      type: 'plan-ready',
      spec: {
        title: 'Маятник', subject: 'Физика', mode: '2d', physics: 'F=ma',
        goals: ['x'], parameters: [],
      },
    });
  });

  it('candidates=5: generates 5 candidates, styleHints cycled from STYLE_NAMES', async () => {
    const { ctx, events } = fakeCtx();
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max', candidates: 5 });
    const genEvents = events.filter(
      (e): e is Extract<PipelineEvent, { type: 'candidate' }> =>
        e.type === 'candidate' && e.status === 'generating',
    );
    expect(genEvents).toHaveLength(5);
    expect(genEvents.map((e) => e.styleHint)).toEqual(STYLE_NAMES);
  });

  it('CancelledError: signal true right before judging aborts, nothing saved', async () => {
    const { ctx, events } = fakeCtx();
    // сигнал становится true ровно к моменту проверки "перед судом" (сразу после
    // конца этапа generating), но не раньше — план и кандидаты успевают отработать.
    const signal = () => events.some(
      (e) => e.type === 'stage' && e.stage === 'generating' && e.status === 'end',
    );
    await expect(runPipeline(ctx, { prompt: 'маятник', mode: 'standard' }, signal))
      .rejects.toThrow(CancelledError);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    const judgeCalls = (ctx.visionChat as ReturnType<typeof vi.fn>).mock.calls
      .filter(([msgs]) => String(msgs[0].content).includes('судья качества'));
    expect(judgeCalls).toHaveLength(0); // суд так и не был вызван
  });

  it('judge-verdict event maps alive positions to original candidate indices '
    + 'when the middle candidate dies', async () => {
    const events: PipelineEvent[] = [];
    const dead = '```html\n<html><body>DEADCAND</body></html>\n```';
    const badRender: RenderReport = { ok: false, errors: ['err'], animated: false, screenshots: [] };
    const ctx: Ctx = {
      genChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('методист')) return JSON.stringify(SPEC);
        if (sys.includes('НАГЛЯДНОСТЬ')) return dead; // второй style hint → всегда мёртвый кандидат
        const user = String(msgs[1]?.content ?? '');
        if (user.includes('DEADCAND')) return dead; // фиксер тоже не спасает
        return '```html\n' + HTML + '\n```';
      }),
      visionChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (!sys.includes('судья качества')) return '{"physicsOk": true, "issues": []}';
        return JSON.stringify({ winnerIndex: 0, scores: [GOOD, GOOD], feedback: '' });
      }),
      render: vi.fn(async (html: string) => (html.includes('DEADCAND') ? badRender : okRender)),
      emit: (e) => events.push(e),
    };
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    const verdictEvent = events.find((e) => e.type === 'judge-verdict');
    expect(verdictEvent).toMatchObject({ candidateIndices: [0, 2] });
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

  it('all candidates broken: prefers a non-tainted broken candidate over a CDN-tainted one', async () => {
    const badRender: RenderReport = { ok: false, errors: ['err'], animated: false, screenshots: [] };
    const TAINTED_HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas>'
      + '<script src="https://evil.example.com/bad.js"></script></body></html>';
    const events: PipelineEvent[] = [];
    const ctx: Ctx = {
      genChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('методист')) return JSON.stringify(SPEC);
        if (sys.includes('чинишь')) {
          // фиксер: возвращаем html как есть (заражённость/чистота сохраняется, рендер по-прежнему падает)
          const user = String(msgs[1]?.content ?? '');
          const m = user.match(/```html\n([\s\S]*?)\n```/);
          return '```html\n' + (m ? m[1] : HTML) + '\n```';
        }
        if (sys.includes('НАГЛЯДНОСТЬ')) return '```html\n' + HTML + '\n```'; // кандидат 1: чистый
        return '```html\n' + TAINTED_HTML + '\n```'; // кандидат 0: заражённый
      }),
      visionChat: vi.fn(async () => '{"physicsOk": true, "issues": []}'),
      render: vi.fn(async () => badRender),
      emit: (e) => events.push(e),
    };
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'standard' });
    expect(getArtifact(meta.id)).not.toContain('evil.example.com');
    expect(getMeta(meta.id).warning).toMatch(/ошибк/i);
  });

  it('all candidates broken and all CDN-tainted: rejects instead of saving a tainted artifact', async () => {
    const badRender: RenderReport = { ok: false, errors: ['err'], animated: false, screenshots: [] };
    const TAINTED_HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas>'
      + '<script src="https://evil.example.com/bad.js"></script></body></html>';
    const ctx: Ctx = {
      genChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('методист')) return JSON.stringify(SPEC);
        if (sys.includes('чинишь')) {
          const user = String(msgs[1]?.content ?? '');
          const m = user.match(/```html\n([\s\S]*?)\n```/);
          return '```html\n' + (m ? m[1] : TAINTED_HTML) + '\n```';
        }
        return '```html\n' + TAINTED_HTML + '\n```';
      }),
      visionChat: vi.fn(async () => '{"physicsOk": true, "issues": []}'),
      render: vi.fn(async () => badRender),
      emit: () => {},
    };
    await expect(runPipeline(ctx, { prompt: 'маятник', mode: 'standard' }))
      .rejects.toThrow(/запрещённые внешние ресурсы/i);
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
    // 1 начальный judge-verdict + 1 refine-round (не повторный judge-verdict)
    expect(events.filter((e) => e.type === 'judge-verdict')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'refine-round')).toHaveLength(1);
  });
});

describe('resolveCandidates', () => {
  it('clamps 0 up to 1', () => {
    expect(resolveCandidates('fast', 0)).toBe(1);
  });

  it('clamps 9 down to 5', () => {
    expect(resolveCandidates('fast', 9)).toBe(5);
  });

  it('undefined falls back to the mode default', () => {
    expect(resolveCandidates('fast')).toBe(1);
    expect(resolveCandidates('standard')).toBe(2);
    expect(resolveCandidates('max')).toBe(3);
  });

  it('passes through valid values unchanged', () => {
    expect(resolveCandidates('max', 4)).toBe(4);
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

  it('scans refined html for forbidden CDN urls: fixer cleans it -> artifact updated', async () => {
    const meta = createSimulation(
      { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>');
    const TAINTED = '<!DOCTYPE html><html><head></head><body><canvas></canvas>'
      + '<script src="https://evil.example.com/bad.js"></script></body></html>';
    const ctx: Ctx = {
      genChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('улучшаешь')) return '```html\n' + TAINTED + '\n```';
        if (sys.includes('чинишь')) return '```html\n' + HTML + '\n```'; // фиксер вычищает CDN
        return '```html\n' + HTML + '\n```';
      }),
      visionChat: vi.fn(async () => '{"physicsOk": true, "issues": []}'),
      render: vi.fn(async () => okRender),
      emit: () => {},
    };
    await refineExisting(ctx, meta.id, 'сделай медленнее');
    expect(getArtifact(meta.id)).not.toContain('evil.example.com');
  });

  it('scans refined html for forbidden CDN urls: fixer fails to clean -> rejects, artifact unchanged', async () => {
    const meta = createSimulation(
      { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>');
    const TAINTED = '<!DOCTYPE html><html><head></head><body><canvas></canvas>'
      + '<script src="https://evil.example.com/bad.js"></script></body></html>';
    const ctx: Ctx = {
      genChat: vi.fn(async (msgs) => {
        const sys = String(msgs[0].content);
        if (sys.includes('улучшаешь')) return '```html\n' + TAINTED + '\n```';
        return '```html\n' + TAINTED + '\n```'; // фиксер не спасает — остаётся заражённым
      }),
      visionChat: vi.fn(async () => '{"physicsOk": true, "issues": []}'),
      render: vi.fn(async () => okRender),
      emit: () => {},
    };
    await expect(refineExisting(ctx, meta.id, 'сделай медленнее'))
      .rejects.toThrow(/запрещённые внешние ресурсы/i);
    expect(getArtifact(meta.id)).toBe('<html>old</html>');
  });
});

describe('MODES', () => {
  it('matches spec', () => {
    expect(MODES.fast).toEqual({ candidates: 1, useJudge: false, maxRefine: 0, threshold: 0 });
    expect(MODES.standard).toEqual({ candidates: 2, useJudge: true, maxRefine: 1, threshold: 0 });
    expect(MODES.max).toEqual({ candidates: 3, useJudge: true, maxRefine: 3, threshold: 8 });
  });
});
