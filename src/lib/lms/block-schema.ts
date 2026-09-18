import { LABS } from '../labs';
import { LIMITS, LmsError, optionalText, requireText } from './types';

/**
 * Что лежит в blocks.payload. Санация по белому списку, как у настроек
 * организации: неизвестные поля в базу не попадают. Модуль чистый — его
 * импортируют клиентские редакторы. Ученику задание отдаётся только через
 * toStudentBody: правильных ответов в нём нет.
 */

export type BlockKind = 'text' | 'simulation' | 'lab' | 'assignment';
export const BLOCK_KINDS: readonly BlockKind[] = ['text', 'simulation', 'lab', 'assignment'];
export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  text: 'Текст',
  simulation: 'Тренажёр',
  lab: 'Лаборатория',
  assignment: 'Задание',
};

export function isBlockKind(v: unknown): v is BlockKind {
  return typeof v === 'string' && (BLOCK_KINDS as readonly string[]).includes(v);
}

export interface TextPayload { title: string; body: string }
export interface SimulationPayload { simulationId: string | null; caption: string }
export interface LabPayload { slug: string; caption: string }
export type Stand = { kind: 'simulation'; simulationId: string } | { kind: 'lab'; slug: string } | null;
export interface ChoiceOption { id: string; text: string; correct: boolean }

export type AssignmentSpec =
  | { type: 'choice'; multiple: boolean; options: ChoiceOption[] }
  | { type: 'number'; answer: number; tolerance: number; unit: string }
  | { type: 'text' };
export type AssignmentType = AssignmentSpec['type'];
export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  choice: 'Выбор варианта',
  number: 'Число',
  text: 'Развёрнутый ответ',
};

export interface AssignmentPayload {
  prompt: string;
  points: number;
  stand: Stand;
  allowRetry: boolean;
  spec: AssignmentSpec;
}

export const DEFAULT_POINTS = 10;

export type BlockBody =
  | { kind: 'text'; payload: TextPayload }
  | { kind: 'simulation'; payload: SimulationPayload }
  | { kind: 'lab'; payload: LabPayload }
  | { kind: 'assignment'; payload: AssignmentPayload };

export type StudentAssignmentSpec =
  | { type: 'choice'; multiple: boolean; options: { id: string; text: string }[] }
  | { type: 'number'; unit: string }
  | { type: 'text' };

export interface StudentAssignmentPayload {
  prompt: string;
  points: number;
  stand: Stand;
  allowRetry: boolean;
  spec: StudentAssignmentSpec;
}

export type StudentBlockBody =
  | Exclude<BlockBody, { kind: 'assignment' }>
  | { kind: 'assignment'; payload: StudentAssignmentPayload };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTION_ID_RE = /^[a-z0-9]{1,16}$/;
const LAB_SLUGS = new Set(LABS.map((l) => l.slug));

export function defaultBody(kind: BlockKind): BlockBody {
  switch (kind) {
    case 'text':
      return { kind, payload: { title: '', body: '' } };
    case 'simulation':
      return { kind, payload: { simulationId: null, caption: '' } };
    case 'lab':
      return { kind, payload: { slug: LABS[0].slug, caption: '' } };
    case 'assignment':
      return { kind, payload: {
        prompt: 'Новое задание', points: DEFAULT_POINTS, stand: null, allowRetry: false, spec: { type: 'text' },
      } };
  }
}

function obj(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new LmsError('Некорректные данные блока.');
  }
  return raw as Record<string, unknown>;
}

/** Число из формы: принимает и строку с запятой. */
function finite(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sanitizeStand(raw: unknown): Stand {
  if (raw === null || raw === undefined) return null;
  const s = obj(raw);
  if (s.kind === 'simulation' && typeof s.simulationId === 'string' && UUID_RE.test(s.simulationId)) {
    return { kind: 'simulation', simulationId: s.simulationId.toLowerCase() };
  }
  if (s.kind === 'lab' && typeof s.slug === 'string' && LAB_SLUGS.has(s.slug)) {
    return { kind: 'lab', slug: s.slug };
  }
  throw new LmsError('Стенд задания указан неверно.');
}

function sanitizeOptions(raw: unknown, multiple: boolean): ChoiceOption[] {
  if (!Array.isArray(raw) || raw.length < LIMITS.minOptions || raw.length > LIMITS.maxOptions) {
    throw new LmsError(`Вариантов должно быть от ${LIMITS.minOptions} до ${LIMITS.maxOptions}.`);
  }
  const used = new Set<string>();
  const options = raw.map((item, i): ChoiceOption => {
    const o = obj(item);
    const text = requireText(o.text, LIMITS.option, `Вариант ${i + 1}`);
    let id = typeof o.id === 'string' && OPTION_ID_RE.test(o.id) ? o.id : `o${i + 1}`;
    let k = i + 1;
    while (used.has(id)) id = `o${++k}`;
    used.add(id);
    return { id, text, correct: o.correct === true };
  });
  const correct = options.filter((o) => o.correct).length;
  if (correct === 0) throw new LmsError('Отметьте хотя бы один правильный вариант.');
  if (!multiple && correct > 1) {
    throw new LmsError('В задании с одним ответом правильный вариант должен быть один.');
  }
  return options;
}

function sanitizeSpec(raw: unknown): AssignmentSpec {
  const s = obj(raw);
  if (s.type === 'choice') {
    const multiple = s.multiple === true;
    return { type: 'choice', multiple, options: sanitizeOptions(s.options, multiple) };
  }
  if (s.type === 'number') {
    const answer = finite(s.answer);
    if (answer === null) throw new LmsError('Укажите правильное число.');
    const tolerance = s.tolerance === undefined || s.tolerance === '' ? 0 : finite(s.tolerance);
    if (tolerance === null || tolerance < 0) throw new LmsError('Допуск — неотрицательное число.');
    return { type: 'number', answer, tolerance, unit: optionalText(s.unit, LIMITS.unit, 'Единицы') };
  }
  if (s.type === 'text') return { type: 'text' };
  throw new LmsError('Тип задания — выбор, число или развёрнутый ответ.');
}

export function sanitizeBlockBody(kind: BlockKind, raw: unknown): BlockBody {
  const p = obj(raw);
  switch (kind) {
    case 'text':
      return { kind, payload: {
        title: optionalText(p.title, LIMITS.title, 'Заголовок'),
        body: optionalText(p.body, LIMITS.text, 'Текст'),
      } };
    case 'simulation': {
      const id = p.simulationId;
      if (id !== null && id !== undefined && (typeof id !== 'string' || !UUID_RE.test(id))) {
        throw new LmsError('Тренажёр указан неверно.');
      }
      return { kind, payload: {
        simulationId: typeof id === 'string' ? id.toLowerCase() : null,
        caption: optionalText(p.caption, LIMITS.caption, 'Подпись'),
      } };
    }
    case 'lab':
      if (typeof p.slug !== 'string' || !LAB_SLUGS.has(p.slug)) {
        throw new LmsError('Выберите лабораторию из списка.');
      }
      return { kind, payload: { slug: p.slug, caption: optionalText(p.caption, LIMITS.caption, 'Подпись') } };
    case 'assignment': {
      const points = p.points === undefined ? DEFAULT_POINTS : p.points;
      if (typeof points !== 'number' || !Number.isInteger(points) || points < 0 || points > LIMITS.maxPoints) {
        throw new LmsError(`Баллы — целое число от 0 до ${LIMITS.maxPoints}.`);
      }
      return { kind, payload: {
        prompt: requireText(p.prompt, LIMITS.text, 'Текст задания'),
        points,
        stand: sanitizeStand(p.stand),
        allowRetry: p.allowRetry === true,
        spec: sanitizeSpec(p.spec),
      } };
    }
  }
}

/** Тело из базы: испорченная строка не должна ронять страницу — показываем блок по умолчанию. */
export function bodyFromRow(kind: string, payload: unknown): BlockBody {
  if (!isBlockKind(kind)) return defaultBody('text');
  try {
    return sanitizeBlockBody(kind, payload);
  } catch {
    return defaultBody(kind);
  }
}

export function toStudentBody(body: BlockBody): StudentBlockBody {
  if (body.kind !== 'assignment') return body;
  const { spec, ...rest } = body.payload;
  let safe: StudentAssignmentSpec;
  if (spec.type === 'choice') {
    safe = { type: 'choice', multiple: spec.multiple, options: spec.options.map(({ id, text }) => ({ id, text })) };
  } else if (spec.type === 'number') {
    safe = { type: 'number', unit: spec.unit };
  } else {
    safe = { type: 'text' };
  }
  return { kind: 'assignment', payload: { ...rest, spec: safe } };
}

/** То, от чего зависит балл: формулировки сюда не входят. */
function answerKey(p: AssignmentPayload): string {
  const s = p.spec;
  const key = s.type === 'choice'
    ? { type: s.type, multiple: s.multiple, ids: s.options.map((o) => o.id),
      correct: s.options.filter((o) => o.correct).map((o) => o.id) }
    : s.type === 'number'
      ? { type: s.type, answer: s.answer, tolerance: s.tolerance }
      : { type: s.type };
  return JSON.stringify({ points: p.points, key });
}

export function answerKeyChanged(before: AssignmentPayload, after: AssignmentPayload): boolean {
  return answerKey(before) !== answerKey(after);
}

export function simulationIdsOf(body: BlockBody | StudentBlockBody): string[] {
  if (body.kind === 'simulation') return body.payload.simulationId ? [body.payload.simulationId] : [];
  if (body.kind === 'assignment' && body.payload.stand?.kind === 'simulation') {
    return [body.payload.stand.simulationId];
  }
  return [];
}

/** Вставка симуляции: в блок «Тренажёр» или стендом в задание. */
export function withSimulation(body: BlockBody, simulationId: string): BlockBody {
  if (body.kind === 'simulation') return { kind: 'simulation', payload: { ...body.payload, simulationId } };
  if (body.kind === 'assignment') {
    return { kind: 'assignment', payload: { ...body.payload, stand: { kind: 'simulation', simulationId } } };
  }
  throw new LmsError('Тренажёр можно вставить только в блок «Тренажёр» или в стенд задания.');
}

/** Короткая подпись задания для таблиц и журнала. */
export function assignmentTitle(prompt: string): string {
  const flat = prompt.replace(/[*#]/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/** id нового варианта в редакторе; сервер всё равно проверит его по OPTION_ID_RE. */
export function newOptionId(): string {
  return Math.random().toString(36).slice(2, 10) || 'o1';
}
