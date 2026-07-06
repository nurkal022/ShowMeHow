import type { CandidateResult, JudgeVerdict, PlanSpec, RubricScores } from '../types';
import { textPart, imagePart } from '../provider';
import { extractJson } from '../artifact';
import { JUDGE_SYSTEM } from './prompts';
import type { Ctx } from './stages';

const ZERO: RubricScores = { physics: 0, clarity: 0, interactivity: 0, aesthetics: 0 };

function candidateParts(c: CandidateResult, label: string) {
  return [
    textPart(`${label}. Замечания рецензента: ` +
      (c.critic ? JSON.stringify(c.critic) : 'рецензирование недоступно')),
    ...c.render.screenshots.slice(0, 3).map((s) =>
      imagePart('data:image/png;base64,' + s.toString('base64'))),
  ];
}

export async function judge(
  ctx: Ctx, spec: PlanSpec, candidates: CandidateResult[],
): Promise<JudgeVerdict> {
  if (!ctx.visionChat) {
    return { winnerIndex: 0, scores: candidates.map(() => ({ ...ZERO })), feedback: '' };
  }
  const out = await ctx.visionChat([
    { role: 'system', content: JUDGE_SYSTEM },
    { role: 'user', content: [
      textPart('Спецификация:\n' + JSON.stringify(spec, null, 2)),
      ...candidates.flatMap((c, i) => candidateParts(c, `Кандидат ${i}`)),
    ] },
  ]);
  const v = extractJson<JudgeVerdict>(out);
  if (v.winnerIndex < 0 || v.winnerIndex >= candidates.length) v.winnerIndex = 0;
  return v;
}

export async function rescore(
  ctx: Ctx, spec: PlanSpec, candidate: CandidateResult,
): Promise<{ scores: RubricScores; feedback: string }> {
  const v = await judge(ctx, spec, [candidate]);
  return { scores: v.scores[0] ?? { ...ZERO }, feedback: v.feedback };
}
