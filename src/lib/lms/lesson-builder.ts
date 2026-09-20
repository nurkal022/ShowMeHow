/**
 * Конструктор урока с помощником: шаблоны и «слоты» — из чего собирается урок и в каком порядке.
 * Модуль чистый: его зовут и форма конструктора, и сервер. Текстовые слоты пишет модель,
 * тренажёр, видео и лабораторию сервер ставит сам: выдумать их модель не может.
 */

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

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  mix: 'Разные типы', choice: 'Выбор ответа', number: 'Число', short: 'Короткий ответ', gaps: 'Пропуски', match: 'Сопоставление', order: 'Порядок',
};

export type LessonLevel = 'basic' | 'standard' | 'advanced';
export const LEVEL_LABELS: Record<LessonLevel, string> = { basic: 'Базовый', standard: 'Стандарт', advanced: 'Углублённый' };

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
