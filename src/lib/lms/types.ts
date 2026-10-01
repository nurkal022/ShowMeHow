import type { Locale } from '@/i18n/config';

/**
 * Общие типы и пределы курсов. Модуль чистый: его импортируют и роуты,
 * и клиентские редакторы, поэтому здесь нет ни базы, ни node-модулей.
 * Подписи на языке пользователя — функции *Labels(locale); константы *_LABELS — русские.
 */

/** Отказ с текстом для человека: роут отдаёт его как 400. */
export class LmsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LmsError';
  }
}

export type CourseStatus = 'draft' | 'published' | 'archived';
export const COURSE_STATUSES: readonly CourseStatus[] = ['draft', 'published', 'archived'];
const COURSE_STATUS_LABELS_BY_LOCALE: Record<Locale, Record<CourseStatus, string>> = {
  ru: { draft: 'черновик', published: 'опубликован', archived: 'в архиве' },
  kk: { draft: 'жоба', published: 'жарияланған', archived: 'мұрағатта' },
  en: { draft: 'draft', published: 'published', archived: 'archived' },
};
export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = COURSE_STATUS_LABELS_BY_LOCALE.ru;
export function courseStatusLabels(locale: Locale = 'ru'): Record<CourseStatus, string> {
  return COURSE_STATUS_LABELS_BY_LOCALE[locale] ?? COURSE_STATUS_LABELS_BY_LOCALE.ru;
}

export function isCourseStatus(v: unknown): v is CourseStatus {
  return typeof v === 'string' && (COURSE_STATUSES as readonly string[]).includes(v);
}

export type SubmissionStatus = 'draft' | 'submitted' | 'returned' | 'graded';
/** Состояние ответа с точки зрения журнала: 'none' — строки ещё нет. */
export type AnswerState = SubmissionStatus | 'none';
const ANSWER_STATE_LABELS_BY_LOCALE: Record<Locale, Record<AnswerState, string>> = {
  ru: { none: 'не начато', draft: 'черновик', submitted: 'сдано', returned: 'возвращено', graded: 'проверено' },
  kk: { none: 'басталмаған', draft: 'жоба', submitted: 'тапсырылды', returned: 'қайтарылды', graded: 'тексерілді' },
  en: { none: 'not started', draft: 'draft', submitted: 'submitted', returned: 'returned', graded: 'graded' },
};
export const ANSWER_STATE_LABELS: Record<AnswerState, string> = ANSWER_STATE_LABELS_BY_LOCALE.ru;
export function answerStateLabels(locale: Locale = 'ru'): Record<AnswerState, string> {
  return ANSWER_STATE_LABELS_BY_LOCALE[locale] ?? ANSWER_STATE_LABELS_BY_LOCALE.ru;
}

/** Пределы длины из спецификации (§8) и соседние, которые спецификация не назвала. */
export const LIMITS = {
  title: 200,
  subject: 60,
  grade: 40,
  description: 2000,
  text: 20000,
  caption: 300,
  option: 500,
  textAnswer: 10000,
  numberAnswer: 50,
  comment: 2000,
  unit: 30,
  minOptions: 2,
  maxOptions: 10,
  maxPoints: 1000,
} as const;

export function requireText(raw: unknown, max: number, label: string): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new LmsError(`Заполните поле «${label}».`);
  const value = raw.trim();
  if (value.length > max) throw new LmsError(`Поле «${label}» — не длиннее ${max} символов.`);
  return value;
}

export function optionalText(raw: unknown, max: number, label: string): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') throw new LmsError(`Поле «${label}» должно быть текстом.`);
  const value = raw.trim();
  if (value.length > max) throw new LmsError(`Поле «${label}» — не длиннее ${max} символов.`);
  return value;
}

export interface Course {
  id: string;
  orgId: string;
  ownerId: string;
  title: string;
  subject: string;
  /** Для какого класса: помощник пишет уроки под этот уровень. */
  grade: string;
  description: string;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
}

export type TopicFormat = 'lesson' | 'slides' | 'exam';
export const TOPIC_FORMATS: readonly TopicFormat[] = ['lesson', 'slides', 'exam'];
const TOPIC_FORMAT_LABELS_BY_LOCALE: Record<Locale, Record<TopicFormat, string>> = {
  ru: { lesson: 'Урок', slides: 'Слайды', exam: 'Контрольная' },
  kk: { lesson: 'Сабақ', slides: 'Слайдтар', exam: 'Бақылау жұмысы' },
  en: { lesson: 'Lesson', slides: 'Slides', exam: 'Test' },
};
const TOPIC_FORMAT_HINTS_BY_LOCALE: Record<Locale, Record<TopicFormat, string>> = {
  ru: {
    lesson: 'Лента блоков сверху вниз — ученик идёт в своём темпе.',
    slides: 'Один блок на экран, стрелки листают — для проектора и объяснения у доски.',
    exam: 'С таймером: время идёт с нажатия «Начать», баллы и разбор — после завершения.',
  },
  kk: {
    lesson: 'Блоктар жоғарыдан төмен тізіледі — оқушы өз қарқынымен жүреді.',
    slides: 'Бір экранда бір блок, көрсеткілермен парақталады — проектор мен тақта алдында түсіндіруге.',
    exam: 'Таймермен: уақыт «Бастау» басылғаннан басталады, ұпайлар мен талдау — аяқталғаннан кейін.',
  },
  en: {
    lesson: 'Blocks in a single feed — students go at their own pace.',
    slides: 'One block per screen, arrows to page through — for a projector and explaining at the board.',
    exam: 'Timed: the clock starts when “Start” is pressed; points and review come after finishing.',
  },
};
export const TOPIC_FORMAT_LABELS: Record<TopicFormat, string> = TOPIC_FORMAT_LABELS_BY_LOCALE.ru;
export const TOPIC_FORMAT_HINTS: Record<TopicFormat, string> = TOPIC_FORMAT_HINTS_BY_LOCALE.ru;
export function topicFormatLabels(locale: Locale = 'ru'): Record<TopicFormat, string> {
  return TOPIC_FORMAT_LABELS_BY_LOCALE[locale] ?? TOPIC_FORMAT_LABELS_BY_LOCALE.ru;
}
export function topicFormatHints(locale: Locale = 'ru'): Record<TopicFormat, string> {
  return TOPIC_FORMAT_HINTS_BY_LOCALE[locale] ?? TOPIC_FORMAT_HINTS_BY_LOCALE.ru;
}

export interface Topic {
  id: string;
  courseId: string;
  position: number;
  title: string;
  format: TopicFormat;
  /** Только для контрольной: минут на работу. null — без ограничения. */
  timeLimitMin: number | null;
  /** Срок сдачи темы. null — без срока. */
  dueAt: string | null;
}
