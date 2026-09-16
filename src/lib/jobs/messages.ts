// Тексты ответов роутов заданий. Роуты Next не могут экспортировать ничего, кроме
// обработчиков, поэтому общие строки живут здесь — их же проверяют тесты.
export const GENERATION_BUSY_MESSAGE =
  'У вас уже идёт генерация. Дождитесь её окончания или отмените.';
export const REFINE_BUSY_MESSAGE =
  'У вас уже идёт доработка. Дождитесь её окончания или отмените.';
export const EMPTY_PROMPT_MESSAGE = 'Опишите, какую симуляцию нужно создать.';
export const EMPTY_INSTRUCTION_MESSAGE = 'Опишите, что нужно изменить в симуляции.';
export const JOB_NOT_FOUND_MESSAGE = 'Задание не найдено.';
export const SIMULATION_NOT_FOUND_MESSAGE = 'Симуляция не найдена.';
