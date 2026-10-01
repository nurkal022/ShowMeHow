import type { Locale } from '@/i18n/config';
import { assignmentTitle, type StudentBlockBody } from './block-schema';

/**
 * Шаги урока. Ученик проходит тему не «одной колбасой», а шагами: теория, тренажёр,
 * задание. Задание и тренажёр — всегда отдельный шаг, подряд идущие материалы
 * склеиваются в один шаг теории и разрезаются на новом подзаголовке.
 * Модуль чистый: его зовут и страница темы, и клиентская навигация.
 */

export type StepKind = 'theory' | 'sim' | 'lab' | 'task';

export interface Step {
  id: string;
  kind: StepKind;
  title: string;
  /** Блоки шага по порядку. */
  blockIds: string[];
  /** Баллы за задание шага. */
  points: number;
}

const STEP_LABELS_BY_LOCALE: Record<Locale, Record<StepKind, string>> = {
  ru: { theory: 'Теория', sim: 'Тренажёр', lab: 'Лаборатория', task: 'Задание' },
  kk: { theory: 'Теория', sim: 'Тренажер', lab: 'Зертхана', task: 'Тапсырма' },
  en: { theory: 'Theory', sim: 'Simulator', lab: 'Lab', task: 'Assignment' },
};
export const STEP_LABELS: Record<StepKind, string> = STEP_LABELS_BY_LOCALE.ru;
export function stepLabels(locale: Locale = 'ru'): Record<StepKind, string> {
  return STEP_LABELS_BY_LOCALE[locale] ?? STEP_LABELS_BY_LOCALE.ru;
}

const MATERIAL = new Set(['text', 'callout', 'formula', 'image', 'video', 'spoiler', 'code', 'divider']);

/** Заголовки шагов без собственного названия — на языке locale (по умолчанию русский). */
export function buildSteps(blocks: { id: string; body: StudentBlockBody }[], locale: Locale = 'ru'): Step[] {
  const L = stepLabels(locale);
  const steps: Step[] = [];
  let theory: Step | null = null;
  for (const { id, body } of blocks) {
    if (MATERIAL.has(body.kind)) {
      // Новый подзаголовок — новый шаг: так теория режется на читаемые куски.
      const heading = body.kind === 'text' && body.payload.title.trim() ? body.payload.title.trim() : '';
      if (!theory || (heading && theory.blockIds.length > 0)) {
        theory = { id, kind: 'theory', title: heading || L.theory, blockIds: [], points: 0 };
        steps.push(theory);
      } else if (heading && !theory.title.trim()) {
        theory.title = heading;
      }
      theory.blockIds.push(id);
      continue;
    }
    theory = null;
    if (body.kind === 'simulation') {
      steps.push({ id, kind: 'sim', title: body.payload.caption.trim().slice(0, 60) || L.sim, blockIds: [id], points: 0 });
    } else if (body.kind === 'lab') {
      steps.push({ id, kind: 'lab', title: body.payload.caption.trim().slice(0, 60) || L.lab, blockIds: [id], points: 0 });
    } else if (body.kind === 'assignment') {
      steps.push({ id, kind: 'task', title: assignmentTitle(body.payload.prompt) || L.task, blockIds: [id], points: body.payload.points });
    }
  }
  return steps.filter((s) => s.blockIds.length > 0);
}

export type StepState = 'none' | 'seen' | 'done' | 'returned';

/** Состояние шага: теория — открыт ли, задание — сдано, проверено или возвращено. */
export function stepState(
  step: Step, viewed: ReadonlySet<string>, answers: ReadonlyMap<string, { status: string }>,
): StepState {
  if (step.kind === 'task') {
    const s = answers.get(step.blockIds[0])?.status;
    if (s === 'graded' || s === 'submitted') return 'done';
    if (s === 'returned') return 'returned';
    return viewed.has(step.blockIds[0]) ? 'seen' : 'none';
  }
  return step.blockIds.every((b) => viewed.has(b)) ? 'done' : step.blockIds.some((b) => viewed.has(b)) ? 'seen' : 'none';
}
