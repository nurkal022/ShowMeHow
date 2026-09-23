import type { PipelineEvent, PlanSpec, RenderReport, RubricScores } from '../src/lib/types';
import { minScore } from '../src/lib/types';

export interface EvalRow {
  prompt: string;
  scores: RubricScores | null;
  error?: string;
  simulationId?: string;
  ms: number;
  level?: string;
  params?: number;
  views?: number;
  steps?: number;
  sections?: number;
  controls?: number;
  /** «прошло/всего» числовых проверок ядра физики. */
  coreChecks?: string;
  probePass?: number;
  /** Секунды по этапам пайплайна. */
  stages?: Record<string, number>;
  /** Токены по ролям: prompt + completion. */
  tokens?: Record<string, number>;
}

/** Сложность и затраты одного прогона — из спецификации, журнала событий и финального рендера. */
export function complexity(
  spec: PlanSpec, events: PipelineEvent[], render: RenderReport, sections: number,
): Omit<EvalRow, 'prompt' | 'scores' | 'ms'> {
  const stages: Record<string, number> = {};
  const open: Record<string, number> = {};
  const tokens: Record<string, number> = {};
  let coreChecks: string | undefined;
  for (const e of events) {
    if (e.type === 'stage') {
      if (e.status === 'start') open[e.stage] = e.at;
      else if (open[e.stage] !== undefined) stages[e.stage] = (stages[e.stage] ?? 0) + (e.at - open[e.stage]) / 1000;
    }
    if (e.type === 'usage') tokens[e.role] = (tokens[e.role] ?? 0) + e.promptTokens + e.completionTokens;
    if (e.type === 'physics-check') coreChecks = `${e.results.filter((r) => r.ok).length}/${e.results.length}`;
  }
  return {
    level: spec.level ?? 'demo',
    params: spec.parameters.length,
    views: spec.views?.length ?? 0,
    steps: spec.scenario?.length ?? 0,
    sections,
    controls: render.probes?.controls?.length ?? 0,
    coreChecks,
    probePass: render.probes?.passRate,
    stages: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, Math.round(v)])),
    tokens,
  };
}

export function aggregate(rows: EvalRow[]): {
  avg: RubricScores; passRate: number; failures: string[];
  complexity: string; avgSeconds: number; stageSeconds: string;
} {
  const ok = rows.filter((r) => r.scores) as (EvalRow & { scores: RubricScores })[];
  const n = Math.max(ok.length, 1);
  const sum = (k: keyof RubricScores) =>
    ok.reduce((a, r) => a + (r.scores[k] ?? 0), 0) / n;
  const avgOf = (k: 'params' | 'views' | 'steps' | 'sections' | 'controls') =>
    (ok.reduce((a, r) => a + (r[k] ?? 0), 0) / n).toFixed(1);
  const stageTotals: Record<string, number> = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.stages ?? {})) stageTotals[k] = (stageTotals[k] ?? 0) + v;
  const withDepth = ok.filter((r) => r.scores.depth !== undefined);
  return {
    avg: {
      physics: sum('physics'), clarity: sum('clarity'), interactivity: sum('interactivity'), aesthetics: sum('aesthetics'),
      ...(withDepth.length ? { depth: withDepth.reduce((a, r) => a + (r.scores.depth ?? 0), 0) / withDepth.length } : {}),
    },
    passRate: rows.length ? ok.filter((r) => minScore(r.scores) >= 8).length / rows.length : 0,
    failures: rows.filter((r) => !r.scores).map((r) => `${r.prompt}: ${r.error}`),
    complexity: `${avgOf('params')} парам., ${avgOf('views')} видов, ${avgOf('steps')} шагов, ${avgOf('sections')} секций, ${avgOf('controls')} контролов`,
    avgSeconds: Math.round(rows.reduce((a, r) => a + r.ms, 0) / Math.max(rows.length, 1) / 1000),
    stageSeconds: Object.entries(stageTotals).map(([k, v]) => `${k} ${Math.round(v / n)}`).join(', ') || '—',
  };
}
