import type {
  PipelineEvent, QualityMode, SimulationMeta, CandidateResult, RubricScores,
} from '../types';
import { minScore } from '../types';
import { activeProvider } from '../settings';
import { bindChat } from '../provider';
import { renderArtifact } from '../renderer';
import { createSimulation, saveThumbnail, getArtifact, updateArtifact } from '../storage';
import { extractHtml, instrument } from '../artifact';
import { REFINER_SYSTEM, STYLE_HINTS } from './prompts';
import { plan, generateCandidate, verifyCandidate, fixArtifact, type Ctx } from './stages';
import { judge, rescore } from './judge';

const ZERO_SCORES: RubricScores = { physics: 0, clarity: 0, interactivity: 0, aesthetics: 0 };

export const MODES: Record<QualityMode, {
  candidates: number; useJudge: boolean; maxRefine: number; threshold: number;
}> = {
  fast: { candidates: 1, useJudge: false, maxRefine: 0, threshold: 0 },
  standard: { candidates: 2, useJudge: true, maxRefine: 1, threshold: 0 },
  max: { candidates: 3, useJudge: true, maxRefine: 3, threshold: 8 },
};

export function makeCtx(emit: (e: PipelineEvent) => void): Ctx {
  const p = activeProvider();
  if (!p) throw new Error('Провайдер не настроен. Откройте Настройки.');
  return {
    genChat: bindChat(p, p.generationModel),
    visionChat: p.visionModel ? bindChat(p, p.visionModel) : null,
    render: (html) => renderArtifact(html),
    emit,
  };
}

export async function runPipeline(
  ctx: Ctx,
  input: { prompt: string; imageDataUrl?: string; mode: QualityMode },
): Promise<SimulationMeta> {
  const mode = MODES[input.mode];
  const warnings: string[] = [];
  if (!ctx.visionChat) {
    warnings.push('Vision-модель не настроена: без визуальной критики и судьи.');
    ctx.emit({ type: 'warning', message: warnings[0] });
  }

  ctx.emit({ type: 'stage', stage: 'planning' });
  const spec = await plan(ctx, input.prompt, input.imageDataUrl);

  ctx.emit({ type: 'stage', stage: 'generating', detail: `${mode.candidates} кандидата(ов)` });
  const candidates = await Promise.all(
    STYLE_HINTS.slice(0, mode.candidates).map(async (hint, index) => {
      ctx.emit({ type: 'candidate', index, status: 'generating' });
      try {
        const html = await generateCandidate(ctx, spec, hint);
        return await verifyCandidate(ctx, spec, html, index);
      } catch {
        ctx.emit({ type: 'candidate', index, status: 'failed' });
        return null;
      }
    }),
  );

  const alive: CandidateResult[] = [];
  const aliveIndices: number[] = [];
  candidates.forEach((c, i) => {
    if (c && c.alive) { alive.push(c); aliveIndices.push(i); }
  });
  let best: CandidateResult;
  let bestOrigIndex = 0;
  let feedback = '';

  if (alive.length === 0) {
    const broken = candidates.find((c) => !!c);
    if (!broken) throw new Error('Не удалось сгенерировать ни одного кандидата.');
    const msg = 'Все кандидаты завершились с ошибками — сохранён лучший как есть.';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
    best = broken;
  } else if (mode.useJudge && ctx.visionChat && alive.length > 0) {
    ctx.emit({ type: 'stage', stage: 'judging' });
    try {
      const verdict = await judge(ctx, spec, alive);
      ctx.emit({
        type: 'scores', scores: verdict.scores, winnerIndex: verdict.winnerIndex,
        candidateIndices: aliveIndices,
      });
      best = alive[verdict.winnerIndex];
      bestOrigIndex = aliveIndices[verdict.winnerIndex] ?? aliveIndices[0];
      feedback = verdict.feedback;
      // judge может вернуть массив scores короче числа кандидатов (сломанный JSON от модели);
      // подстраховываемся нулевым объектом, чтобы minScore() ниже не упал на undefined.
      let current = verdict.scores[verdict.winnerIndex] ?? { ...ZERO_SCORES };

      for (let round = 0; round < mode.maxRefine; round++) {
        const belowThreshold = mode.threshold > 0 && minScore(current) < mode.threshold;
        const firstStandardRound = mode.threshold === 0 && round === 0 && !!feedback;
        if (!belowThreshold && !firstStandardRound) break;
        ctx.emit({ type: 'stage', stage: 'refining', detail: `круг ${round + 1}` });
        try {
          const refined = await refineHtml(ctx, best.html, feedback);
          const verified = await verifyCandidate(ctx, spec, refined, 0);
          if (!verified.alive) break; // доводка сломала — оставляем предыдущее
          const re = await rescore(ctx, spec, verified);
          best = verified;
          current = re.scores;
          feedback = re.feedback;
          ctx.emit({
            type: 'scores', scores: [re.scores], winnerIndex: 0,
            candidateIndices: [bestOrigIndex],
          });
        } catch {
          // рефайн или пересуд упал (например, судья вернул не-JSON) — не валим пайплайн,
          // просто останавливаемся на текущем лучшем кандидате.
          break;
        }
      }
    } catch {
      // судья недоступен/вернул мусор ещё до первого вердикта — деградируем на первого
      // живого кандидата, не теряя уже сгенерированные (и отрендеренные) варианты.
      const msg = 'Судья недоступен — выбран первый кандидат.';
      warnings.push(msg);
      ctx.emit({ type: 'warning', message: msg });
      best = alive[0];
    }
  } else {
    best = alive[0];
  }

  if (!best.render.animated) {
    const msg = 'Анимация может быть статичной';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
  }

  ctx.emit({ type: 'stage', stage: 'saving' });
  const meta = createSimulation({
    title: spec.title, prompt: input.prompt, subject: spec.subject,
    tags: spec.learningGoals.slice(0, 3),
    warning: warnings.length ? warnings.join(' ') : undefined,
  }, best.html);
  const shot = best.render.screenshots[1] ?? best.render.screenshots[0];
  if (shot) saveThumbnail(meta.id, shot);
  ctx.emit({ type: 'done', simulationId: meta.id });
  return meta;
}

async function refineHtml(ctx: Ctx, html: string, feedback: string): Promise<string> {
  const out = await ctx.genChat([
    { role: 'system', content: REFINER_SYSTEM },
    { role: 'user', content: `Замечания:\n${feedback}\n\nHTML:\n\`\`\`html\n${html}\n\`\`\`` },
  ]);
  return instrument(extractHtml(out));
}

export async function refineExisting(ctx: Ctx, id: string, instruction: string): Promise<void> {
  const html = getArtifact(id);
  ctx.emit({ type: 'stage', stage: 'refining' });
  let refined = await refineHtml(ctx, html, instruction);
  let report = await ctx.render(refined);
  for (let attempt = 0; !report.ok && attempt < 2; attempt++) {
    refined = await fixArtifact(ctx, refined, report.errors);
    report = await ctx.render(refined);
  }
  if (!report.ok) throw new Error('Правка сломала симуляцию: ' + report.errors.join('; '));
  updateArtifact(id, refined);
  const shot = report.screenshots[1] ?? report.screenshots[0];
  if (shot) saveThumbnail(id, shot);
  ctx.emit({ type: 'done', simulationId: id });
}
