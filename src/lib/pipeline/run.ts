import type {
  PipelineEvent, PipelineStage, PlanSpec, PlanSummary, QualityMode, SimulationMeta,
  CandidateResult, RubricScores, Role,
} from '../types';
import { minScore } from '../types';
import { CANDIDATE_DEFAULTS } from '../candidate-defaults';
import { activeProvider } from '../settings';
import { bindChat, type ChatFn, type UsageInfo } from '../provider';
import { renderArtifact } from '../renderer';
import { createSimulation, saveThumbnail, getArtifact, updateArtifact } from '../storage';
import { extractHtml, findForbiddenUrls, instrument, stripRuntime } from '../artifact';
import { pickExemplar } from '../exemplars';
import { listBundledDemos } from '../demos';
import { REFINER_SYSTEM, STYLE_HINTS, STYLE_NAMES, CDN_WHITELIST } from './prompts';
import { plan, generateCandidate, verifyCandidate, fixArtifact, type Ctx } from './stages';
import { judge, rescore } from './judge';

const ZERO_SCORES: RubricScores = { physics: 0, clarity: 0, interactivity: 0, aesthetics: 0 };
const CDN_ALLOWED = Object.values(CDN_WHITELIST);

export const MODES: Record<QualityMode, {
  candidates: number; useJudge: boolean; maxRefine: number; threshold: number;
}> = {
  fast: { candidates: CANDIDATE_DEFAULTS.fast, useJudge: false, maxRefine: 0, threshold: 0 },
  standard: { candidates: CANDIDATE_DEFAULTS.standard, useJudge: true, maxRefine: 1, threshold: 0 },
  max: { candidates: CANDIDATE_DEFAULTS.max, useJudge: true, maxRefine: 3, threshold: 8 },
};

/** Кооперативная отмена: runPipeline бросает это между этапами, если signal() вернул true. */
export class CancelledError extends Error {
  constructor() {
    super('Отменено пользователем');
    this.name = 'CancelledError';
  }
}

/** Кламп числа кандидатов в [1,5]; отсутствие requested -> дефолт режима. */
export function resolveCandidates(mode: QualityMode, requested?: number): number {
  const n = requested ?? MODES[mode].candidates;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function makeCtx(emit: (e: PipelineEvent) => void): Ctx {
  const p = activeProvider();
  if (!p) throw new Error('Провайдер не настроен. Откройте Настройки.');
  const onUsage = (u: UsageInfo & { role: Role; model: string }) =>
    emit({ type: 'usage', role: u.role, model: u.model,
      promptTokens: u.promptTokens, completionTokens: u.completionTokens, ms: u.ms });
  const chats = new Map<Role, ChatFn>();
  return {
    chat: (role, messages) => {
      if (!chats.has(role)) chats.set(role, bindChat(p, role, onUsage));
      return chats.get(role)!(messages);
    },
    hasVision: !!p.visionModel,
    render: (html) => renderArtifact(html),
    emit,
  };
}

function emitStage(ctx: Ctx, stage: PipelineStage, status: 'start' | 'end'): void {
  ctx.emit({ type: 'stage', stage, status, at: Date.now() });
}

function planSummary(spec: PlanSpec): PlanSummary {
  return {
    title: spec.title,
    subject: spec.subject,
    mode: spec.mode,
    physics: spec.physics,
    parameters: spec.parameters.map((p) => ({ label: p.label, unit: p.unit })),
    goals: spec.learningGoals,
  };
}

export async function runPipeline(
  ctx: Ctx,
  input: { prompt: string; imageDataUrl?: string; mode: QualityMode; candidates?: number },
  signal?: () => boolean,
): Promise<SimulationMeta> {
  function checkCancelled(): void {
    if (signal?.()) throw new CancelledError();
  }

  const mode = MODES[input.mode];
  const count = resolveCandidates(input.mode, input.candidates);
  const warnings: string[] = [];
  if (!ctx.hasVision) {
    warnings.push('Vision-модель не настроена: без визуальной критики и судьи.');
    ctx.emit({ type: 'warning', message: warnings[0] });
  }

  checkCancelled();
  emitStage(ctx, 'planning', 'start');
  const spec = await plan(ctx, input.prompt, input.imageDataUrl);
  emitStage(ctx, 'planning', 'end');
  ctx.emit({ type: 'plan-ready', spec: planSummary(spec) });

  // Ближайшая одобренная демка идёт генератору как эталон уровня проработки.
  const exemplarEntry = pickExemplar(listBundledDemos(), spec);
  const exemplarHtml = exemplarEntry ? exemplarEntry.html : undefined;

  const hints = Array.from({ length: count }, (_, i) => STYLE_HINTS[i % STYLE_HINTS.length]);
  const styleNames = Array.from({ length: count }, (_, i) => STYLE_NAMES[i % STYLE_NAMES.length]);

  emitStage(ctx, 'generating', 'start');
  let candidates: (CandidateResult | null)[];
  try {
    candidates = await Promise.all(
      hints.map(async (hint, index) => {
        checkCancelled();
        const styleName = styleNames[index];
        ctx.emit({ type: 'candidate', index, status: 'generating', styleHint: styleName });
        try {
          const html = await generateCandidate(ctx, spec, hint, exemplarHtml);
          return await verifyCandidate(ctx, spec, html, index, styleName);
        } catch {
          ctx.emit({ type: 'candidate', index, status: 'failed', styleHint: styleName });
          return null;
        }
      }),
    );
  } finally {
    // Отмена (checkCancelled внутри Promise.all-спана) не должна оставлять висящий
    // stage-start: end эмитится всегда, иначе чип таймлайна пульсировал бы вечно.
    emitStage(ctx, 'generating', 'end');
  }

  const alive: CandidateResult[] = [];
  const aliveIndices: number[] = [];
  candidates.forEach((c, i) => {
    if (c && c.alive) { alive.push(c); aliveIndices.push(i); }
  });
  let best: CandidateResult;
  let bestOrigIndex = 0;
  let feedback = '';

  if (alive.length === 0) {
    const brokenCandidates = candidates.filter((c): c is CandidateResult => !!c);
    if (brokenCandidates.length === 0) {
      throw new Error('Не удалось сгенерировать ни одного кандидата.');
    }
    // Заражённая CDN-артефактом версия не может уйти в библиотеку даже как best-effort —
    // среди сломанных кандидатов предпочитаем чистого; если чистых нет, отказываемся сохранять.
    const clean = brokenCandidates.find(
      (c) => findForbiddenUrls(c.html, CDN_ALLOWED).length === 0,
    );
    if (!clean) throw new Error('Все кандидаты содержат запрещённые внешние ресурсы.');
    const msg = 'Все кандидаты завершились с ошибками — сохранён лучший как есть.';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
    best = clean;
  } else if (mode.useJudge && ctx.hasVision && alive.length > 0) {
    checkCancelled();
    emitStage(ctx, 'judging', 'start');
    let verdict = null;
    try {
      verdict = await judge(ctx, spec, alive);
    } catch {
      verdict = null; // судья недоступен/вернул мусор — деградируем ниже
    }
    emitStage(ctx, 'judging', 'end');

    if (!verdict) {
      // судья недоступен ещё до первого вердикта — деградируем на первого живого кандидата,
      // не теряя уже сгенерированные (и отрендеренные) варианты.
      const msg = 'Судья недоступен — выбран первый кандидат.';
      warnings.push(msg);
      ctx.emit({ type: 'warning', message: msg });
      best = alive[0];
    } else {
      ctx.emit({
        type: 'judge-verdict', scores: verdict.scores, winnerIndex: verdict.winnerIndex,
        candidateIndices: aliveIndices, feedback: verdict.feedback,
      });
      best = alive[verdict.winnerIndex];
      bestOrigIndex = aliveIndices[verdict.winnerIndex] ?? aliveIndices[0];
      feedback = verdict.feedback;
      // judge может вернуть массив scores короче числа кандидатов (сломанный JSON от модели);
      // подстраховываемся нулевым объектом, чтобы minScore() ниже не упал на undefined.
      let current = verdict.scores[verdict.winnerIndex] ?? { ...ZERO_SCORES };

      if (mode.maxRefine > 0) {
        emitStage(ctx, 'refining', 'start');
        // finally: отмена (checkCancelled перед кругом или проброшенный CancelledError
        // из круга) не должна оставлять висящий refining-start без end.
        try {
          for (let round = 0; round < mode.maxRefine; round++) {
            const belowThreshold = mode.threshold > 0 && minScore(current) < mode.threshold;
            const firstStandardRound = mode.threshold === 0 && round === 0 && !!feedback;
            if (!belowThreshold && !firstStandardRound) break;
            checkCancelled();
            const before = current;
            try {
              const refined = await refineHtml(ctx, best.html, feedback);
              // Индекс — оригинальный индекс победителя: candidate/screenshot-события
              // доводки должны обновлять КАРТОЧКУ победителя в UI, а не кандидата 0.
              const verified = await verifyCandidate(
                ctx, spec, refined, bestOrigIndex, styleNames[bestOrigIndex] ?? styleNames[0],
              );
              if (!verified.alive) {
                // доводка сломала — оставляем предыдущее
                ctx.emit({ type: 'refine-round', round: round + 1, before, after: null });
                break;
              }
              const re = await rescore(ctx, spec, verified);
              best = verified;
              current = re.scores;
              feedback = re.feedback;
              ctx.emit({ type: 'refine-round', round: round + 1, before, after: current });
            } catch (e) {
              if (e instanceof CancelledError) throw e;
              // рефайн или пересуд упал (например, судья вернул не-JSON) — не валим пайплайн,
              // просто останавливаемся на текущем лучшем кандидате.
              ctx.emit({ type: 'refine-round', round: round + 1, before, after: null });
              break;
            }
          }
        } finally {
          emitStage(ctx, 'refining', 'end');
        }
      }
    }
  } else {
    best = alive[0];
  }

  if (!best.render.animated) {
    const msg = 'Анимация может быть статичной';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
  }

  checkCancelled();
  emitStage(ctx, 'saving', 'start');
  const meta = createSimulation({
    title: spec.title, prompt: input.prompt, subject: spec.subject,
    tags: spec.learningGoals.slice(0, 3),
    warning: warnings.length ? warnings.join(' ') : undefined,
  }, best.html);
  const shot = best.render.screenshots[1] ?? best.render.screenshots[0];
  if (shot) saveThumbnail(meta.id, shot);
  emitStage(ctx, 'saving', 'end');
  ctx.emit({ type: 'done', simulationId: meta.id });
  return meta;
}

async function refineHtml(ctx: Ctx, html: string, feedback: string): Promise<string> {
  const base = stripRuntime(html);
  const out = await ctx.chat('refiner', [
    { role: 'system', content: REFINER_SYSTEM },
    { role: 'user', content: `Замечания:\n${feedback}\n\nHTML:\n\`\`\`html\n${base}\n\`\`\`` },
  ]);
  return instrument(extractHtml(out));
}

export async function refineExisting(ctx: Ctx, id: string, instruction: string): Promise<void> {
  const html = getArtifact(id);
  emitStage(ctx, 'refining', 'start');
  try {
    let refined = await refineHtml(ctx, html, instruction);
    let report = await ctx.render(refined);
    let forbidden = findForbiddenUrls(refined, CDN_ALLOWED);
    for (let attempt = 0; (!report.ok || forbidden.length > 0) && attempt < 2; attempt++) {
      const errors = [...report.errors];
      if (forbidden.length) errors.push(`Запрещённые внешние ресурсы: ${forbidden.join(', ')}`);
      refined = await fixArtifact(ctx, refined, errors);
      report = await ctx.render(refined);
      forbidden = findForbiddenUrls(refined, CDN_ALLOWED);
    }
    if (!report.ok) throw new Error('Правка сломала симуляцию: ' + report.errors.join('; '));
    if (forbidden.length > 0) {
      throw new Error('Правка внесла запрещённые внешние ресурсы: ' + forbidden.join(', '));
    }
    updateArtifact(id, refined);
    const shot = report.screenshots[1] ?? report.screenshots[0];
    if (shot) saveThumbnail(id, shot);
  } finally {
    emitStage(ctx, 'refining', 'end');
  }
  ctx.emit({ type: 'done', simulationId: id });
}
