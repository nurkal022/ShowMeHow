import { LABS } from '@/lib/labs';
import {
  newOptionId, type AssignmentPayload, type AssignmentType, type ChoiceOption,
} from '@/lib/lms/block-schema';

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
