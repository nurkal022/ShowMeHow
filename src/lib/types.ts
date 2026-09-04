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
  /** Предупреждение, если пайплайн деградировал (нет vision / все кандидаты сломаны) */
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
}

export interface PlanSpec {
  title: string;
  subject: string;
  mode: '2d' | '3d';
  learningGoals: string[];
  physics: string;          // законы, уравнения, допущения — текст
  parameters: SimParameter[];
  visualPlan: string;       // что и как рисуем, какие графики
}

export interface RenderReport {
  ok: boolean;
  errors: string[];
  animated: boolean;
  screenshots: Buffer[];    // PNG
}

export interface CriticReport {
  physicsOk: boolean;
  issues: string[];
}

export interface RubricScores {
  physics: number;        // 1-10
  clarity: number;        // наглядность
  interactivity: number;
  aesthetics: number;
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
  'planning' | 'generating' | 'critiquing' | 'judging' | 'refining' | 'saving';

export interface PlanSummary {
  title: string;
  subject: string;
  mode: '2d' | '3d';
  physics: string;
  parameters: { label: string; unit: string }[];
  goals: string[];
}

export type PipelineEvent =
  | { type: 'stage'; stage: PipelineStage; status: 'start' | 'end'; at: number }
  | { type: 'plan-ready'; spec: PlanSummary }
  | { type: 'candidate'; index: number;
      status: 'generating' | 'rendering' | 'fixing' | 'critiquing' | 'ok' | 'failed';
      styleHint: string }
  | { type: 'screenshot'; index: number; dataUrl: string }
  | { type: 'critic-verdict'; index: number; physicsOk: boolean; issues: string[] }
  | { type: 'judge-verdict'; scores: RubricScores[]; candidateIndices: number[];
      winnerIndex: number; feedback: string }
  | { type: 'refine-round'; round: number; before: RubricScores; after: RubricScores | null }
  | { type: 'warning'; message: string }
  | { type: 'cancelled' }
  | { type: 'done'; simulationId: string }
  | { type: 'error'; message: string }
  | { type: 'usage'; role: Role; model: string; promptTokens: number;
      completionTokens: number; ms: number };

export function minScore(s: RubricScores): number {
  return Math.min(s.physics, s.clarity, s.interactivity, s.aesthetics);
}
