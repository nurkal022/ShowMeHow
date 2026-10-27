import type { CandidateResult, JudgeVerdict, PlanSpec, RedLine, RubricScores } from '../types';
import { textPart, imagePart } from '../provider';
import { extractJson } from '../artifact';
import { JUDGE_SYSTEM, RED_LINES } from './prompts';
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
  if (!ctx.hasVision) {
    return { winnerIndex: 0, scores: candidates.map(() => ({ ...ZERO })), feedback: '' };
  }
  const out = await ctx.chat('judge', [
    { role: 'system', content: JUDGE_SYSTEM },
    { role: 'user', content: [
      textPart('Спецификация:\n' + JSON.stringify(spec, null, 2)),
      ...candidates.flatMap((c, i) => candidateParts(c, `Кандидат ${i}`)),
    ] },
  ]);
  const v = extractJson<JudgeVerdict>(out);
  if (v.winnerIndex < 0 || v.winnerIndex >= candidates.length) v.winnerIndex = 0;
  v.redLines = redLinesOf((v as { redLines?: unknown }).redLines);
  // Красные линии идут в доводку первыми: это задание, а не пожелание.
  if (v.redLines.length) {
    v.feedback = 'ОБЯЗАТЕЛЬНО исправить:\n' + v.redLines.map((r) => `- ${r.code} (${RED_LINES[r.code]}): ${r.detail}`).join('\n') +
      (v.feedback ? `\n\nТакже:\n${v.feedback}` : '');
  }
  return v;
}

/** Только известные коды, по одному на код, с непустым объяснением. */
export function redLinesOf(raw: unknown): RedLine[] {
  const out: RedLine[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const code = typeof r?.code === 'string' ? r.code.trim().toUpperCase() : '';
    const detail = typeof r?.detail === 'string' ? r.detail.trim().slice(0, 300) : '';
    if (RED_LINES[code] && detail && !out.some((x) => x.code === code)) out.push({ code, detail });
  }
  return out;
}

export async function rescore(
  ctx: Ctx, spec: PlanSpec, candidate: CandidateResult,
): Promise<{ scores: RubricScores; feedback: string; redLines: RedLine[] }> {
  const v = await judge(ctx, spec, [candidate]);
  return { scores: v.scores[0] ?? { ...ZERO }, feedback: v.feedback, redLines: v.redLines ?? [] };
}
