/**
 * Общие типы и пределы курсов. Модуль чистый: его импортируют и роуты,
 * и клиентские редакторы, поэтому здесь нет ни базы, ни node-модулей.
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
export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'черновик',
  published: 'опубликован',
  archived: 'в архиве',
};

export function isCourseStatus(v: unknown): v is CourseStatus {
  return typeof v === 'string' && (COURSE_STATUSES as readonly string[]).includes(v);
}

export type SubmissionStatus = 'draft' | 'submitted' | 'returned' | 'graded';
/** Состояние ответа с точки зрения журнала: 'none' — строки ещё нет. */
export type AnswerState = SubmissionStatus | 'none';
export const ANSWER_STATE_LABELS: Record<AnswerState, string> = {
  none: 'не начато',
  draft: 'черновик',
  submitted: 'сдано',
  returned: 'возвращено',
  graded: 'проверено',
};

/** Пределы длины из спецификации (§8) и соседние, которые спецификация не назвала. */
export const LIMITS = {
  title: 200,
  subject: 60,
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
  description: string;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
}

export type TopicFormat = 'lesson' | 'slides' | 'exam';
export const TOPIC_FORMATS: readonly TopicFormat[] = ['lesson', 'slides', 'exam'];
export const TOPIC_FORMAT_LABELS: Record<TopicFormat, string> = { lesson: 'Урок', slides: 'Слайды', exam: 'Контрольная' };
export const TOPIC_FORMAT_HINTS: Record<TopicFormat, string> = {
  lesson: 'Лента блоков сверху вниз — ученик идёт в своём темпе.',
  slides: 'Один блок на экран, стрелки листают — для проектора и объяснения у доски.',
  exam: 'С таймером: время идёт с нажатия «Начать», баллы и разбор — после завершения.',
};

export interface Topic {
  id: string;
  courseId: string;
  position: number;
  title: string;
  format: TopicFormat;
  /** Только для контрольной: минут на работу. null — без ограничения. */
  timeLimitMin: number | null;
}
