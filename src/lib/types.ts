import type { ProbeReport } from './pipeline/probes';

export type QualityMode = 'fast' | 'standard' | 'max';

/** Роли пайплайна, каждая может резолвиться в свою модель/лимит/параметры. */
export type Role = 'planner' | 'generator' | 'fixer' | 'critic' | 'judge' | 'refiner';

export interface RoleConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
}

export interface ProviderProfile {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  generationModel: string;
  /** Vision-модель для критика/судьи; пустая строка = vision недоступен */
  visionModel: string;
  /**
   * Доп. поля тела запроса chat.completions, специфичные для провайдера
   * (например `{ enable_thinking: false, temperature: 0.2 }` для qwen на MaaS).
   * Опционально; по умолчанию ничего не добавляется.
   */
  extraBody?: Record<string, unknown>;
  /**
   * Настройки по ролям пайплайна: планировщику можно дать сильную модель,
   * фиксеру — дешёвую. Пустое поле = поведение по умолчанию (см. resolveRole).
   */
  roles?: Partial<Record<Role, RoleConfig>>;
}

export interface Settings {
  activeProviderId: string | null;
  providers: ProviderProfile[];
  qualityMode: QualityMode;
}

export interface SimulationMeta {
  id: string;
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Предупреждение, если пайплайн деградировал (нет vision / кандидат сломан) */
  warning?: string;
  /** slug вшитой демки, если симуляция установлена из demos/ (для идемпотентности install) */
  demo?: string;
}

export interface SimParameter {
  name: string;    // имя переменной в коде
  label: string;   // подпись на русском
  min: number;
  max: number;
  step: number;
  value: number;   // начальное значение
  unit: string;    // единица измерения, '' если нет
  /** Группа на панели («Среда», «Источник»): у сложных тренажёров параметров много. */
  group?: string;
}

/**
 * Уровень тренажёра задаёт объём работы: сколько параметров, видов и слоёв.
 * demo — показ явления; lab — лаборатория с измерениями; research — исследование с заданиями.
 */
export type SimLevel = 'demo' | 'lab' | 'research';

export interface PlanEntity { name: string; role: string }
export interface PlanObservable { name: string; label: string; unit: string }
export interface PlanView { kind: 'scene' | 'chart' | 'phase' | 'table' | 'formula' | 'section'; title: string; what: string }
/** Проверяемое утверждение о физике: оно уходит в числовую проверку ядра. */
export interface PlanInvariant { text: string }
export interface PlanStep { title: string; task: string; /** Что ученик должен заметить или ответить. */ expect?: string }
export interface PlanPreset { label: string; values: Record<string, number> }

export interface PlanSpec {
  title: string;
  subject: string;
  mode: '2d' | '3d';
  learningGoals: string[];
  physics: string;          // законы, уравнения, допущения — текст
  parameters: SimParameter[];
  visualPlan: string;       // что и как рисуем, какие графики
  // --- План v2: всё необязательно, старые спецификации остаются валидными ---
  level?: SimLevel;
  audience?: string;
  entities?: PlanEntity[];
  observables?: PlanObservable[];
  views?: PlanView[];
  invariants?: PlanInvariant[];
  scenario?: PlanStep[];
  presets?: PlanPreset[];
  wowMoment?: string;
}

export interface RenderReport {
  ok: boolean;
  errors: string[];
  animated: boolean;
  screenshots: Buffer[];    // PNG
  probes?: ProbeReport;
}

export type CriticSeverity = 'blocker' | 'major' | 'minor';

export interface CriticIssue {
  severity: CriticSeverity;
  text: string;
}

export interface CriticReport {
  physicsOk: boolean;
  issues: CriticIssue[];
}

export interface RubricScores {
  physics: number;        // 1-10
  clarity: number;        // наглядность
  interactivity: number;
  aesthetics: number;
  /** Глубина: насколько тренажёр дотягивает до заявленного уровня (lab/research). */
  depth?: number;
}

export interface JudgeVerdict {
  winnerIndex: number;
  scores: RubricScores[];  // по кандидату
  feedback: string;        // что улучшить победителю
}

export interface CandidateResult {
  html: string;
  render: RenderReport;
  critic: CriticReport | null; // null = vision недоступен
  alive: boolean;              // прошёл рендер (возможно после починки)
}

export type PipelineStage =
  'planning' | 'physics' | 'generating' | 'layers' | 'critiquing' | 'judging' | 'refining' | 'saving';

export interface PlanSummary {
  title: string;
  subject: string;
  mode: '2d' | '3d';
  physics: string;
  parameters: { label: string; unit: string }[];
  goals: string[];
  level?: SimLevel;
  views?: string[];
  steps?: string[];
  invariants?: string[];
}

export type PipelineEvent =
  /** Задание ждёт свободного места; position — место в очереди, считая с единицы. */
  | { type: 'queued'; position: number }
  | { type: 'stage'; stage: PipelineStage; status: 'start' | 'end'; at: number }
  | { type: 'plan-ready'; spec: PlanSummary }
  | { type: 'candidate'; index: number;
      status: 'generating' | 'rendering' | 'fixing' | 'critiquing' | 'ok' | 'failed' }
  | { type: 'screenshot'; index: number; dataUrl: string }
  | { type: 'critic-verdict'; index: number; physicsOk: boolean; issues: string[] }
  | { type: 'probe-report'; index: number; passRate: number;
      results: { id: string; label: string; status: 'pass' | 'fail' | 'skip'; detail: string }[] }
  | { type: 'targeted-fix'; index: number; issues: string[] }
  | { type: 'judge-verdict'; scores: RubricScores[]; candidateIndices: number[];
      winnerIndex: number; feedback: string }
  | { type: 'refine-round'; round: number; before: RubricScores; after: RubricScores | null }
  /** Модель пишет код: сколько символов уже есть и хвост написанного — для живой ленты. */
  | { type: 'gen-progress'; role: Role; chars: number; tail: string }
  /** Готова версия, которую можно открыть и пробовать; HTML лежит в черновиках задания. */
  | { type: 'draft'; version: number; label: string }
  /**
   * Отчёт о доработке: что изменено, чего модель делать не стала и что предлагает дальше.
   * Живёт в журнале задания, поэтому переписка восстанавливается вместе с ним.
   */
  | { type: 'note'; summary: string; changed: string[]; skipped: string[]; next: string[] }
  /** Ядро физики проверено числами: какие проверки прошли. */
  | { type: 'physics-check'; ok: boolean; results: { label: string; ok: boolean; detail: string; soft?: boolean }[] }
  /** Слой тренажёра: приборы и виды, сценарий урока. */
  | { type: 'layer'; name: string; title: string; status: 'start' | 'ok' | 'skipped' }
  /** Доработка ухудшила проверки — правка сохранена, но человеку предлагают откат. */
  | { type: 'regression'; lost: string[] }
  | { type: 'warning'; message: string }
  | { type: 'cancelled' }
  | { type: 'done'; simulationId: string }
  | { type: 'error'; message: string }
  | { type: 'usage'; role: Role; model: string; promptTokens: number;
      completionTokens: number; ms: number };

export function minScore(s: RubricScores): number {
  const base = Math.min(s.physics, s.clarity, s.interactivity, s.aesthetics);
  return typeof s.depth === 'number' ? Math.min(base, s.depth) : base;
}
