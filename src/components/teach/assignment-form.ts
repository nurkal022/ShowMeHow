import { LABS } from '@/lib/labs';
import {
  newOptionId, type AssignmentPayload, type AssignmentType, type ChoiceOption,
} from '@/lib/lms/block-schema';
import { LIMITS } from '@/lib/lms/types';

/**
 * Состояние формы задания: числа — строками, как в полях ввода. Проверяет всё
 * сервер (sanitizeBlockBody), форма только собирает тело запроса.
 */

export interface AssignmentForm {
  prompt: string;
  points: string;
  allowRetry: boolean;
  standKind: 'none' | 'simulation' | 'lab';
  standSimulationId: string | null;
  standTitle: string | null;
  standLab: string;
  type: AssignmentType;
  multiple: boolean;
  options: ChoiceOption[];
  answer: string;
  tolerance: string;
  unit: string;
}

export function blankOptions(): ChoiceOption[] {
  return [
    { id: newOptionId(), text: '', correct: true },
    { id: newOptionId(), text: '', correct: false },
  ];
}

export function toAssignmentForm(p: AssignmentPayload, standTitle: string | null): AssignmentForm {
  const s = p.spec;
  return {
    prompt: p.prompt,
    points: String(p.points),
    allowRetry: p.allowRetry,
    standKind: p.stand ? p.stand.kind : 'none',
    standSimulationId: p.stand?.kind === 'simulation' ? p.stand.simulationId : null,
    standTitle,
    standLab: p.stand?.kind === 'lab' ? p.stand.slug : LABS[0].slug,
    type: s.type,
    multiple: s.type === 'choice' ? s.multiple : false,
    options: s.type === 'choice' ? s.options : blankOptions(),
    answer: s.type === 'number' ? String(s.answer) : '',
    tolerance: s.type === 'number' ? String(s.tolerance) : '0',
    unit: s.type === 'number' ? s.unit : '',
  };
}

export function fromAssignmentForm(f: AssignmentForm): Record<string, unknown> {
  const stand = f.standKind === 'lab'
    ? { kind: 'lab', slug: f.standLab }
    : f.standKind === 'simulation' && f.standSimulationId
      ? { kind: 'simulation', simulationId: f.standSimulationId }
      : null;
  const spec = f.type === 'choice'
    ? { type: 'choice', multiple: f.multiple, options: f.options }
    : f.type === 'number'
      ? { type: 'number', answer: f.answer, tolerance: f.tolerance, unit: f.unit }
      : { type: 'text' };
  // Пустое поле баллов — не ноль: сервер ответит понятной ошибкой.
  const points = f.points.trim() === '' ? Number.NaN : Number(f.points);
  return { prompt: f.prompt, points, allowRetry: f.allowRetry, stand, spec };
}

export function markCorrect(options: ChoiceOption[], id: string, multiple: boolean): ChoiceOption[] {
  return options.map((o) => {
    if (multiple) return o.id === id ? { ...o, correct: !o.correct } : o;
    return { ...o, correct: o.id === id };
  });
}

/** Число из поля ввода: запятая и точка равноправны. */
function parseNumber(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type AssignmentErrors = Partial<Record<
  'prompt' | 'options' | 'correct' | 'answer' | 'tolerance' | 'points' | 'stand', string>>;

/**
 * Проверка до отправки: те же правила, что на сервере, но ошибка встаёт рядом
 * со своим полем. Сервер всё равно проверит тело ещё раз.
 */
export function validateAssignmentForm(f: AssignmentForm): AssignmentErrors {
  const errors: AssignmentErrors = {};
  if (!f.prompt.trim()) errors.prompt = 'Напишите текст задания: что нужно сделать ученику.';
  if (f.type === 'choice') {
    if (f.options.some((o) => !o.text.trim())) errors.options = 'Заполните текст каждого варианта или удалите пустые.';
    const correct = f.options.filter((o) => o.correct).length;
    if (correct === 0) errors.correct = 'Отметьте хотя бы один правильный вариант.';
    else if (!f.multiple && correct > 1) errors.correct = 'В задании с одним ответом правильный вариант должен быть один.';
  }
  if (f.type === 'number') {
    if (parseNumber(f.answer) === null) errors.answer = 'Укажите правильное число, например 9,8.';
    const tolerance = f.tolerance.trim() === '' ? 0 : parseNumber(f.tolerance);
    if (tolerance === null || tolerance < 0) errors.tolerance = 'Допуск — неотрицательное число.';
  }
  const points = parseNumber(f.points);
  if (points === null || !Number.isInteger(points) || points < 0 || points > LIMITS.maxPoints) {
    errors.points = `Баллы — целое число от 0 до ${LIMITS.maxPoints}.`;
  }
  if (f.standKind === 'simulation' && !f.standSimulationId) {
    errors.stand = 'Выберите тренажёр для стенда или уберите стенд.';
  }
  return errors;
}
