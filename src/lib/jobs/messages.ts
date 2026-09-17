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
export const INVALID_REQUEST_MESSAGE =
  'Не удалось прочитать запрос. Обновите страницу и попробуйте ещё раз.';
/** Картинка-образец хранится в базе до конца задания; ~8 млн символов base64 — это около 6 МБ. */
export const MAX_IMAGE_DATA_URL_LENGTH = 8_000_000;
export const INVALID_IMAGE_MESSAGE =
  'Прикрепите картинку в обычном формате (PNG, JPEG и т. п.) размером не больше 6 МБ.';
/** Текст заявки пишется в базу и уходит модели; стенд-конструктор собирает длинные запросы. */
export const MAX_PROMPT_LENGTH = 20_000;
export const PROMPT_TOO_LONG_MESSAGE =
  'Описание слишком длинное: сократите его до 20\u00a0000 символов.';
export const MAX_INSTRUCTION_LENGTH = 4000;
export const INSTRUCTION_TOO_LONG_MESSAGE =
  'Просьба слишком длинная: сократите её до 4000 символов.';
