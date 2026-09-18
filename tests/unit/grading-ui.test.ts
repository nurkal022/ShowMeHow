import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AnswerView from '@/components/lms/AnswerView';
import AnswersTable, { stateTone } from '@/components/teach/AnswersTable';
import JournalTable from '@/components/teach/JournalTable';
import ProgressTable from '@/components/teach/ProgressTable';
import { buildJournal, buildProgress } from '@/lib/lms/journal';
import { sanitizeBlockBody, toStudentBody } from '@/lib/lms/block-schema';
import type { Submission } from '@/lib/lms/submissions';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const body = sanitizeBlockBody('assignment', { prompt: 'Сколько?', spec: { type: 'choice', options: [
  { id: 'a', text: '4', correct: true }, { id: 'b', text: '5' }] } });
if (body.kind !== 'assignment') throw new Error('не задание');
const student = toStudentBody(body);
if (student.kind !== 'assignment') throw new Error('не задание');

const students = [{ id: 's1', name: 'Иванов Иван', groups: ['7А'] }];
const sub: Submission = {
  id: 'sub1', blockId: 'b1', studentId: 's1', blockRevision: 1, answer: { type: 'choice', selected: ['b'] },
  status: 'graded', autoScore: 0, score: 0, comment: null, submittedAt: '2026-09-18T10:00:00.000Z',
  gradedAt: '2026-09-18T10:00:00.000Z', gradedBy: null, updatedAt: '2026-09-18T10:00:00.000Z',
};

describe('ответ ученика', () => {
  it('учитель видит правильный вариант, ученик — нет', () => {
    const forTeacher = render(createElement(AnswerView, { spec: body.payload.spec, answer: sub.answer }));
    expect(forTeacher).toContain('4 — правильный');
    expect(forTeacher).toContain('● 5');
    const forStudent = render(createElement(AnswerView, { spec: student.payload.spec, answer: sub.answer }));
    expect(forStudent).not.toContain('правильный');
    expect(forStudent).toContain('● 5');
  });
  it('текст, число и отсутствие ответа', () => {
    expect(render(createElement(AnswerView, { spec: { type: 'text' }, answer: { type: 'text', text: 'Потому что' } })))
      .toContain('Потому что');
    expect(render(createElement(AnswerView, { spec: { type: 'number', answer: 2, tolerance: 0.1, unit: 'с' },
      answer: { type: 'number', value: '2,05' } }))).toContain('2,05 с (правильный ответ: 2 ± 0,1)');
    expect(render(createElement(AnswerView, { spec: { type: 'text' }, answer: null }))).toContain('Ответа нет.');
  });
});

describe('таблицы учителя', () => {
  it('ответы задания: статус, балл, ссылка', () => {
    const html = render(createElement(AnswersTable, {
      rows: [{ student: students[0], submission: sub }, { student: { id: 's2', name: 'Петрова Анна', groups: ['7А'] }, submission: null }],
      points: 10, selectedId: 'sub1', hrefFor: (id: string) => `/x?s=${id}`,
    }));
    expect(html).toContain('0 из 10');
    expect(html).toContain('href="/x?s=sub1"');
    expect(html).toContain('не начато');
    expect(html).toContain('class="selected"');
    expect(stateTone('submitted')).toBe('warn');
    expect(stateTone('graded')).toBe('ok');
  });
  it('журнал и прогресс', () => {
    const journal = buildJournal(students, [{ blockId: 'b1', topicTitle: 'Маятник', title: 'Сколько?', points: 10 }],
      [{ blockId: 'b1', studentId: 's1', status: 'graded', score: 8 }]);
    const html = render(createElement(JournalTable, { journal }));
    expect(html).toContain('Маятник: Сколько? (10)');
    expect(html).toContain('8 из 10');
    const progress = buildProgress(students, [{ id: 't1', title: 'Маятник' }], [{ topicId: 't1', userId: 's1' }]);
    const p = render(createElement(ProgressTable, { progress }));
    expect(p).toContain('открывал');
    expect(p).toContain('1 из 1');
    expect(render(createElement(JournalTable, { journal: buildJournal([], [], []) })))
      .toContain('В журнале пока пусто');
  });
});
