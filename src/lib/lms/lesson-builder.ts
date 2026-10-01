/**
 * Конструктор урока с помощником: шаблоны и «слоты» — из чего собирается урок и в каком порядке.
 * Модуль чистый: его зовут и форма конструктора, и сервер. Текстовые слоты пишет модель,
 * тренажёр, видео и лабораторию сервер ставит сам: выдумать их модель не может.
 * Подписи на языке пользователя — slotMeta(locale), taskTypeLabels(locale), levelLabels(locale),
 * templates(locale); константы SLOT_META, TASK_TYPE_LABELS, LEVEL_LABELS, TEMPLATES — русские.
 */

import type { Locale } from '@/i18n/config';

export type SlotKind =
  | 'hook' | 'explain' | 'definition' | 'formula' | 'example' | 'important' | 'summary'
  | 'tasks' | 'check' | 'essay' | 'lab_table'
  | 'simulation' | 'video' | 'lab';

export type TaskType = 'mix' | 'choice' | 'number' | 'short' | 'gaps' | 'match' | 'order';

export interface Slot { id: string; kind: SlotKind; note: string; count: number; taskType: TaskType }

export interface SlotMeta { label: string; hint: string; group: 'material' | 'practice' | 'interactive'; llm: boolean; minutes: number; counted?: boolean }

export const SLOT_META: Record<SlotKind, SlotMeta> = {
  hook: { label: 'Вовлечение', hint: 'Вопрос или ситуация из жизни, с которой начинается урок', group: 'material', llm: true, minutes: 3 },
  explain: { label: 'Объяснение', hint: 'Основной текст темы с подзаголовками и формулами', group: 'material', llm: true, minutes: 8 },
  definition: { label: 'Определение', hint: 'Ключевое понятие в рамке', group: 'material', llm: true, minutes: 2 },
  formula: { label: 'Формула', hint: 'Главная формула с подписью величин', group: 'material', llm: true, minutes: 2 },
  example: { label: 'Разобранный пример', hint: 'Задача с решением под спойлером', group: 'material', llm: true, minutes: 5, counted: true },
  important: { label: 'Важно запомнить', hint: 'Типичные ошибки и на что обратить внимание', group: 'material', llm: true, minutes: 2 },
  summary: { label: 'Итоги урока', hint: 'Короткий конспект: 3–5 пунктов', group: 'material', llm: true, minutes: 2 },
  tasks: { label: 'Задания', hint: 'Автопроверка: выбор, число, пропуски, сопоставление, порядок', group: 'practice', llm: true, minutes: 3, counted: true },
  check: { label: 'Проверь себя', hint: 'Быстрые вопросы на понимание после объяснения', group: 'practice', llm: true, minutes: 2, counted: true },
  essay: { label: 'Развёрнутый ответ', hint: 'Объяснить своими словами — с критериями и эталоном', group: 'practice', llm: true, minutes: 7 },
  lab_table: { label: 'Таблица измерений', hint: 'Лабораторная: ученик заносит результаты опыта', group: 'practice', llm: true, minutes: 10 },
  simulation: { label: 'Тренажёр', hint: 'Интерактивная симуляция из библиотеки или каталога', group: 'interactive', llm: false, minutes: 7 },
  video: { label: 'Видео', hint: 'Ролик по ссылке YouTube, VK или Rutube', group: 'interactive', llm: false, minutes: 6 },
  lab: { label: 'VR-лаборатория', hint: 'Лаборатория для очков и браузера', group: 'interactive', llm: false, minutes: 10 },
};

type SlotText = Record<SlotKind, [label: string, hint: string]>;
const SLOT_TEXT: Record<'kk' | 'en', SlotText> = {
  kk: {
    hook: ['Қызықтыру', 'Сабақ басталатын өмірлік сұрақ немесе жағдай'],
    explain: ['Түсіндіру', 'Тақырыптың негізгі мәтіні: тақырыпшалар мен формулалар'],
    definition: ['Анықтама', 'Негізгі ұғым жақтаудың ішінде'],
    formula: ['Формула', 'Негізгі формула және шамалардың түсіндірмесі'],
    example: ['Талданған мысал', 'Шешімі жасырылған есеп'],
    important: ['Есте сақтаңыз', 'Жиі кездесетін қателер және неге назар аудару керек'],
    summary: ['Сабақ қорытындысы', 'Қысқа конспект: 3–5 тармақ'],
    tasks: ['Тапсырмалар', 'Автотексеру: таңдау, сан, бос орындар, сәйкестендіру, реттілік'],
    check: ['Өзіңізді тексеріңіз', 'Түсіндіруден кейінгі түсінуге арналған жылдам сұрақтар'],
    essay: ['Толық жауап', 'Өз сөзімен түсіндіру — критерийлер мен эталонмен'],
    lab_table: ['Өлшеулер кестесі', 'Зертханалық жұмыс: оқушы тәжірибе нәтижелерін енгізеді'],
    simulation: ['Тренажер', 'Кітапханадан немесе каталогтан интерактивті симуляция'],
    video: ['Бейне', 'YouTube, VK немесе Rutube сілтемесі бойынша ролик'],
    lab: ['VR-зертхана', 'Көзілдірік пен браузерге арналған зертхана'],
  },
  en: {
    hook: ['Hook', 'A real-life question or situation to open the lesson'],
    explain: ['Explanation', 'The main text of the topic with headings and formulas'],
    definition: ['Definition', 'The key concept in a box'],
    formula: ['Formula', 'The main formula with its quantities explained'],
    example: ['Worked example', 'A problem with the solution under a spoiler'],
    important: ['Key points', 'Common mistakes and what to watch out for'],
    summary: ['Lesson summary', 'A short recap: 3–5 points'],
    tasks: ['Assignments', 'Auto-checked: choice, number, gaps, matching, ordering'],
    check: ['Check yourself', 'Quick comprehension questions after the explanation'],
    essay: ['Extended answer', 'Explain in your own words — with criteria and a model answer'],
    lab_table: ['Measurement table', 'Lab work: the student records the results of the experiment'],
    simulation: ['Simulator', 'An interactive simulation from the library or catalog'],
    video: ['Video', 'A clip from a YouTube, VK or Rutube link'],
    lab: ['VR lab', 'A lab for headsets and the browser'],
  },
};

const slotMetaCache = new Map<Locale, Record<SlotKind, SlotMeta>>();
export function slotMeta(locale: Locale = 'ru'): Record<SlotKind, SlotMeta> {
  if (locale === 'ru' || !SLOT_TEXT[locale]) return SLOT_META;
  let m = slotMetaCache.get(locale);
  if (!m) {
    const text = SLOT_TEXT[locale];
    m = Object.fromEntries((Object.keys(SLOT_META) as SlotKind[]).map((k) => [k, { ...SLOT_META[k], label: text[k][0], hint: text[k][1] }])) as Record<SlotKind, SlotMeta>;
    slotMetaCache.set(locale, m);
  }
  return m;
}

const TASK_TYPE_LABELS_BY_LOCALE: Record<Locale, Record<TaskType, string>> = {
  ru: { mix: 'Разные типы', choice: 'Выбор ответа', number: 'Число', short: 'Короткий ответ', gaps: 'Пропуски', match: 'Сопоставление', order: 'Порядок' },
  kk: { mix: 'Әртүрлі түрлер', choice: 'Жауапты таңдау', number: 'Сан', short: 'Қысқа жауап', gaps: 'Бос орындар', match: 'Сәйкестендіру', order: 'Реттілік' },
  en: { mix: 'Mixed types', choice: 'Multiple choice', number: 'Number', short: 'Short answer', gaps: 'Gaps', match: 'Matching', order: 'Ordering' },
};
export const TASK_TYPE_LABELS: Record<TaskType, string> = TASK_TYPE_LABELS_BY_LOCALE.ru;
export function taskTypeLabels(locale: Locale = 'ru'): Record<TaskType, string> {
  return TASK_TYPE_LABELS_BY_LOCALE[locale] ?? TASK_TYPE_LABELS_BY_LOCALE.ru;
}

export type LessonLevel = 'basic' | 'standard' | 'advanced';
const LEVEL_LABELS_BY_LOCALE: Record<Locale, Record<LessonLevel, string>> = {
  ru: { basic: 'Базовый', standard: 'Стандарт', advanced: 'Углублённый' },
  kk: { basic: 'Базалық', standard: 'Стандарт', advanced: 'Тереңдетілген' },
  en: { basic: 'Basic', standard: 'Standard', advanced: 'Advanced' },
};
export const LEVEL_LABELS: Record<LessonLevel, string> = LEVEL_LABELS_BY_LOCALE.ru;
export function levelLabels(locale: Locale = 'ru'): Record<LessonLevel, string> {
  return LEVEL_LABELS_BY_LOCALE[locale] ?? LEVEL_LABELS_BY_LOCALE.ru;
}

export interface LessonTemplate {
  key: string; title: string; about: string; tone: string; exam?: boolean;
  slots: { kind: SlotKind; count?: number; taskType?: TaskType }[];
}

export const TEMPLATES: LessonTemplate[] = [
  { key: 'new', title: 'Новая тема', about: 'Объяснение, формула, тренажёр, пример и задания', tone: 'indigo',
    slots: [{ kind: 'hook' }, { kind: 'explain' }, { kind: 'formula' }, { kind: 'simulation' }, { kind: 'example', count: 1 }, { kind: 'check', count: 2 }, { kind: 'tasks', count: 4 }, { kind: 'summary' }] },
  { key: 'lab', title: 'Лабораторная', about: 'Цель и теория, тренажёр-стенд, таблица измерений и вывод', tone: 'teal',
    slots: [{ kind: 'hook' }, { kind: 'explain' }, { kind: 'simulation' }, { kind: 'lab_table' }, { kind: 'essay' }, { kind: 'summary' }] },
  { key: 'practice', title: 'Практикум', about: 'Кратко теория, два разобранных примера и много задач', tone: 'amber',
    slots: [{ kind: 'formula' }, { kind: 'example', count: 2 }, { kind: 'important' }, { kind: 'tasks', count: 8, taskType: 'mix' }] },
  { key: 'review', title: 'Повторение', about: 'Конспект, ключевые идеи и задания всех типов', tone: 'blue',
    slots: [{ kind: 'summary' }, { kind: 'definition' }, { kind: 'important' }, { kind: 'check', count: 3 }, { kind: 'tasks', count: 6 }] },
  { key: 'flipped', title: 'По видео', about: 'Ролик, вопросы к нему, обсуждение и задания', tone: 'rose',
    slots: [{ kind: 'hook' }, { kind: 'video' }, { kind: 'check', count: 3 }, { kind: 'explain' }, { kind: 'tasks', count: 3 }, { kind: 'essay' }] },
  { key: 'exam', title: 'Контрольная', about: 'Задачи нарастающей сложности и одна развёрнутая', tone: 'violet', exam: true,
    slots: [{ kind: 'tasks', count: 6, taskType: 'mix' }, { kind: 'essay' }] },
  { key: 'custom', title: 'С нуля', about: 'Соберите урок из блоков сами', tone: 'gray', slots: [] },
];

const TEMPLATE_TEXT: Record<'kk' | 'en', Record<string, [title: string, about: string]>> = {
  kk: {
    new: ['Жаңа тақырып', 'Түсіндіру, формула, тренажер, мысал және тапсырмалар'],
    lab: ['Зертханалық жұмыс', 'Мақсат пен теория, тренажер-стенд, өлшеулер кестесі және қорытынды'],
    practice: ['Практикум', 'Қысқаша теория, екі талданған мысал және көп есеп'],
    review: ['Қайталау', 'Конспект, негізгі идеялар және барлық түрдегі тапсырмалар'],
    flipped: ['Бейне бойынша', 'Ролик, оған сұрақтар, талқылау және тапсырмалар'],
    exam: ['Бақылау жұмысы', 'Күрделілігі артатын есептер және бір толық жауап'],
    custom: ['Нөлден', 'Сабақты блоктардан өзіңіз құрастырыңыз'],
  },
  en: {
    new: ['New topic', 'Explanation, formula, simulator, example and assignments'],
    lab: ['Lab work', 'Goal and theory, simulator setup, measurement table and conclusion'],
    practice: ['Practice', 'Brief theory, two worked examples and many problems'],
    review: ['Review', 'Summary, key ideas and assignments of every type'],
    flipped: ['Video-based', 'A clip, questions about it, discussion and assignments'],
    exam: ['Test', 'Problems of increasing difficulty and one extended answer'],
    custom: ['From scratch', 'Build the lesson from blocks yourself'],
  },
};

/** Шаблоны с названиями на языке locale (по умолчанию русский). */
export function templates(locale: Locale = 'ru'): LessonTemplate[] {
  const text = locale === 'ru' ? undefined : TEMPLATE_TEXT[locale];
  if (!text) return TEMPLATES;
  return TEMPLATES.map((t) => (text[t.key] ? { ...t, title: text[t.key][0], about: text[t.key][1] } : t));
}

let seq = 0;
export function newSlot(kind: SlotKind, extra: Partial<Slot> = {}): Slot {
  return { id: `s${Date.now().toString(36)}${++seq}`, kind, note: '', count: SLOT_META[kind].counted ? (kind === 'tasks' ? 4 : 1) : 1, taskType: 'mix', ...extra };
}

export function slotsOf(t: LessonTemplate): Slot[] {
  return t.slots.map((s) => newSlot(s.kind, { ...(s.count ? { count: s.count } : {}), ...(s.taskType ? { taskType: s.taskType } : {}) }));
}

export function lessonMinutes(slots: Slot[]): number {
  return slots.reduce((a, s) => a + SLOT_META[s.kind].minutes * (SLOT_META[s.kind].counted ? Math.max(1, s.count) : 1), 0);
}

export interface LessonSpec {
  title: string; grade: string; level: LessonLevel; minutes: number;
  goals: string; materials: string; videoUrl: string; labSlug: string;
  exam: boolean; slots: Slot[];
}

const KINDS = Object.keys(SLOT_META) as SlotKind[];
const TASK_TYPES = Object.keys(TASK_TYPE_LABELS) as TaskType[];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Спецификация из запроса: неизвестные слоты и типы отбрасываются, числа — в разумных пределах. */
export function sanitizeLessonSpec(raw: unknown): LessonSpec {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const slots = (Array.isArray(o.slots) ? o.slots : []).slice(0, 20).flatMap((x, i): Slot[] => {
    const s = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
    if (!KINDS.includes(s.kind as SlotKind)) return [];
    const count = Number(s.count);
    return [{
      id: str(s.id, 40) || `s${i}`, kind: s.kind as SlotKind, note: str(s.note, 400),
      count: Number.isInteger(count) ? Math.max(1, Math.min(10, count)) : 1,
      taskType: TASK_TYPES.includes(s.taskType as TaskType) ? s.taskType as TaskType : 'mix',
    }];
  });
  const minutes = Number(o.minutes);
  return {
    title: str(o.title, 200), grade: str(o.grade, 40),
    level: o.level === 'basic' || o.level === 'advanced' ? o.level : 'standard',
    minutes: Number.isInteger(minutes) ? Math.max(5, Math.min(180, minutes)) : 40,
    goals: str(o.goals, 1500), materials: str(o.materials, 12000), videoUrl: str(o.videoUrl, 500), labSlug: str(o.labSlug, 40),
    exam: o.exam === true, slots,
  };
}
