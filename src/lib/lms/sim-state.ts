import { LmsError } from './types';

/**
 * Задание «добейся состояния в симуляции»: цель — значения контролов с допуском.
 * Модуль чистый: им пользуются и сервер, и редактор, и форма ученика.
 * Состояние присылает браузер ученика — для текущего контроля этого достаточно.
 */

export interface SimTarget { name: string; label: string; value: number; tolerance: number }
export interface SimHint { name: string; label: string; matched: boolean }

/** Контрол, как его отдаёт мост в harness (window.__smh.controls()). */
export interface BridgeControl {
  name: string; label: string; kind: string;
  min: number | null; max: number | null; value: number;
}

export interface BridgeReply {
  ok: boolean;
  hasExpose: boolean;
  reason?: string;
  controls: BridgeControl[];
}

export const SIM_LIMITS = { maxTargets: 12, name: 80, label: 120, maxAnswerControls: 40 } as const;

const EPS = 1e-9;

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Ответ моста → только числовые контролы (переключатель — 0/1); кнопки и нечисловые списки отпадают. */
export function parseBridgeReply(raw: unknown): BridgeReply {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(d.controls) ? d.controls : [];
  const seen = new Set<string>();
  const controls: BridgeControl[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.name !== 'string' || !c.name || c.name.length > SIM_LIMITS.name || seen.has(c.name)) continue;
    if (c.kind === 'button') continue;
    const value = num(c.value);
    if (value === null) continue;
    seen.add(c.name);
    controls.push({
      name: c.name,
      label: (typeof c.label === 'string' && c.label ? c.label : c.name).slice(0, SIM_LIMITS.label),
      kind: typeof c.kind === 'string' ? c.kind : 'slider',
      min: typeof c.min === 'number' && Number.isFinite(c.min) ? c.min : null,
      max: typeof c.max === 'number' && Number.isFinite(c.max) ? c.max : null,
      value,
    });
    if (controls.length >= SIM_LIMITS.maxAnswerControls) break;
  }
  const ok = d.ok === true && controls.length > 0;
  return { ok, hasExpose: d.hasExpose === true, reason: typeof d.reason === 'string' ? d.reason : undefined, controls };
}

/** Допуск по умолчанию: 5% диапазона ползунка, 0 — для переключателей и всего без диапазона. */
export function defaultTolerance(c: Pick<BridgeControl, 'kind' | 'min' | 'max'>): number {
  if (c.kind !== 'slider' && c.kind !== 'speed') return 0;
  if (c.min === null || c.max === null || c.max <= c.min) return 0;
  return Number(((c.max - c.min) * 0.05).toPrecision(3));
}

export function sanitizeTargets(raw: unknown): SimTarget[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new LmsError('Зафиксируйте цель: нужен хотя бы один параметр симуляции.');
  }
  if (raw.length > SIM_LIMITS.maxTargets) {
    throw new LmsError(`Параметров в цели — не больше ${SIM_LIMITS.maxTargets}.`);
  }
  const used = new Set<string>();
  return raw.map((item): SimTarget => {
    if (typeof item !== 'object' || item === null) throw new LmsError('Цель симуляции указана неверно.');
    const t = item as Record<string, unknown>;
    if (typeof t.name !== 'string' || !t.name || t.name.length > SIM_LIMITS.name) {
      throw new LmsError('Цель симуляции указана неверно.');
    }
    if (used.has(t.name)) throw new LmsError('Параметр в цели повторяется.');
    used.add(t.name);
    const label = (typeof t.label === 'string' && t.label.trim() ? t.label.trim() : t.name).slice(0, SIM_LIMITS.label);
    const value = typeof t.value === 'boolean' ? null : num(t.value);
    if (value === null) throw new LmsError(`Цель «${label}» — укажите число.`);
    const tolerance = t.tolerance === undefined || t.tolerance === '' ? 0 : num(t.tolerance);
    if (tolerance === null || tolerance < 0) throw new LmsError(`Допуск для «${label}» — неотрицательное число.`);
    return { name: t.name, label, value, tolerance };
  });
}

/**
 * Значения контролов из ответа ученика: только числа. known — имена из цели;
 * null — имена неизвестны (у ученика без подсказок), тогда берём всё числовое.
 */
export function sanitizeControls(raw: unknown, known: readonly string[] | null): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new LmsError('Ответ не подходит к заданию.');
  const allow = known ? new Set(known) : null;
  const out: Record<string, number> = {};
  let count = 0;
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (allow ? !allow.has(name) : name.length > SIM_LIMITS.name) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (++count > SIM_LIMITS.maxAnswerControls) break;
    out[name] = v;
  }
  return out;
}

export function checkTargets(targets: readonly SimTarget[], controls: Record<string, number>): SimHint[] {
  return targets.map((t) => {
    const v = Object.prototype.hasOwnProperty.call(controls, t.name) ? controls[t.name] : undefined;
    const slack = t.tolerance + EPS * Math.max(1, Math.abs(t.value));
    return { name: t.name, label: t.label, matched: typeof v === 'number' && Math.abs(v - t.value) <= slack };
  });
}

/** Доля совпавших параметров × баллы, с шагом 0,5. */
export function simScore(points: number, hints: readonly SimHint[]): number {
  if (hints.length === 0) return 0;
  const matched = hints.filter((h) => h.matched).length;
  if (matched === hints.length) return points;
  return Math.round((points * matched / hints.length) * 2) / 2;
}
