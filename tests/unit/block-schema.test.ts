import { describe, it, expect } from 'vitest';
import {
  sanitizeBlockBody, defaultBody, bodyFromRow, toStudentBody, answerKeyChanged, simulationIdsOf,
  withSimulation, assignmentTitle, newOptionId, BLOCK_KINDS, type AssignmentPayload,
} from '@/lib/lms/block-schema';
import { LmsError, LIMITS, requireText, optionalText, isCourseStatus } from '@/lib/lms/types';

const SIM = '11111111-2222-3333-4444-555555555555';

function choice(extra: Partial<AssignmentPayload> = {}): AssignmentPayload {
  const body = sanitizeBlockBody('assignment', {
    prompt: 'От чего зависит период?', points: 10, stand: { kind: 'simulation', simulationId: SIM },
    spec: { type: 'choice', multiple: false, options: [
      { id: 'len', text: 'От длины нити', correct: true },
      { id: 'mass', text: 'От массы', correct: false },
    ] },
    ...extra,
  });
  if (body.kind !== 'assignment') throw new Error('не задание');
  return body.payload;
}

describe('общие проверки текста', () => {
  it('requireText и optionalText', () => {
    expect(requireText('  Физика ', 10, 'Название')).toBe('Физика');
    expect(() => requireText('  ', 10, 'Название')).toThrow('Заполните поле «Название».');
    expect(() => requireText('x'.repeat(11), 10, 'Название')).toThrow('Поле «Название» — не длиннее 10 символов.');
    expect(optionalText(undefined, 5, 'Предмет')).toBe('');
    expect(() => optionalText(5, 5, 'Предмет')).toThrow('Поле «Предмет» должно быть текстом.');
    expect(isCourseStatus('published')).toBe(true);
    expect(isCourseStatus('hidden')).toBe(false);
  });
});

describe('санация блоков', () => {
  it('блоки по умолчанию проходят собственную санацию', () => {
    for (const kind of BLOCK_KINDS) {
      const body = defaultBody(kind);
      expect(sanitizeBlockBody(kind, body.payload)).toEqual(body);
    }
  });
  it('текст: лишние поля отбрасываются, длина ограничена', () => {
    expect(sanitizeBlockBody('text', { title: ' Период ', body: 'x', evil: '<script>' }))
      .toEqual({ kind: 'text', payload: { title: 'Период', body: 'x' } });
    expect(() => sanitizeBlockBody('text', { body: 'x'.repeat(LIMITS.text + 1) })).toThrow(LmsError);
  });
  it('тренажёр: id симуляции — uuid или пусто', () => {
    expect(sanitizeBlockBody('simulation', { simulationId: SIM.toUpperCase(), caption: 'Смотрите', preset: {}, locked: [] }))
      .toEqual({ kind: 'simulation', payload: { simulationId: SIM, caption: 'Смотрите', preset: {}, locked: [] } });
    expect(() => sanitizeBlockBody('simulation', { simulationId: '../evil' })).toThrow('Тренажёр указан неверно.');
  });
  it('лаборатория: только из списка', () => {
    expect(sanitizeBlockBody('lab', { slug: 'physics' }))
      .toEqual({ kind: 'lab', payload: { slug: 'physics', caption: '' } });
    expect(() => sanitizeBlockBody('lab', { slug: 'alchemy' })).toThrow('Выберите лабораторию из списка.');
  });
  it('задание с выбором: варианты, правильные, один или несколько', () => {
    const p = choice();
    expect(p.spec).toEqual({ type: 'choice', multiple: false, shuffle: false, options: [
      { id: 'len', text: 'От длины нити', correct: true },
      { id: 'mass', text: 'От массы', correct: false },
    ] });
    expect(p.allowRetry).toBe(false);
    const bad = (spec: unknown) => () => sanitizeBlockBody('assignment', { prompt: 'x', spec });
    expect(bad({ type: 'choice', options: [{ text: 'a', correct: true }] }))
      .toThrow('Вариантов должно быть от 2 до 10.');
    expect(bad({ type: 'choice', options: [{ text: 'a' }, { text: 'b' }] }))
      .toThrow('Отметьте хотя бы один правильный вариант.');
    expect(bad({ type: 'choice', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }))
      .toThrow('В задании с одним ответом правильный вариант должен быть один.');
    expect(bad({ type: 'choice', options: [{ text: '', correct: true }, { text: 'b' }] }))
      .toThrow('Заполните поле «Вариант 1».');
    expect(bad({ type: 'choice', options: [{ text: 'x'.repeat(501), correct: true }, { text: 'b' }] }))
      .toThrow(LmsError);
  });
  it('варианты с кривыми или повторными id получают свои', () => {
    const body = sanitizeBlockBody('assignment', { prompt: 'x', spec: { type: 'choice', multiple: true, options: [
      { id: 'A B', text: 'a', correct: true }, { id: 'o1', text: 'b', correct: true }, { text: 'c' },
    ] } });
    if (body.kind !== 'assignment' || body.payload.spec.type !== 'choice') throw new Error('не выбор');
    const ids = body.payload.spec.options.map((o) => o.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^[a-z0-9]{1,16}$/.test(id))).toBe(true);
  });
  it('задание с числом: запятая, допуск, единицы', () => {
    const body = sanitizeBlockBody('assignment', {
      prompt: 'Период?', points: 5, spec: { type: 'number', answer: '2,0', tolerance: '0.1', unit: 'с' } });
    expect(body).toEqual({ kind: 'assignment', payload: {
      prompt: 'Период?', points: 5, stand: null, allowRetry: false, rubric: [], explanation: '',
      spec: { type: 'number', answer: 2, tolerance: 0.1, unit: 'с' },
    } });
    expect(() => sanitizeBlockBody('assignment', { prompt: 'x', spec: { type: 'number' } }))
      .toThrow('Укажите правильное число.');
    expect(() => sanitizeBlockBody('assignment', { prompt: 'x', spec: { type: 'number', answer: 1, tolerance: -1 } }))
      .toThrow('Допуск — неотрицательное число.');
  });
  it('баллы, тип и стенд проверяются', () => {
    expect(() => sanitizeBlockBody('assignment', { prompt: 'x', points: 1.5, spec: { type: 'text' } }))
      .toThrow('Баллы — целое число от 0 до 1000.');
    expect(() => sanitizeBlockBody('assignment', { prompt: 'x', spec: { type: 'essay' } }))
      .toThrow('Неизвестный тип задания.');
    expect(() => sanitizeBlockBody('assignment', { prompt: 'x', stand: { kind: 'lab', slug: 'zzz' }, spec: { type: 'text' } }))
      .toThrow('Стенд задания указан неверно.');
    expect(() => sanitizeBlockBody('assignment', { prompt: '', spec: { type: 'text' } }))
      .toThrow('Заполните поле «Текст задания».');
  });
  it('испорченная строка из базы превращается в блок по умолчанию', () => {
    expect(bodyFromRow('lab', { slug: 'nope' })).toEqual(defaultBody('lab'));
    expect(bodyFromRow('hologram', {})).toEqual(defaultBody('text'));
  });
});

describe('что видит ученик', () => {
  it('в задании нет правильных вариантов и правильного числа', () => {
    const student = toStudentBody({ kind: 'assignment', payload: choice() });
    expect(JSON.stringify(student)).not.toContain('correct');
    expect(student).toEqual({ kind: 'assignment', payload: {
      prompt: 'От чего зависит период?', points: 10, allowRetry: false, rubric: [],
      stand: { kind: 'simulation', simulationId: SIM },
      spec: { type: 'choice', multiple: false, options: [
        { id: 'len', text: 'От длины нити' }, { id: 'mass', text: 'От массы' },
      ] },
    } });
    const num = sanitizeBlockBody('assignment', { prompt: 'x', spec: { type: 'number', answer: 42, tolerance: 1, unit: 'м' } });
    const safe = toStudentBody(num);
    expect(JSON.stringify(safe)).not.toContain('42');
    expect(JSON.stringify(safe)).not.toContain('tolerance');
  });
  it('прочие блоки не меняются', () => {
    const text = defaultBody('text');
    expect(toStudentBody(text)).toBe(text);
  });
});

describe('ревизии и симуляции', () => {
  it('ключ ответа меняют баллы, правильность и состав вариантов, но не формулировки', () => {
    const base = choice();
    expect(answerKeyChanged(base, choice({ prompt: 'Другая формулировка' }))).toBe(false);
    const renamed = structuredClone(base);
    if (renamed.spec.type === 'choice') renamed.spec.options[1].text = 'От массы груза';
    expect(answerKeyChanged(base, renamed)).toBe(false);
    expect(answerKeyChanged(base, { ...base, points: 5 })).toBe(true);
    const flipped = structuredClone(base);
    if (flipped.spec.type === 'choice') {
      flipped.spec.options[0].correct = false;
      flipped.spec.options[1].correct = true;
    }
    expect(answerKeyChanged(base, flipped)).toBe(true);
    expect(answerKeyChanged(base, { ...base, spec: { type: 'text' } })).toBe(true);
  });
  it('simulationIdsOf и withSimulation', () => {
    expect(simulationIdsOf({ kind: 'assignment', payload: choice() })).toEqual([SIM]);
    expect(simulationIdsOf(defaultBody('simulation'))).toEqual([]);
    const other = '99999999-2222-3333-4444-555555555555';
    expect(withSimulation(defaultBody('simulation'), other))
      .toEqual({ kind: 'simulation', payload: { simulationId: other, caption: '', preset: {}, locked: [] } });
    const withStand = withSimulation(defaultBody('assignment'), other);
    expect(withStand.kind === 'assignment' && withStand.payload.stand)
      .toEqual({ kind: 'simulation', simulationId: other });
    expect(() => withSimulation(defaultBody('text'), other)).toThrow(LmsError);
  });
  it('заголовок задания и id варианта', () => {
    expect(assignmentTitle('**Период** маятника\nдлиной 1 м')).toBe('Период маятника длиной 1 м');
    expect(assignmentTitle('я'.repeat(80))).toHaveLength(58);
    expect(newOptionId()).toMatch(/^[a-z0-9]{1,16}$/);
  });
});
