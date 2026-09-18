import { LABS } from '@/lib/labs';
import {
  GAP_LIMITS, newOptionId, parseGaps,
  type AssignmentPayload, type AssignmentType, type ChoiceOption, type MatchPair, type OrderItem, type TableColumn,
} from '@/lib/lms/block-schema';
import { SIM_LIMITS } from '@/lib/lms/sim-state';
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
  shuffle: boolean;
  options: ChoiceOption[];
  /** Короткий ответ: допустимые написания. */
  accepted: string[];
  /** Пропуски: текст с {{ответами}}. */
  gapsText: string;
  pairs: MatchPair[];
  items: OrderItem[];
  columns: TableColumn[];
  minRows: string;
  explanation: string;
  rubric: { id: string; label: string; points: string }[];
  answer: string;
  tolerance: string;
  unit: string;
  /** «Состояние симуляции»: симуляция лежит в standSimulationId, цель — в строках. */
  simTargets: SimTargetRow[];
  showHints: boolean;
}

export interface SimTargetRow { name: string; label: string; include: boolean; value: string; tolerance: string }

export function blankOptions(): ChoiceOption[] {
  return [
    { id: newOptionId(), text: '', correct: true },
    { id: newOptionId(), text: '', correct: false },
  ];
}

export const blankPairs = (): MatchPair[] => [0, 1, 2].map(() => ({ id: newOptionId(), left: '', rightId: newOptionId(), right: '' }));
export const blankItems = (): OrderItem[] => [0, 1, 2].map(() => ({ id: newOptionId(), text: '' }));

export function toAssignmentForm(p: AssignmentPayload, standTitle: string | null): AssignmentForm {
  const s = p.spec;
  return {
    prompt: p.prompt,
    points: String(p.points),
    allowRetry: p.allowRetry,
    standKind: p.stand ? p.stand.kind : 'none',
    standSimulationId: s.type === 'sim_state' ? s.simulationId
      : p.stand?.kind === 'simulation' ? p.stand.simulationId : null,
    standTitle,
    standLab: p.stand?.kind === 'lab' ? p.stand.slug : LABS[0].slug,
    type: s.type,
    multiple: s.type === 'choice' ? s.multiple : false,
    shuffle: s.type === 'choice' ? s.shuffle : false,
    options: s.type === 'choice' ? s.options : blankOptions(),
    accepted: s.type === 'short' ? s.accepted : [''],
    gapsText: s.type === 'gaps' ? s.text : '',
    pairs: s.type === 'match' ? s.pairs : blankPairs(),
    items: s.type === 'order' ? s.items : blankItems(),
    columns: s.type === 'table' ? s.columns : [{ id: newOptionId(), label: '', unit: '' }, { id: newOptionId(), label: '', unit: '' }],
    minRows: s.type === 'table' ? String(s.minRows) : '5',
    explanation: p.explanation,
    rubric: p.rubric.map((r) => ({ ...r, points: String(r.points) })),
    answer: s.type === 'number' ? String(s.answer) : '',
    tolerance: s.type === 'number' ? String(s.tolerance) : '0',
    unit: s.type === 'number' ? s.unit : '',
    simTargets: s.type === 'sim_state'
      ? s.targets.map((t) => ({ name: t.name, label: t.label, include: true, value: String(t.value), tolerance: String(t.tolerance) }))
      : [],
    showHints: s.type === 'sim_state' ? s.showHints : true,
  };
}

export function fromAssignmentForm(f: AssignmentForm): Record<string, unknown> {
  const stand = f.standKind === 'lab'
    ? { kind: 'lab', slug: f.standLab }
    : f.standKind === 'simulation' && f.standSimulationId
      ? { kind: 'simulation', simulationId: f.standSimulationId }
      : null;
  const spec = f.type === 'choice'
    ? { type: 'choice', multiple: f.multiple, shuffle: f.shuffle, options: f.options }
    : f.type === 'short' ? { type: 'short', accepted: f.accepted }
    : f.type === 'gaps' ? { type: 'gaps', text: f.gapsText }
    : f.type === 'match' ? { type: 'match', pairs: f.pairs }
    : f.type === 'order' ? { type: 'order', items: f.items }
    : f.type === 'table' ? { type: 'table', columns: f.columns, minRows: f.minRows }
    : f.type === 'number'
      ? { type: 'number', answer: f.answer, tolerance: f.tolerance, unit: f.unit }
      : f.type === 'sim_state'
        ? { type: 'sim_state', simulationId: f.standSimulationId, showHints: f.showHints,
          targets: f.simTargets.filter((t) => t.include)
            .map(({ name, label, value, tolerance }) => ({ name, label, value, tolerance })) }
        : { type: 'text' };
  // Пустое поле баллов — не ноль: сервер ответит понятной ошибкой.
  const points = f.points.trim() === '' ? Number.NaN : Number(f.points);
  return { prompt: f.prompt, points, allowRetry: f.allowRetry, explanation: f.explanation, stand, spec,
    rubric: f.type === 'text' || f.type === 'table' ? f.rubric.filter((r) => r.label.trim()) : [] };
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
  'prompt' | 'options' | 'correct' | 'accepted' | 'gaps' | 'pairs' | 'items' | 'columns' | 'answer' | 'tolerance' | 'points' | 'stand' | 'targets', string>>;

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
  if (f.type === 'short' && !f.accepted.some((a) => a.trim())) errors.accepted = 'Укажите хотя бы один правильный ответ.';
  if (f.type === 'gaps') {
    const { answers } = parseGaps(f.gapsText);
    if (answers.length === 0) errors.gaps = 'Выделите слово и нажмите «Сделать пропуском» — или напишите {{слово}} вручную.';
    else if (answers.length > GAP_LIMITS.maxGaps) errors.gaps = `Пропусков — не больше ${GAP_LIMITS.maxGaps}.`;
    else if (answers.some((a) => a.length === 0)) errors.gaps = 'В каждом пропуске должен быть ответ.';
  }
  if (f.type === 'match' && f.pairs.some((p) => !p.left.trim() || !p.right.trim())) errors.pairs = 'Заполните обе стороны каждой пары или удалите пустые.';
  if (f.type === 'order' && f.items.some((i) => !i.text.trim())) errors.items = 'Заполните каждый шаг или удалите пустые.';
  if (f.type === 'table' && f.columns.some((c) => !c.label.trim())) errors.columns = 'Назовите каждый столбец или удалите лишние.';
  if (f.type === 'number') {
    if (parseNumber(f.answer) === null) errors.answer = 'Укажите правильное число, например 9,8.';
    const tolerance = f.tolerance.trim() === '' ? 0 : parseNumber(f.tolerance);
    if (tolerance === null || tolerance < 0) errors.tolerance = 'Допуск — неотрицательное число.';
  }
  const points = parseNumber(f.points);
  if (points === null || !Number.isInteger(points) || points < 0 || points > LIMITS.maxPoints) {
    errors.points = `Баллы — целое число от 0 до ${LIMITS.maxPoints}.`;
  }
  if (f.type === 'sim_state') {
    const picked = f.simTargets.filter((t) => t.include);
    if (!f.standSimulationId) errors.stand = 'Выберите симуляцию, в которой ученик будет добиваться цели.';
    else if (picked.length === 0) errors.targets = 'Нажмите «Зафиксировать как цель» и отметьте хотя бы один параметр.';
    else if (picked.length > SIM_LIMITS.maxTargets) errors.targets = `Параметров в цели — не больше ${SIM_LIMITS.maxTargets}.`;
    else if (picked.some((t) => parseNumber(t.value) === null)) errors.targets = 'У каждого отмеченного параметра должно быть число.';
    else if (picked.some((t) => { const n = t.tolerance.trim() === '' ? 0 : parseNumber(t.tolerance); return n === null || n < 0; })) {
      errors.targets = 'Допуск — неотрицательное число.';
    }
  } else if (f.standKind === 'simulation' && !f.standSimulationId) {
    errors.stand = 'Выберите тренажёр для стенда или уберите стенд.';
  }
  return errors;
}
