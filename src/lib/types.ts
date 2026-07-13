export type QualityMode = 'fast' | 'standard' | 'max';

export interface ProviderProfile {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  generationModel: string;
  /** Vision-модель для критика/судьи; пустая строка = vision недоступен */
  visionModel: string;
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

export type PipelineEvent =
  | { type: 'stage'; stage: string; detail?: string }
  | { type: 'candidate'; index: number;
      status: 'generating' | 'rendering' | 'fixing' | 'critiquing' | 'ok' | 'failed' }
  | { type: 'screenshot'; index: number; dataUrl: string }
  | { type: 'scores'; scores: RubricScores[]; winnerIndex: number; candidateIndices: number[] }
  | { type: 'warning'; message: string }
  | { type: 'cancelled' }
  | { type: 'done'; simulationId: string }
  | { type: 'error'; message: string };

export function minScore(s: RubricScores): number {
  return Math.min(s.physics, s.clarity, s.interactivity, s.aesthetics);
}
