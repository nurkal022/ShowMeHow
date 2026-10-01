import type { CatalogEntry } from './types';

/**
 * Сообщения сервера области «learn» на казахском и английском. Ошибки библиотек
 * lms (ответы, обсуждение, разборы, наставник) — в catalog/lms.ts; здесь — то, что
 * показывает только урок ученика.
 */
export const catalog: CatalogEntry[] = [
  // bridgeProblem (lib/lms/sim-bridge): сдача задания «Состояние симуляции».
  {
    ru: 'Симуляция ещё загружается или не отвечает. Подождите пару секунд и попробуйте снова.',
    kk: 'Симуляция әлі жүктелуде немесе жауап бермей тұр. Бірер секунд күтіп, қайталап көріңіз.',
    en: 'The simulation is still loading or not responding. Wait a couple of seconds and try again.',
  },
  {
    ru: 'Эта симуляция не сообщает значения своих параметров.',
    kk: 'Бұл симуляция өз параметрлерінің мәндерін бермейді.',
    en: 'This simulation does not report its parameter values.',
  },
];
