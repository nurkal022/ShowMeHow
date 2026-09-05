import type { PipelineStage } from '@/lib/types';
import type { CandidateStatus } from './deriveProgress';

/**
 * Чистый текст-слой прогресса: русские микро-описания по стадии пайплайна, статусу
 * кандидата и кругу доводки. Никакого состояния — только маппинг значение → строка,
 * чтобы реплей событий давал те же подписи и функции легко покрывались юнит-тестом.
 */

/** Короткие подписи чипов таймлайна (совпадают со STAGE_LABELS в deriveProgress). */
export const STAGE_TITLES: Record<PipelineStage, string> = {
  planning: 'Планирование',
  generating: 'Кандидат',
  critiquing: 'Кандидат',
  judging: 'Суд',
  refining: 'Доводка',
  saving: 'Сохранение',
};

/** Развёрнутое описание того, что модель делает на текущей стадии. */
export function stageCopy(stage: PipelineStage): string {
  switch (stage) {
    case 'planning': return 'Модель продумывает план симуляции';
    case 'generating': return 'Генерируем симуляцию';
    case 'critiquing': return 'Физик-критик проверяет симуляцию';
    case 'judging': return 'Судья оценивает симуляцию по рубрике';
    case 'refining': return 'Доводим симуляцию до высоких оценок';
    case 'saving': return 'Сохраняем готовую симуляцию';
  }
}

/** Описание текущего шага работы над кандидатом. */
export function candidateCopy(status: CandidateStatus): string {
  switch (status) {
    case 'generating': return 'Пишем код симуляции';
    case 'rendering': return 'Проверяем рендер в браузере';
    case 'fixing': return 'Чиним ошибки автоматически';
    case 'critiquing': return 'Проверяем физику';
    case 'ok': return 'Готов';
    case 'failed': return 'Не удалось запустить';
  }
}

/** Подпись круга доводки победителя. */
export function refineCopy(round: number): string {
  return `Круг ${round}: поднимаем самые слабые оценки`;
}

/** Описание положения задания в очереди генерации (вместо стадий, пока job не запущен). */
export function queuedCopy(position: number): string {
  return `Задание в очереди: перед вами ${position}. Начнём, как только освободится место.`;
}
