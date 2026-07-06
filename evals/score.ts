import type { RubricScores } from '../src/lib/types';
import { minScore } from '../src/lib/types';

export interface EvalRow {
  prompt: string;
  scores: RubricScores | null;
  error?: string;
}

export function aggregate(rows: EvalRow[]): {
  avg: RubricScores; passRate: number; failures: string[];
} {
  const ok = rows.filter((r) => r.scores) as (EvalRow & { scores: RubricScores })[];
  const sum = (k: keyof RubricScores) =>
    ok.reduce((a, r) => a + r.scores[k], 0) / Math.max(ok.length, 1);
  return {
    avg: { physics: sum('physics'), clarity: sum('clarity'),
      interactivity: sum('interactivity'), aesthetics: sum('aesthetics') },
    passRate: rows.length ? ok.filter((r) => minScore(r.scores) >= 8).length / rows.length : 0,
    failures: rows.filter((r) => !r.scores).map((r) => `${r.prompt}: ${r.error}`),
  };
}
