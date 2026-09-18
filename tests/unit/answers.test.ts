import { describe, it, expect } from 'vitest';
import {
  sanitizeAnswer, autoScore, parseNumber, isAnswerComplete, canSaveDraft, canSubmit, parseScore,
  toStudentSubmission, emptyAnswer,
} from '@/lib/lms/answers';
import { sanitizeBlockBody, toStudentBody, type AssignmentPayload } from '@/lib/lms/block-schema';
import { LmsError } from '@/lib/lms/types';

function assignment(spec: unknown, points = 10): AssignmentPayload {
  const body = sanitizeBlockBody('assignment', { prompt: 'Вопрос', points, spec });
  if (body.kind !== 'assignment') throw new Error('не задание');
  return body.payload;
}
const single = assignment({ type: 'choice', options: [
  { id: 'a', text: 'Да', correct: true }, { id: 'b', text: 'Нет' },
] });
const multi = assignment({ type: 'choice', multiple: true, options: [
  { id: 'a', text: '1', correct: true }, { id: 'b', text: '2', correct: true }, { id: 'c', text: '3' },
] });
const num = assignment({ type: 'number', answer: 2, tolerance: 0.1, unit: 'с' });
const text = assignment({ type: 'text' });

describe('санация ответа', () => {
  it('выбор: только существующие варианты, один в одиночном', () => {
    expect(sanitizeAnswer(single.spec, { type: 'choice', selected: ['a', 'a'] }))
      .toEqual({ type: 'choice', selected: ['a'] });
    expect(() => sanitizeAnswer(single.spec, { type: 'choice', selected: ['z'] }))
      .toThrow('Выбран вариант, которого нет в задании.');
    expect(() => sanitizeAnswer(single.spec, { type: 'choice', selected: ['a', 'b'] }))
      .toThrow('В этом задании можно выбрать только один вариант.');
    // Ученик знает только студенческую схему — она подходит так же.
    const studentBody = toStudentBody({ kind: 'assignment', payload: multi });
    if (studentBody.kind !== 'assignment') throw new Error('не задание');
    expect(sanitizeAnswer(studentBody.payload.spec, { type: 'choice', selected: ['b', 'a'] }))
      .toEqual({ type: 'choice', selected: ['b', 'a'] });
  });
  it('число и текст: тип и длина', () => {
    expect(sanitizeAnswer(num.spec, { type: 'number', value: ' 2,05 ' })).toEqual({ type: 'number', value: '2,05' });
    expect(() => sanitizeAnswer(num.spec, { type: 'number', value: '1'.repeat(51) }))
      .toThrow('Число — не длиннее 50 символов.');
    expect(sanitizeAnswer(text.spec, { type: 'text', text: 'Ответ' })).toEqual({ type: 'text', text: 'Ответ' });
    expect(() => sanitizeAnswer(text.spec, { type: 'text', text: 'я'.repeat(10001) }))
      .toThrow('Ответ — не длиннее 10000 символов.');
    expect(() => sanitizeAnswer(text.spec, { type: 'choice', selected: [] }))
      .toThrow('Ответ не подходит к заданию.');
    expect(() => sanitizeAnswer(text.spec, 'просто строка')).toThrow(LmsError);
  });
  it('пустые ответы по типу и полнота', () => {
    expect(emptyAnswer({ type: 'choice' })).toEqual({ type: 'choice', selected: [] });
    expect(isAnswerComplete({ type: 'choice', selected: [] })).toBe(false);
    expect(isAnswerComplete({ type: 'number', value: 'два' })).toBe(false);
    expect(isAnswerComplete({ type: 'number', value: '2' })).toBe(true);
    expect(isAnswerComplete({ type: 'text', text: '   ' })).toBe(false);
  });
});

describe('автопроверка', () => {
  it('выбор: полный балл только при точном совпадении', () => {
    expect(autoScore(single, { type: 'choice', selected: ['a'] })).toBe(10);
    expect(autoScore(single, { type: 'choice', selected: ['b'] })).toBe(0);
    expect(autoScore(multi, { type: 'choice', selected: ['b', 'a'] })).toBe(10);
    expect(autoScore(multi, { type: 'choice', selected: ['a'] })).toBe(0);
    expect(autoScore(multi, { type: 'choice', selected: ['a', 'b', 'c'] })).toBe(0);
  });
  it('число: допуск включительно, запятая, мусор — ноль', () => {
    expect(autoScore(num, { type: 'number', value: '2,1' })).toBe(10);
    expect(autoScore(num, { type: 'number', value: '1.9' })).toBe(10);
    expect(autoScore(num, { type: 'number', value: '2.11' })).toBe(0);
    expect(autoScore(num, { type: 'number', value: 'около двух' })).toBe(0);
    expect(autoScore(assignment({ type: 'number', answer: 0.3 }), { type: 'number', value: '0.3' })).toBe(10);
  });
  it('текст проверяет учитель; чужой тип ответа — ноль', () => {
    expect(autoScore(text, { type: 'text', text: 'x' })).toBeNull();
    expect(autoScore(num, { type: 'choice', selected: ['a'] })).toBe(0);
  });
  it('parseNumber', () => {
    expect(parseNumber('1 000,5')).toBe(1000.5);
    expect(parseNumber('-3e2')).toBe(-300);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('12abc')).toBeNull();
  });
});

describe('правила сдачи и оценки', () => {
  it('черновик — пока не сдано или после возврата', () => {
    expect(canSaveDraft('none')).toBe(true);
    expect(canSaveDraft('draft')).toBe(true);
    expect(canSaveDraft('returned')).toBe(true);
    expect(canSaveDraft('submitted')).toBe(false);
    expect(canSaveDraft('graded')).toBe(false);
  });
  it('сдать заново — после возврата или при разрешённом повторе', () => {
    expect(canSubmit('graded', false)).toBe(false);
    expect(canSubmit('graded', true)).toBe(true);
    expect(canSubmit('submitted', true)).toBe(true);
    expect(canSubmit('returned', false)).toBe(true);
  });
  it('балл учителя: от 0 до максимума, две цифры после запятой', () => {
    expect(parseScore('8,5', 10)).toBe(8.5);
    expect(parseScore(7.333, 10)).toBe(7.33);
    expect(() => parseScore(11, 10)).toThrow('Балл — число от 0 до 10.');
    expect(() => parseScore('много', 10)).toThrow('Балл — число от 0 до 10.');
  });
  it('ученик видит балл только после проверки', () => {
    const base = { answer: null, comment: null, submittedAt: '2026-09-18T10:00:00.000Z' };
    expect(toStudentSubmission({ ...base, status: 'submitted', score: 5 })?.score).toBeNull();
    expect(toStudentSubmission({ ...base, status: 'graded', score: 5 })?.score).toBe(5);
    expect(toStudentSubmission(null)).toBeNull();
  });
});
