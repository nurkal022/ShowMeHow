import type {
  PipelineEvent, PipelineStage, PlanSpec, PlanSummary, QualityMode, SimulationMeta,
  CandidateResult, RubricScores, Role,
} from '../types';
import { minScore } from '../types';
import { activeProvider, NO_PROVIDER_MESSAGE } from '../settings';
import { bindChat, type ChatFn, type UsageInfo } from '../provider';
import { renderArtifact } from '../renderer';
import { createSimulation, saveThumbnail, getArtifact, updateArtifact } from '../storage';
import { extractHtml, findForbiddenUrls, instrument, stripRuntime } from '../artifact';
import { pickExemplar } from '../exemplars';
import { listBundledDemos } from '../demos';
import { REFINER_SYSTEM, CDN_WHITELIST } from './prompts';
import { plan, generateCandidate, verifyCandidate, fixArtifact, type Ctx } from './stages';
import { judge, rescore } from './judge';

const ZERO_SCORES: RubricScores = { physics: 0, clarity: 0, interactivity: 0, aesthetics: 0 };
const CDN_ALLOWED = Object.values(CDN_WHITELIST);

/**
 * Режим задаёт глубину полировки, а не число вариантов: кандидат всегда один.
 * Перебор акцентов был механизмом разнообразия, но хорошая учебная симуляция
 * обязана быть точной, наглядной и интерактивной одновременно — теперь этого
 * требуют от единственного кандидата сразу (см. GENERATION_RULES).
 */
export const MODES: Record<QualityMode, {
  useJudge: boolean; maxRefine: number; threshold: number;
}> = {
  fast: { useJudge: false, maxRefine: 0, threshold: 0 },
  standard: { useJudge: true, maxRefine: 1, threshold: 0 },
  max: { useJudge: true, maxRefine: 3, threshold: 8 },
};

/** Кооперативная отмена: runPipeline бросает это между этапами, если signal() вернул true. */
export class CancelledError extends Error {
  constructor() {
    super('Отменено пользователем');
    this.name = 'CancelledError';
  }
}

export function makeCtx(emit: (e: PipelineEvent) => void): Ctx {
  const p = activeProvider();
  if (!p) throw new Error(NO_PROVIDER_MESSAGE);
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
  input: { prompt: string; imageDataUrl?: string; mode: QualityMode },
  signal?: () => boolean,
): Promise<SimulationMeta> {
  function checkCancelled(): void {
    if (signal?.()) throw new CancelledError();
  }

  const mode = MODES[input.mode];
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

  emitStage(ctx, 'generating', 'start');
  let candidate: CandidateResult | null = null;
  try {
    checkCancelled();
    ctx.emit({ type: 'candidate', index: 0, status: 'generating' });
    try {
      const html = await generateCandidate(ctx, spec, exemplarHtml);
      candidate = await verifyCandidate(ctx, spec, html, 0);
    } catch {
      ctx.emit({ type: 'candidate', index: 0, status: 'failed' });
      candidate = null;
    }
  } finally {
    // Отмена не должна оставить висящий stage-start: без end чип таймлайна
    // пульсировал бы вечно.
    emitStage(ctx, 'generating', 'end');
  }

  let best: CandidateResult;
  let feedback = '';

  if (!candidate || !candidate.alive) {
    // Кандидат один: подстраховки «возьмём другого» больше нет. Сломанный
    // сохраняем best-effort, но заражённый запрещённым CDN — никогда.
    if (!candidate) throw new Error('Не удалось сгенерировать кандидата.');
    if (findForbiddenUrls(candidate.html, CDN_ALLOWED).length > 0) {
      throw new Error('Кандидат содержит запрещённые внешние ресурсы.');
    }
    const msg = 'Кандидат завершился с ошибками — сохранён как есть.';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
    best = candidate;
  } else if (mode.useJudge && ctx.hasVision) {
    checkCancelled();
    emitStage(ctx, 'judging', 'start');
    let verdict = null;
    try {
      verdict = await judge(ctx, spec, [candidate]);
    } catch {
      verdict = null; // судья недоступен/вернул мусор — деградируем ниже
    }
    emitStage(ctx, 'judging', 'end');

    if (!verdict) {
      // судья недоступен ещё до первого вердикта — деградируем на единственного кандидата,
      // не теряя уже сгенерированный (и отрендеренный) вариант.
      const msg = 'Судья недоступен — выбран первый кандидат.';
      warnings.push(msg);
      ctx.emit({ type: 'warning', message: msg });
      best = candidate;
    } else {
      ctx.emit({
        type: 'judge-verdict', scores: verdict.scores, winnerIndex: verdict.winnerIndex,
        candidateIndices: [0], feedback: verdict.feedback,
      });
      best = candidate;
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
              const verified = await verifyCandidate(ctx, spec, refined, 0);
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
    best = candidate;
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
