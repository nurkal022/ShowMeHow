import type {
  AssignmentPayload, AssignmentSpec, AssignmentType, StudentAssignmentSpec,
} from './block-schema';
import { checkTargets, sanitizeControls, simScore, type SimHint } from './sim-state';
import { LIMITS, LmsError, type AnswerState, type SubmissionStatus } from './types';

/**
 * Ответы учеников: санация, автопроверка и правила сдачи. Модуль чистый —
 * форма ответа зовёт те же функции, что и сервер.
 */

export type Answer =
  | { type: 'choice'; selected: string[] }
  | { type: 'number'; value: string }
  | { type: 'text'; text: string }
  /** hints дописывает сервер при сдаче, если учитель разрешил подсказки; от клиента они не принимаются. */
  | { type: 'sim_state'; controls: Record<string, number>; capturedAt: string; hints?: SimHint[] };

/** Автосохранение черновика текстового ответа. */
export const AUTOSAVE_MS = 5000;

export function emptyAnswer(spec: { type: AssignmentType }): Answer {
  if (spec.type === 'choice') return { type: 'choice', selected: [] };
  if (spec.type === 'number') return { type: 'number', value: '' };
  if (spec.type === 'sim_state') return { type: 'sim_state', controls: {}, capturedAt: '' };
  return { type: 'text', text: '' };
}

const MISMATCH = 'Ответ не подходит к заданию.';

export function sanitizeAnswer(spec: AssignmentSpec | StudentAssignmentSpec, raw: unknown): Answer {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new LmsError(MISMATCH);
  const a = raw as Record<string, unknown>;
  if (a.type !== spec.type) throw new LmsError(MISMATCH);
  if (spec.type === 'choice') {
    if (!Array.isArray(a.selected) || a.selected.some((s) => typeof s !== 'string')) throw new LmsError(MISMATCH);
    const ids = new Set(spec.options.map((o: { id: string }) => o.id));
    const selected = [...new Set(a.selected as string[])];
    if (selected.some((id) => !ids.has(id))) throw new LmsError('Выбран вариант, которого нет в задании.');
    if (!spec.multiple && selected.length > 1) {
      throw new LmsError('В этом задании можно выбрать только один вариант.');
    }
    return { type: 'choice', selected };
  }
  if (spec.type === 'number') {
    if (typeof a.value !== 'string') throw new LmsError(MISMATCH);
    const value = a.value.trim();
    if (value.length > LIMITS.numberAnswer) {
      throw new LmsError(`Число — не длиннее ${LIMITS.numberAnswer} символов.`);
    }
    return { type: 'number', value };
  }
  if (spec.type === 'sim_state') {
    const known = spec.targets ? spec.targets.map((t: { name: string }) => t.name) : null;
    const at = typeof a.capturedAt === 'string' ? Date.parse(a.capturedAt) : NaN;
    return {
      type: 'sim_state', controls: sanitizeControls(a.controls, known),
      capturedAt: Number.isFinite(at) ? new Date(at).toISOString() : new Date().toISOString(),
    };
  }
  if (typeof a.text !== 'string') throw new LmsError(MISMATCH);
  if (a.text.length > LIMITS.textAnswer) {
    throw new LmsError(`Ответ — не длиннее ${LIMITS.textAnswer} символов.`);
  }
  return { type: 'text', text: a.text };
}

/** «1 000,5» → 1000.5; всё, что не число целиком, — null. */
export function parseNumber(value: string): number | null {
  const v = value.replace(/\s/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isAnswerComplete(a: Answer): boolean {
  if (a.type === 'choice') return a.selected.length > 0;
  if (a.type === 'number') return parseNumber(a.value) !== null;
  // Состояние снимается кнопкой «Сдать»: пустым оно бывает, только если мост ничего не отдал.
  if (a.type === 'sim_state') return Object.keys(a.controls).length > 0;
  return a.text.trim().length > 0;
}

// Запас на двоичное округление: 0.1 + 0.2 не должно проваливать допуск.
const EPS = 1e-9;

/** null — проверяет учитель (развёрнутый ответ). */
export function autoScore(payload: AssignmentPayload, answer: Answer): number | null {
  const spec = payload.spec;
  if (spec.type === 'text') return null;
  if (spec.type === 'choice' && answer.type === 'choice') {
    const right = spec.options.filter((o) => o.correct).map((o) => o.id).sort();
    const given = [...answer.selected].sort();
    const same = right.length === given.length && right.every((id, i) => id === given[i]);
    return same ? payload.points : 0;
  }
  if (spec.type === 'number' && answer.type === 'number') {
    const n = parseNumber(answer.value);
    if (n === null) return 0;
    const slack = spec.tolerance + EPS * Math.max(1, Math.abs(spec.answer));
    return Math.abs(n - spec.answer) <= slack ? payload.points : 0;
  }
  if (spec.type === 'sim_state' && answer.type === 'sim_state') {
    return simScore(payload.points, checkTargets(spec.targets, answer.controls));
  }
  return 0;
}

/** Ответ для записи в базу: к состоянию симуляции дописываются подсказки, если они разрешены. */
export function withHints(payload: AssignmentPayload, answer: Answer): Answer {
  if (payload.spec.type !== 'sim_state' || answer.type !== 'sim_state') return answer;
  const { hints: _drop, ...rest } = answer;
  void _drop;
  return payload.spec.showHints ? { ...rest, hints: checkTargets(payload.spec.targets, answer.controls) } : rest;
}

export function canSaveDraft(state: AnswerState): boolean {
  return state === 'none' || state === 'draft' || state === 'returned';
}

export function canSubmit(state: AnswerState, allowRetry: boolean): boolean {
  return canSaveDraft(state) || allowRetry;
}

export function parseScore(raw: unknown, max: number): number {
  const n = typeof raw === 'number' ? raw
    : typeof raw === 'string' ? parseNumber(raw) : null;
  if (n === null || !Number.isFinite(n) || n < 0 || n > max) {
    throw new LmsError(`Балл — число от 0 до ${max}.`);
  }
  return Math.round(n * 100) / 100;
}

export interface SubmissionLike {
  status: SubmissionStatus;
  answer: Answer | null;
  score: number | null;
  comment: string | null;
  submittedAt: string | null;
}

/** Что уходит ученику: балл — только после проверки, служебных полей нет. */
export type StudentSubmission = SubmissionLike;

export function toStudentSubmission(s: SubmissionLike | null | undefined): StudentSubmission | null {
  if (!s) return null;
  return {
    status: s.status,
    answer: s.answer,
    score: s.status === 'graded' ? s.score : null,
    comment: s.comment,
    submittedAt: s.submittedAt,
  };
}
