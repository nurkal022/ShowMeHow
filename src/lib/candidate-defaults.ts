import type { QualityMode } from './types';

/**
 * Дефолтное число кандидатов на режим качества — единственный источник истины.
 * Модуль содержит только данные (никаких fs/renderer-зависимостей), поэтому
 * безопасен и для серверного пайплайна (MODES в pipeline/run.ts берёт
 * candidates отсюда), и для клиентского бандла (селектор в Workbench).
 */
export const CANDIDATE_DEFAULTS: Record<QualityMode, number> = {
  fast: 1,
  standard: 2,
  max: 3,
};
