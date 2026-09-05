import type { PipelineEvent, PipelineStage, PlanSummary, RubricScores } from '@/lib/types';

/**
 * Порядок и состав чипов таймлайна. 'critiquing' в PipelineStage существует только как
 * возможное значение типа события 'candidate'.status ('критика' внутри кандидата) —
 * ни один реальный 'stage'-событие не несёт stage:'critiquing' (run.ts эмитит только
 * planning/generating/judging/refining/saving), поэтому «Кандидат» естественно
 * агрегирует генерацию и критику одним чипом без специальной обработки.
 */
export const STAGE_ORDER: PipelineStage[] = [
  'planning', 'generating', 'judging', 'refining', 'saving',
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  planning: 'Планирование',
  generating: 'Кандидат',
  critiquing: 'Кандидат',
  judging: 'Суд',
  refining: 'Доводка',
  saving: 'Сохранение',
};

export type StageStatus = 'pending' | 'active' | 'done' | 'skipped' | 'interrupted';

export interface StageInfo {
  stage: PipelineStage;
  status: StageStatus;
  startAt?: number;
  endAt?: number;
}

export type CandidateStatus = 'generating' | 'rendering' | 'fixing' | 'critiquing' | 'ok' | 'failed';

export interface CandidateInfo {
  index: number;
  status: CandidateStatus;
  screenshot?: string;
  critic?: { physicsOk: boolean; issues: string[] };
  scores?: RubricScores;
  isWinner: boolean;
  probes?: { passRate: number; failed: string[] };
  targetedFix?: string[];
}

export interface RefineRoundInfo {
  round: number;
  before: RubricScores;
  after: RubricScores | null;
}

export type TerminalState =
  | { type: 'done'; simulationId: string }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };

export interface ProgressState {
  stages: StageInfo[];
  plan: PlanSummary | null;
  candidates: CandidateInfo[];
  judgeFeedback: string | null;
  refineRounds: RefineRoundInfo[];
  warnings: string[];
  terminal: TerminalState | null;
}

/**
 * Чистая функция events[] -> состояние UI. Никакого локального состояния: реплей тех
 * же событий (после перезагрузки страницы) обязан дать идентичный результат.
 */
export function deriveProgress(events: PipelineEvent[]): ProgressState {
  const stageMap = new Map<PipelineStage, StageInfo>(
    STAGE_ORDER.map((s) => [s, { stage: s, status: 'pending' as StageStatus }]),
  );
  const candMap = new Map<number, CandidateInfo>();
  let plan: PlanSummary | null = null;
  let judgeFeedback: string | null = null;
  let winnerOriginalIndex: number | null = null;
  const refineRounds: RefineRoundInfo[] = [];
  const warnings: string[] = [];
  let terminal: TerminalState | null = null;

  function candidate(index: number): CandidateInfo {
    let c = candMap.get(index);
    if (!c) {
      c = { index, status: 'generating', isWinner: false };
      candMap.set(index, c);
    }
    return c;
  }

  for (const e of events) {
    switch (e.type) {
      case 'stage': {
        const info = stageMap.get(e.stage);
        if (!info) break; // 'critiquing' as a stage value never occurs in practice
        if (e.status === 'start') { info.status = 'active'; info.startAt = e.at; }
        else { info.status = 'done'; info.endAt = e.at; }
        break;
      }
      case 'plan-ready':
        plan = e.spec;
        break;
      case 'candidate': {
        const c = candidate(e.index);
        c.status = e.status;
        break;
      }
      case 'screenshot':
        candidate(e.index).screenshot = e.dataUrl;
        break;
      case 'critic-verdict':
        candidate(e.index).critic = { physicsOk: e.physicsOk, issues: e.issues };
        break;
      case 'probe-report':
        candidate(e.index).probes = {
          passRate: e.passRate,
          failed: e.results.filter((r) => r.status === 'fail').map((r) => `${r.label}: ${r.detail}`),
        };
        break;
      case 'targeted-fix':
        candidate(e.index).targetedFix = e.issues;
        break;
      case 'judge-verdict':
        judgeFeedback = e.feedback;
        e.scores.forEach((s, i) => {
          const origIndex = e.candidateIndices[i] ?? i;
          candidate(origIndex).scores = s;
        });
        winnerOriginalIndex = e.candidateIndices[e.winnerIndex] ?? null;
        break;
      case 'refine-round':
        refineRounds.push({ round: e.round, before: e.before, after: e.after });
        break;
      case 'warning':
        warnings.push(e.message);
        break;
      case 'cancelled':
        terminal = { type: 'cancelled' };
        break;
      case 'done':
        terminal = { type: 'done', simulationId: e.simulationId };
        break;
      case 'error':
        terminal = { type: 'error', message: e.message };
        break;
    }
  }

  if (winnerOriginalIndex !== null) {
    const w = candMap.get(winnerOriginalIndex);
    if (w) w.isWinner = true;
  }

  // Hard-error tolerance (T2 review): терминальное событие обязано закрыть ВСЕ чипы —
  // ни один чип не должен пульсировать вечно, даже если пайплайн упал (или был отменён)
  // до того, как эмитить свой 'stage'/'end' (например planning/'end' не гарантирован,
  // если plan() бросает исключение — в run.ts вокруг него нет try/finally). Ещё не
  // начавшиеся к моменту терминального события этапы помечаются как пропущенные.
  if (terminal) {
    for (const info of stageMap.values()) {
      if (info.status === 'pending') info.status = 'skipped';
      else if (info.status === 'active') info.status = 'interrupted';
    }
  }

  return {
    stages: STAGE_ORDER.map((s) => stageMap.get(s)!),
    plan,
    candidates: [...candMap.values()].sort((a, b) => a.index - b.index),
    judgeFeedback,
    refineRounds,
    warnings,
    terminal,
  };
}
