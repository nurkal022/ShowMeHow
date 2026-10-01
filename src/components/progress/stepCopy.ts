import type { PipelineStage } from '@/lib/types';
import type { CandidateStatus } from './deriveProgress';
import { translator } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import { workbenchProgress } from '@/i18n/messages/workbench-progress';

/**
 * Чистый текст-слой прогресса: микро-описания по стадии пайплайна, статусу
 * кандидата и кругу доводки. Никакого состояния — только маппинг значение → строка,
 * чтобы реплей событий давал те же подписи и функции легко покрывались юнит-тестом.
 * Язык — последним аргументом, по умолчанию русский.
 */

type Key = keyof typeof workbenchProgress.ru;

const TITLE_KEYS: Record<PipelineStage, Key> = {
  planning: 'tPlanning',
  physics: 'tPhysics',
  generating: 'tGenerating',
  layers: 'tLayers',
  critiquing: 'tCritiquing',
  judging: 'tJudging',
  refining: 'tRefining',
  saving: 'tSaving',
};

const STAGE_KEYS: Record<PipelineStage, Key> = {
  planning: 'sPlanning',
  physics: 'sPhysics',
  layers: 'sLayers',
  generating: 'sGenerating',
  critiquing: 'sCritiquing',
  judging: 'sJudging',
  refining: 'sRefining',
  saving: 'sSaving',
};

const CANDIDATE_KEYS: Record<CandidateStatus, Key> = {
  generating: 'cGenerating',
  rendering: 'cRendering',
  fixing: 'cFixing',
  critiquing: 'cCritiquing',
  ok: 'cOk',
  failed: 'cFailed',
};

/** Короткая подпись чипа таймлайна. */
export function stageTitle(stage: PipelineStage, locale: Locale = 'ru'): string {
  return translator(workbenchProgress, locale)(TITLE_KEYS[stage]);
}

/** Короткие подписи чипов таймлайна по-русски (совпадают со STAGE_LABELS в deriveProgress). */
export const STAGE_TITLES = Object.fromEntries(
  (Object.keys(TITLE_KEYS) as PipelineStage[]).map((s) => [s, stageTitle(s)]),
) as Record<PipelineStage, string>;

/** Развёрнутое описание того, что модель делает на текущей стадии. */
export function stageCopy(stage: PipelineStage, locale: Locale = 'ru'): string {
  return translator(workbenchProgress, locale)(STAGE_KEYS[stage]);
}

/** Описание текущего шага работы над кандидатом. */
export function candidateCopy(status: CandidateStatus, locale: Locale = 'ru'): string {
  return translator(workbenchProgress, locale)(CANDIDATE_KEYS[status]);
}

/** Подпись круга доводки победителя. */
export function refineCopy(round: number, locale: Locale = 'ru'): string {
  return translator(workbenchProgress, locale)('refineRound', { round });
}

/** Описание положения задания в очереди генерации (вместо стадий, пока job не запущен). */
export function queuedCopy(position: number, locale: Locale = 'ru'): string {
  return translator(workbenchProgress, locale)('queued', { n: position });
}
