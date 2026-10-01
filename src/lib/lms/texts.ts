import type { Locale } from '@/i18n/config';

/**
 * Короткие подписи, которые библиотека курсов сама вставляет в данные для интерфейса
 * (запасные названия, причины «требует внимания»). Модуль чистый.
 */

const TEXT: Record<Locale, {
  task: string; step: string;
  neverOpenedCourse: string; neverSignedIn: string; noLessonsOpened: string;
  away: (days: number) => string; avg: (pct: number) => string; returned: (n: number) => string;
}> = {
  ru: {
    task: 'Задание', step: 'Шаг урока',
    neverOpenedCourse: 'ни разу не открывал курс', neverSignedIn: 'ни разу не входил', noLessonsOpened: 'не открывал уроки',
    away: (d) => `не заходил ${d} дн.`, avg: (p) => `средний балл ${p}%`, returned: (n) => `на доработке: ${n}`,
  },
  kk: {
    task: 'Тапсырма', step: 'Сабақ қадамы',
    neverOpenedCourse: 'курсты бір рет те ашпаған', neverSignedIn: 'бір рет те кірмеген', noLessonsOpened: 'сабақтарды ашпаған',
    away: (d) => `${d} күн кірмеген`, avg: (p) => `орташа ұпай ${p}%`, returned: (n) => `жетілдіруде: ${n}`,
  },
  en: {
    task: 'Assignment', step: 'Lesson step',
    neverOpenedCourse: 'has never opened the course', neverSignedIn: 'has never signed in', noLessonsOpened: 'has not opened any lessons',
    away: (d) => `inactive for ${d} d`, avg: (p) => `average score ${p}%`, returned: (n) => `returned for revision: ${n}`,
  },
};

export function lmsText(locale: Locale = 'ru') {
  return TEXT[locale] ?? TEXT.ru;
}

const AI_LANGUAGE: Record<Locale, string> = {
  ru: '',
  kk: 'Отвечай на казахском языке (литературный казахский, кириллица): весь текст, который прочитает человек, — только на казахском, даже если указания выше написаны по-русски.',
  en: 'Отвечай на английском языке: весь текст, который прочитает человек, — только на английском, даже если указания выше написаны по-русски.',
};

/**
 * Указание модели, на каком языке писать ответ. Для русского — пустая строка:
 * промпты и так русские, поведение не меняется. Сами промпты не переводим.
 */
export function aiLanguageNote(locale: Locale = 'ru'): string {
  return AI_LANGUAGE[locale] ?? '';
}

/** Добавляет указание языка в конец системного промпта. */
export function withLanguage(system: string, locale: Locale = 'ru'): string {
  const note = aiLanguageNote(locale);
  return note ? `${system}\n\n${note}` : system;
}

const AI_DEFAULTS: Record<Locale, { simCaption: string; videoCaption: string; videoMissing: string; newCourse: string; debriefTopic: (t: string) => string }> = {
  ru: {
    simCaption: 'Попробуйте сами: меняйте параметры и наблюдайте.', videoCaption: 'Посмотрите видео и ответьте на вопросы ниже.',
    videoMissing: 'Вставьте ссылку на видео.', newCourse: 'Новый курс', debriefTopic: (t) => `Работа над ошибками: ${t}`,
  },
  kk: {
    simCaption: 'Өзіңіз байқап көріңіз: параметрлерді өзгертіп, бақылаңыз.', videoCaption: 'Бейнені көріп, төмендегі сұрақтарға жауап беріңіз.',
    videoMissing: 'Бейнеге сілтеме қойыңыз.', newCourse: 'Жаңа курс', debriefTopic: (t) => `Қателермен жұмыс: ${t}`,
  },
  en: {
    simCaption: 'Try it yourself: change the parameters and observe.', videoCaption: 'Watch the video and answer the questions below.',
    videoMissing: 'Paste a link to the video.', newCourse: 'New course', debriefTopic: (t) => `Learning from mistakes: ${t}`,
  },
};

/** Тексты, которые сервер сам кладёт в созданные помощником блоки и темы. */
export function aiDefaults(locale: Locale = 'ru') {
  return AI_DEFAULTS[locale] ?? AI_DEFAULTS.ru;
}
