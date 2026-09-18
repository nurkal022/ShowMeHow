import { describe, it, expect } from 'vitest';
import { autoScore, isAnswerComplete, sanitizeAnswer, withHints } from '@/lib/lms/answers';
import {
  answerKeyChanged, sanitizeBlockBody, simulationIdsOf, toStudentBody, withSimulation, type AssignmentPayload,
} from '@/lib/lms/block-schema';
import { checkTargets, defaultTolerance, parseBridgeReply, simScore } from '@/lib/lms/sim-state';
import { HARNESS_JS } from '@/lib/runtime/harness';

const SIM = '11111111-2222-3333-4444-555555555555';
const TARGETS = [
  { name: 'length', label: 'Длина нити', value: 2, tolerance: 0.1 },
  { name: 'angle', label: 'Угол', value: '30', tolerance: '' },
  { name: 'damping', label: 'Трение', value: 1, tolerance: 0 },
  { name: 'g', label: 'g', value: 9.8, tolerance: 0.2 },
];

function assignment(spec: Record<string, unknown>, points = 10): AssignmentPayload {
  const body = sanitizeBlockBody('assignment', {
    prompt: 'Настрой маятник', points, stand: { kind: 'lab', slug: 'нет-такой' }, spec,
  });
  if (body.kind !== 'assignment') throw new Error('не задание');
  return body.payload;
}
const base = { type: 'sim_state', simulationId: SIM.toUpperCase(), targets: TARGETS };

describe('схема sim_state', () => {
  it('санация: числа из строк, стенд сбрасывается, подсказки включены по умолчанию', () => {
    const p = assignment(base);
    expect(p.stand).toBeNull();
    expect(p.spec).toEqual({ type: 'sim_state', simulationId: SIM, showHints: true, targets: [
      TARGETS[0], { name: 'angle', label: 'Угол', value: 30, tolerance: 0 }, TARGETS[2], TARGETS[3],
    ] });
    expect(simulationIdsOf({ kind: 'assignment', payload: p })).toEqual([SIM]);
    expect(() => withSimulation({ kind: 'assignment', payload: p }, SIM)).toThrow('привязана цель');
  });
  it('отказы: нет целей, много целей, нечисло, отрицательный допуск, повтор, кривой id', () => {
    expect(() => assignment({ ...base, targets: [] })).toThrow('хотя бы один параметр');
    const many = Array.from({ length: 13 }, (_, i) => ({ name: `p${i}`, label: 'p', value: 1, tolerance: 0 }));
    expect(() => assignment({ ...base, targets: many })).toThrow('не больше 12');
    expect(() => assignment({ ...base, targets: [{ name: 'a', label: 'A', value: 'много' }] })).toThrow('укажите число');
    expect(() => assignment({ ...base, targets: [{ name: 'a', label: 'A', value: true }] })).toThrow('укажите число');
    expect(() => assignment({ ...base, targets: [{ name: 'a', label: 'A', value: 1, tolerance: -1 }] })).toThrow('Допуск');
    expect(() => assignment({ ...base, targets: [TARGETS[0], TARGETS[0]] })).toThrow('повторяется');
    expect(() => assignment({ ...base, simulationId: 'x' })).toThrow('Выберите симуляцию');
  });
  it('ученику не уходят значения цели; без подсказок — и имена', () => {
    const open = toStudentBody({ kind: 'assignment', payload: assignment(base) });
    const closed = toStudentBody({ kind: 'assignment', payload: assignment({ ...base, showHints: false }) });
    if (open.kind !== 'assignment' || closed.kind !== 'assignment') throw new Error('не задание');
    expect(open.payload.spec).toEqual({ type: 'sim_state', simulationId: SIM, showHints: true,
      targets: TARGETS.map(({ name, label }) => ({ name, label })) });
    expect(closed.payload.spec).toEqual({ type: 'sim_state', simulationId: SIM, showHints: false });
    expect(JSON.stringify(open)).not.toContain('9.8');
    expect(JSON.stringify(closed)).not.toContain('length');
  });
  it('answerKeyChanged видит цель, допуск и подсказки, но не подписи', () => {
    const a = assignment(base);
    const relabel = assignment({ ...base, targets: TARGETS.map((t) => ({ ...t, label: `${t.label}!` })) });
    expect(answerKeyChanged(a, relabel)).toBe(false);
    expect(answerKeyChanged(a, assignment({ ...base, targets: [{ ...TARGETS[0], value: 3 }, ...TARGETS.slice(1)] }))).toBe(true);
    expect(answerKeyChanged(a, assignment({ ...base, targets: [{ ...TARGETS[0], tolerance: 1 }, ...TARGETS.slice(1)] }))).toBe(true);
    expect(answerKeyChanged(a, assignment({ ...base, targets: TARGETS.slice(1) }))).toBe(true);
    expect(answerKeyChanged(a, assignment({ ...base, showHints: false }))).toBe(true);
  });
});

describe('ответ и автопроверка sim_state', () => {
  const p = assignment(base);
  it('санация: только числа и известные имена, чужие hints отбрасываются', () => {
    const a = sanitizeAnswer(p.spec, { type: 'sim_state', capturedAt: '2026-09-18T10:00:00Z', hints: [{ name: 'g', matched: true }],
      controls: { length: 2, angle: '30', damping: NaN, secret: 5, g: Infinity } });
    expect(a).toEqual({ type: 'sim_state', capturedAt: '2026-09-18T10:00:00.000Z', controls: { length: 2 } });
    expect(() => sanitizeAnswer(p.spec, { type: 'sim_state', controls: [1] })).toThrow('Ответ не подходит');
    expect(() => sanitizeAnswer(p.spec, { type: 'number', value: '1' })).toThrow('Ответ не подходит');
    const closed = toStudentBody({ kind: 'assignment', payload: assignment({ ...base, showHints: false }) });
    if (closed.kind !== 'assignment') throw new Error('не задание');
    const loose = sanitizeAnswer(closed.payload.spec, { type: 'sim_state', controls: { any: 1, bad: 'x' } });
    expect(loose.type === 'sim_state' && loose.controls).toEqual({ any: 1 });
    expect(isAnswerComplete(loose)).toBe(true);
    expect(isAnswerComplete({ type: 'sim_state', controls: {}, capturedAt: '' })).toBe(false);
  });
  it('все в допуске — полный балл; иначе доля с шагом 0,5', () => {
    const at = '2026-09-18T10:00:00.000Z';
    const full = { type: 'sim_state' as const, capturedAt: at, controls: { length: 2.1, angle: 30, damping: 1, g: 9.65 } };
    expect(autoScore(p, full)).toBe(10);
    const three = { ...full, controls: { ...full.controls, angle: 30.01 } };
    expect(autoScore(p, three)).toBe(7.5);
    expect(autoScore(p, { ...full, controls: { length: 2 } })).toBe(2.5);
    expect(autoScore(p, { ...full, controls: {} })).toBe(0);
    expect(autoScore(assignment({ ...base, targets: TARGETS.slice(0, 3) }, 5), { ...full, controls: { length: 2 } })).toBe(1.5);
    expect(simScore(10, [])).toBe(0);
    expect(checkTargets(p.spec.type === 'sim_state' ? p.spec.targets : [], { length: 0.1 + 0.2 + 1.8 })[0].matched).toBe(true);
  });
  it('подсказки пишутся в ответ только когда разрешены', () => {
    const answer = { type: 'sim_state' as const, capturedAt: 'x', controls: { length: 2, angle: 0 }, hints: [] };
    const hinted = withHints(p, answer);
    expect(hinted.type === 'sim_state' && hinted.hints?.map((h) => h.matched)).toEqual([true, false, false, false]);
    expect(withHints(assignment({ ...base, showHints: false }), answer)).toEqual(
      { type: 'sim_state', capturedAt: 'x', controls: { length: 2, angle: 0 } });
  });
});

describe('мост', () => {
  it('parseBridgeReply: числа, переключатель → 0/1, кнопки и текст отпадают', () => {
    const r = parseBridgeReply({ type: 'sim-state', ok: true, hasExpose: true, controls: [
      { kind: 'slider', name: 'length', label: 'Длина', min: 0, max: 4, value: 2 },
      { kind: 'toggle', name: 'trail', label: 'След', value: true },
      { kind: 'select', name: 'planet', label: 'Планета', value: 'Марс' },
      { kind: 'button', name: 'reset', label: 'Сброс', value: null },
      { kind: 'slider', name: 'length', label: 'Дубль', value: 9 },
      null,
    ] });
    expect(r.ok).toBe(true);
    expect(r.controls.map((c) => [c.name, c.value])).toEqual([['length', 2], ['trail', 1]]);
    expect(parseBridgeReply({ ok: true, controls: [] }).ok).toBe(false);
    expect(parseBridgeReply(null)).toEqual({ ok: false, hasExpose: false, reason: undefined, controls: [] });
  });
  it('допуск по умолчанию: 5% диапазона ползунка, 0 для остального', () => {
    expect(defaultTolerance({ kind: 'slider', min: 0, max: 4 })).toBe(0.2);
    expect(defaultTolerance({ kind: 'slider', min: 0.1, max: 0.4 })).toBe(0.015);
    expect(defaultTolerance({ kind: 'toggle', min: null, max: null })).toBe(0);
    expect(defaultTolerance({ kind: 'slider', min: null, max: 4 })).toBe(0);
  });
  it('harness отвечает на sim-state-request и остаётся ES5', () => {
    expect(HARNESS_JS).toContain("'sim-state-request'");
    expect(HARNESS_JS).toContain("type: 'sim-state'");
    expect(HARNESS_JS).not.toMatch(/=>|\bconst\b|\blet\b/);
    // Исполняем harness в поддельном окне: запрос → ответ родителю.
    const sent: Record<string, unknown>[] = [];
    const listeners: Record<string, (e: unknown) => void> = {};
    const win = {
      addEventListener: (t: string, fn: (e: unknown) => void) => { listeners[t] = fn; },
      dispatchEvent: () => true,
      __smh: undefined as unknown,
    };
    const parent = { postMessage: (m: Record<string, unknown>) => sent.push(m) };
    new Function('window', 'parent', 'CustomEvent', HARNESS_JS)(win, parent, function () {});
    listeners.message({ data: { type: 'sim-state-request', id: 7 } });
    expect(sent[0]).toMatchObject({ type: 'sim-state', id: 7, ok: false, reason: 'no-kit' });
    win.__smh = {
      hasExpose: () => true, state: () => ({ t: 1 }),
      controls: () => [{ kind: 'slider', name: 'length', label: 'Длина', min: 0, max: 4, value: 2, extra: 1 }],
    };
    listeners.message({ data: { type: 'sim-state-request', id: 8 } });
    expect(sent[1]).toEqual({ type: 'sim-state', id: 8, ok: true, hasExpose: true, state: { t: 1 },
      controls: [{ kind: 'slider', name: 'length', label: 'Длина', min: 0, max: 4, value: 2 }] });
  });
});
