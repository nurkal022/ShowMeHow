import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CoursesTable from '@/components/teach/CoursesTable';
import {
  blankOptions, fromAssignmentForm, markCorrect, toAssignmentForm,
} from '@/components/teach/assignment-form';
import { sanitizeBlockBody, type AssignmentPayload } from '@/lib/lms/block-schema';

const SIM = '11111111-2222-3333-4444-555555555555';

function payload(raw: unknown): AssignmentPayload {
  const body = sanitizeBlockBody('assignment', raw);
  if (body.kind !== 'assignment') throw new Error('не задание');
  return body.payload;
}

describe('форма задания', () => {
  it('туда и обратно без потерь: выбор со стендом-тренажёром', () => {
    const p = payload({ prompt: 'Вопрос', points: 7, allowRetry: true, stand: { kind: 'simulation', simulationId: SIM },
      spec: { type: 'choice', multiple: false, options: [{ id: 'a', text: '1', correct: true }, { id: 'b', text: '2' }] } });
    const form = toAssignmentForm(p, 'Маятник');
    expect(form).toMatchObject({ points: '7', standKind: 'simulation', standSimulationId: SIM, standTitle: 'Маятник', type: 'choice' });
    expect(payload(fromAssignmentForm(form))).toEqual(p);
  });
  it('число и лаборатория: строки из полей становятся числами на сервере', () => {
    const p = payload({ prompt: 'Период?', stand: { kind: 'lab', slug: 'physics' },
      spec: { type: 'number', answer: 2, tolerance: 0.1, unit: 'с' } });
    const form = toAssignmentForm(p, null);
    expect(form).toMatchObject({ answer: '2', tolerance: '0.1', unit: 'с', standLab: 'physics' });
    expect(payload(fromAssignmentForm({ ...form, answer: '2,5' })).spec).toEqual({ type: 'number', answer: 2.5, tolerance: 0.1, unit: 'с' });
  });
  it('пустые баллы не превращаются в ноль', () => {
    const form = toAssignmentForm(payload({ prompt: 'x', spec: { type: 'text' } }), null);
    expect(() => payload(fromAssignmentForm({ ...form, points: '' }))).toThrow('Баллы — целое число от 0 до 1000.');
    expect(fromAssignmentForm({ ...form, standKind: 'simulation', standSimulationId: null }).stand).toBeNull();
  });
  it('правильный вариант: один — переключается, несколько — отмечаются', () => {
    const opts = blankOptions();
    expect(opts).toHaveLength(2);
    expect(opts[0].id).not.toBe(opts[1].id);
    expect(markCorrect(opts, opts[1].id, false).map((o) => o.correct)).toEqual([false, true]);
    expect(markCorrect(opts, opts[1].id, true).map((o) => o.correct)).toEqual([true, true]);
    expect(markCorrect(opts, opts[0].id, true).map((o) => o.correct)).toEqual([false, false]);
  });
});

describe('список курсов', () => {
  it('статус, группы, непроверенные и владелец', () => {
    const html = renderToStaticMarkup(createElement(CoursesTable, { showOwner: true, courses: [{
      id: 'c1', orgId: 'o1', ownerId: 'u1', title: 'Физика 7', subject: 'Физика', grade: '', description: '',
      status: 'published', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      ownerLabel: 'Анна Петровна', groupTitles: ['7А'], topicCount: 2, ungraded: 3,
    }] }));
    expect(html).toContain('href="/teach/courses/c1"');
    expect(html).toContain('опубликован');
    expect(html).toContain('7А');
    expect(html).toContain('Анна Петровна');
    expect(html).toContain('непроверенных ответов: 3');
    expect(renderToStaticMarkup(createElement(CoursesTable, { showOwner: false, courses: [] })))
      .toContain('Курсов пока нет. Создайте первый — например, «Физика 7: механика».');
  });
});
