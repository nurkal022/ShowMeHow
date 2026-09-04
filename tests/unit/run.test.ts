import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline, refineExisting, MODES, resolveCandidates, CancelledError } from '@/lib/pipeline/run';
import type { Ctx } from '@/lib/pipeline/stages';
import { getArtifact, getMeta, listHistory, createSimulation } from '@/lib/storage';
import type { ChatMessage } from '@/lib/provider';
import type { PipelineEvent, RenderReport, Role } from '@/lib/types';
import { STYLE_NAMES } from '@/lib/pipeline/prompts';

const SPEC = { title: 'Маятник', subject: 'Физика', mode: '2d', learningGoals: ['x'],
  physics: 'F=ma', parameters: [], visualPlan: 'v' };
const HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas></body></html>';
const okRender: RenderReport = { ok: true, errors: [], animated: true,
  screenshots: [Buffer.from('png')] };
const GOOD = { physics: 9, clarity: 9, interactivity: 9, aesthetics: 9 };
const WEAK = { physics: 6, clarity: 9, interactivity: 9, aesthetics: 9 };

/** Роли, не идущие через vision-модель — соответствуют старому "genChat". */
const TEXT_ROLES: Role[] = ['planner', 'generator', 'fixer', 'refiner'];

function fakeCtx(opts: { firstScores?: object; renders?: RenderReport[] } = {}): {
  ctx: Ctx; events: PipelineEvent[];
} {
  const events: PipelineEvent[] = [];
  let judgeCall = 0;
  const renders = opts.renders;
  const chat = vi.fn(async (role: Role, msgs: ChatMessage[]) => {
    if (role === 'planner') return JSON.stringify(SPEC);
    if (role === 'critic') return '{"physicsOk": true, "issues": []}';
    if (role === 'judge') {
      // судья: первый вызов — заданные баллы, дальше — хорошие
      const s = judgeCall++ === 0 ? (opts.firstScores ?? GOOD) : GOOD;
      const user = JSON.stringify(msgs[1].content);
      const n = (user.match(/Кандидат /g) ?? ['x']).length;
      return JSON.stringify({ winnerIndex: 0,
        scores: Array.from({ length: n }, () => s), feedback: 'улучшить' });
    }
    return '```html\n' + HTML + '\n```'; // generator/fixer/refiner
  });
  const ctx: Ctx = {
    chat,
    hasVision: true,
    render: vi.fn(async () => renders ? renders.shift() ?? okRender : okRender),
    emit: (e) => events.push(e),
  };
  return { ctx, events };
}

function callsByRole(chat: unknown, role: Role) {
  return (chat as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === role);
}

function textCalls(chat: unknown) {
  return (chat as ReturnType<typeof vi.fn>).mock.calls.filter((c) => TEXT_ROLES.includes(c[0]));
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
    expect(callsByRole(ctx.chat, 'critic')).toHaveLength(1); // только критик, судьи нет
    expect(callsByRole(ctx.chat, 'judge')).toHaveLength(0);
    expect(events.at(-1)).toEqual({ type: 'done', simulationId: meta.id });
  });

  it('max mode: refines until threshold met', async () => {
    const { ctx, events } = fakeCtx({ firstScores: WEAK }); // первый суд: physics=6 < 8
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    // текстовые роли: план + 3 кандидата + 1 рефайн = 5
    expect(textCalls(ctx.chat)).toHaveLength(5);
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
    expect(callsByRole(ctx.chat, 'judge')).toHaveLength(0); // суд так и не был вызван
  });

  it('CancelledError: cancel during candidate generation still emits generating stage end', async () => {
    const { ctx, events } = fakeCtx();
    // Сигнал становится true ИЗНУТРИ генерации: первый вызов генератора взводит флаг,
    // так что checkCancelled следующего кандидата (внутри Promise.all-спана) бросает.
    let generatorCalled = false;
    const origChat = ctx.chat;
    ctx.chat = vi.fn(async (role: Role, msgs: ChatMessage[]) => {
      if (role === 'generator') generatorCalled = true;
      return origChat(role, msgs);
    });
    await expect(runPipeline(ctx, { prompt: 'маятник', mode: 'standard' }, () => generatorCalled))
      .rejects.toThrow(CancelledError);
    // start не должен остаться висящим: end обязателен даже при отмене посреди этапа
    expect(events).toContainEqual(
      { type: 'stage', stage: 'generating', status: 'start', at: expect.any(Number) });
    expect(events).toContainEqual(
      { type: 'stage', stage: 'generating', status: 'end', at: expect.any(Number) });
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('CancelledError: cancel before a refine round still emits refining stage end', async () => {
    const { ctx, events } = fakeCtx();
    // Судья отработал (feedback непустой → standard пойдёт в круг доводки),
    // сигнал становится true сразу после judge-verdict — отмена ловится
    // проверкой перед кругом, уже ВНУТРИ refining-спана (после start).
    const signal = () => events.some((e) => e.type === 'judge-verdict');
    await expect(runPipeline(ctx, { prompt: 'маятник', mode: 'standard' }, signal))
      .rejects.toThrow(CancelledError);
    expect(events).toContainEqual(
      { type: 'stage', stage: 'refining', status: 'start', at: expect.any(Number) });
    expect(events).toContainEqual(
      { type: 'stage', stage: 'refining', status: 'end', at: expect.any(Number) });
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('judge-verdict event maps alive positions to original candidate indices '
    + 'when the middle candidate dies', async () => {
    const events: PipelineEvent[] = [];
    const dead = '```html\n<html><body>DEADCAND</body></html>\n```';
    const badRender: RenderReport = { ok: false, errors: ['err'], animated: false, screenshots: [] };
    const chat = vi.fn(async (role: Role, msgs: ChatMessage[]) => {
      if (role === 'planner') return JSON.stringify(SPEC);
      if (role === 'critic') return '{"physicsOk": true, "issues": []}';
      if (role === 'judge') {
        return JSON.stringify({ winnerIndex: 0, scores: [GOOD, GOOD], feedback: '' });
      }
      if (role === 'generator') {
        const sys = String(msgs[0].content);
        if (sys.includes('НАГЛЯДНОСТЬ')) return dead; // второй style hint → всегда мёртвый кандидат
        return '```html\n' + HTML + '\n```';
      }
      // fixer тоже не спасает
      const user = String(msgs[1]?.content ?? '');
      if (user.includes('DEADCAND')) return dead;
      return '```html\n' + HTML + '\n```';
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
      render: vi.fn(async (html: string) => (html.includes('DEADCAND') ? badRender : okRender)),
      emit: (e) => events.push(e),
    };
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    const verdictEvent = events.find((e) => e.type === 'judge-verdict');
    expect(verdictEvent).toMatchObject({ candidateIndices: [0, 2] });
  });

  it('refine-phase candidate/screenshot events carry the winner\'s ORIGINAL index '
    + '(dead middle candidate, winner orig-index 2)', async () => {
    const events: PipelineEvent[] = [];
    const dead = '```html\n<html><body>DEADCAND</body></html>\n```';
    const badRender: RenderReport = { ok: false, errors: ['err'], animated: false, screenshots: [] };
    let judgeCall = 0;
    const chat = vi.fn(async (role: Role, msgs: ChatMessage[]) => {
      if (role === 'planner') return JSON.stringify(SPEC);
      if (role === 'critic') return '{"physicsOk": true, "issues": []}';
      if (role === 'judge') {
        // Первый суд: живые [0, 2]; winnerIndex 1 → оригинальный индекс 2; слабые баллы
        // у победителя запускают доводку. Пересуд (rescore) возвращает GOOD — стоп.
        if (judgeCall++ === 0) {
          return JSON.stringify({ winnerIndex: 1, scores: [GOOD, WEAK], feedback: 'улучшить' });
        }
        return JSON.stringify({ winnerIndex: 0, scores: [GOOD], feedback: '' });
      }
      if (role === 'generator') {
        const sys = String(msgs[0].content);
        if (sys.includes('НАГЛЯДНОСТЬ')) return dead; // средний кандидат (1) — мёртвый
        return '```html\n' + HTML + '\n```';
      }
      // fixer не спасает
      const user = String(msgs[1]?.content ?? '');
      if (user.includes('DEADCAND')) return dead;
      return '```html\n' + HTML + '\n```';
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
      render: vi.fn(async (html: string) => (html.includes('DEADCAND') ? badRender : okRender)),
      emit: (e) => events.push(e),
    };
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    expect(events.filter((e) => e.type === 'refine-round')).toHaveLength(1);
    // все candidate/screenshot-события ПОСЛЕ старта доводки — про карточку победителя (2),
    // а не про кандидата 0: иначе UI перерисовывал бы чужую карточку.
    const refineStart = events.findIndex(
      (e) => e.type === 'stage' && e.stage === 'refining' && e.status === 'start');
    expect(refineStart).toBeGreaterThan(-1);
    const refinePhase = events.slice(refineStart)
      .filter((e) => e.type === 'candidate' || e.type === 'screenshot');
    expect(refinePhase.length).toBeGreaterThan(0);
    for (const e of refinePhase) expect(e).toMatchObject({ index: 2 });
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
    ctx.hasVision = false;
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'standard' });
    expect(getMeta(meta.id).warning).toMatch(/vision/i);
    expect(events.some((e) => e.type === 'warning')).toBe(true);
  });

  // --- Guard: judge/rescore must never crash the whole pipeline ---

  it('guard: judge returns malformed JSON -> falls back to first candidate with warning', async () => {
    const events: PipelineEvent[] = [];
    const chat = vi.fn(async (role: Role) => {
      if (role === 'planner') return JSON.stringify(SPEC);
      if (role === 'judge') return 'это не JSON, а обычный текст без скобок';
      if (role === 'critic') return '{"physicsOk": true, "issues": []}';
      return '```html\n' + HTML + '\n```';
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
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
    const chat = vi.fn(async (role: Role, msgs: ChatMessage[]) => {
      if (role === 'planner') return JSON.stringify(SPEC);
      if (role === 'critic') return '{"physicsOk": true, "issues": []}';
      if (role === 'fixer') {
        // фиксер: возвращаем html как есть (заражённость/чистота сохраняется, рендер по-прежнему падает)
        const user = String(msgs[1]?.content ?? '');
        const m = user.match(/```html\n([\s\S]*?)\n```/);
        return '```html\n' + (m ? m[1] : HTML) + '\n```';
      }
      const sys = String(msgs[0].content);
      if (sys.includes('НАГЛЯДНОСТЬ')) return '```html\n' + HTML + '\n```'; // кандидат 1: чистый
      return '```html\n' + TAINTED_HTML + '\n```'; // кандидат 0: заражённый
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
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
    const chat = vi.fn(async (role: Role, msgs: ChatMessage[]) => {
      if (role === 'planner') return JSON.stringify(SPEC);
      if (role === 'critic') return '{"physicsOk": true, "issues": []}';
      if (role === 'fixer') {
        const user = String(msgs[1]?.content ?? '');
        const m = user.match(/```html\n([\s\S]*?)\n```/);
        return '```html\n' + (m ? m[1] : TAINTED_HTML) + '\n```';
      }
      return '```html\n' + TAINTED_HTML + '\n```';
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
      render: vi.fn(async () => badRender),
      emit: () => {},
    };
    await expect(runPipeline(ctx, { prompt: 'маятник', mode: 'standard' }))
      .rejects.toThrow(/запрещённые внешние ресурсы/i);
  });

  it('guard: scores array shorter than candidates does not crash', async () => {
    const events: PipelineEvent[] = [];
    let judgeCall = 0;
    const chat = vi.fn(async (role: Role) => {
      if (role === 'planner') return JSON.stringify(SPEC);
      if (role === 'critic') return '{"physicsOk": true, "issues": []}';
      if (role === 'judge') {
        if (judgeCall++ === 0) {
          // намеренно короче числа кандидатов (3): winnerIndex указывает за пределы массива scores
          return JSON.stringify({ winnerIndex: 2, scores: [GOOD], feedback: 'улучшить' });
        }
        return JSON.stringify({ winnerIndex: 0, scores: [GOOD], feedback: '' });
      }
      return '```html\n' + HTML + '\n```';
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
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
    expect(textCalls(chat)).toHaveLength(5);
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
    const chat = vi.fn(async (role: Role) => {
      if (role === 'refiner') return '```html\n' + TAINTED + '\n```';
      if (role === 'fixer') return '```html\n' + HTML + '\n```'; // фиксер вычищает CDN
      return '```html\n' + HTML + '\n```';
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
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
    const chat = vi.fn(async (role: Role) => {
      if (role === 'refiner') return '```html\n' + TAINTED + '\n```';
      return '```html\n' + TAINTED + '\n```'; // фиксер не спасает — остаётся заражённым
    });
    const ctx: Ctx = {
      chat,
      hasVision: true,
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
