import type { CatalogEntry } from './types';

/** Общие сообщения сервера: доступ, формат запроса, частота, провайдер модели. */
export const catalog: CatalogEntry[] = [
  { ru: 'Не найдено.', kk: 'Табылмады.', en: 'Not found.' },
  { ru: 'Некорректный запрос.', kk: 'Сұрау дұрыс емес.', en: 'Invalid request.' },
  { ru: 'Требуется вход в систему.', kk: 'Жүйеге кіру қажет.', en: 'Please sign in.' },
  {
    ru: 'Слишком часто: дождитесь окончания предыдущего запроса и попробуйте через минуту.',
    kk: 'Тым жиі: алдыңғы сұраудың аяқталуын күтіп, бір минуттан кейін қайталаңыз.',
    en: 'Too many requests: wait for the previous one to finish and try again in a minute.',
  },
  {
    ru: 'Провайдер не настроен. Задайте SHOWMEHOW_API_KEY и SHOWMEHOW_MODEL (при необходимости SHOWMEHOW_BASE_URL и SHOWMEHOW_VISION_MODEL) в файле .env.local и перезапустите сервер.',
    kk: 'Модель провайдері бапталмаған. .env.local файлында SHOWMEHOW_API_KEY және SHOWMEHOW_MODEL (қажет болса SHOWMEHOW_BASE_URL және SHOWMEHOW_VISION_MODEL) мәндерін көрсетіп, серверді қайта іске қосыңыз.',
    en: 'The model provider is not configured. Set SHOWMEHOW_API_KEY and SHOWMEHOW_MODEL (and, if needed, SHOWMEHOW_BASE_URL and SHOWMEHOW_VISION_MODEL) in .env.local and restart the server.',
  },
  { ru: 'Помощник сейчас недоступен. Попробуйте через минуту.', kk: 'Көмекші қазір қолжетімсіз. Бір минуттан кейін көріңіз.', en: 'The assistant is unavailable right now. Try again in a minute.' },
  { ru: 'Помощник ответил не по формату. Попробуйте ещё раз.', kk: 'Көмекші дұрыс емес форматта жауап берді. Қайтадан көріңіз.', en: 'The assistant replied in an unexpected format. Please try again.' },
  // Уведомления хранятся в базе по-русски (язык получателя в момент события неизвестен) — переводим при показе.
  { ru: 'Новые работы: «{task}»', kk: 'Жаңа жұмыстар: «{task}»', en: 'New submissions: “{task}”' },
  { ru: 'Новый курс: «{title}»', kk: 'Жаңа курс: «{title}»', en: 'New course: “{title}”' },
  { ru: 'Учитель открыл курс вашей группе.', kk: 'Мұғалім курсты сіздің тобыңызға ашты.', en: 'Your teacher opened the course to your group.' },
  { ru: 'Проверено: {score} из {points}', kk: 'Тексерілді: {points} ұпайдан {score}', en: 'Graded: {score} of {points}' },
  { ru: 'Работу вернули на доработку', kk: 'Жұмыс пысықтауға қайтарылды', en: 'Your work was returned for revision' },
];
