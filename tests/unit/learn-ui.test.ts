import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CourseCard from '@/components/learn/CourseCard';
import LessonBlock from '@/components/learn/LessonBlock';
import GradesTable from '@/components/learn/GradesTable';
import { submissionLine } from '@/components/learn/SubmissionStatus';
import { sanitizeBlockBody, toStudentBody } from '@/lib/lms/block-schema';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const base = { answer: null, comment: null, submittedAt: '2026-09-18T10:00:00.000Z' };

describe('раздел ученика', () => {
  it('карточка курса: прогресс и «Продолжить»', () => {
    const html = render(createElement(CourseCard, {
      course: { id: 'c1', orgId: 'o1', ownerId: 'u1', title: 'Физика 7', subject: 'Физика', description: '',
        status: 'published', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
      teacher: 'Анна Петровна', continueId: 't2',
      totals: { topicsTotal: 3, topicsDone: 1, topicsViewed: 1, assignmentsTotal: 4, assignmentsDone: 2, pointsEarned: 8, pointsMax: 40 },
    }));
    expect(html).toContain('href="/learn/courses/c1"');
    expect(html).toContain('href="/learn/topics/t2"');
    expect(html).toContain('1 из 3');
    expect(html).toContain('2 из 4');
    expect(html).toContain('Анна Петровна');
  });

  it('строка статуса ответа', () => {
    expect(submissionLine(null, 10)).toBeNull();
    expect(submissionLine({ ...base, status: 'draft', score: null }, 10)).toBe('Черновик сохранён — ответ ещё не сдан.');
    expect(submissionLine({ ...base, status: 'submitted', score: null }, 10)).toBe('Сдано, ждёт проверки.');
    expect(submissionLine({ ...base, status: 'graded', score: 8.5 }, 10)).toBe('Проверено: 8,5 из 10.');
    expect(submissionLine({ ...base, status: 'returned', score: null }, 10)).toBe('Работа возвращена на доработку.');
  });

  it('задание ученика: без правильных ответов, с формой и комментарием учителя', () => {
    const body = toStudentBody(sanitizeBlockBody('assignment', { prompt: 'Сколько будет 2 + 2?', points: 10,
      spec: { type: 'choice', options: [{ id: 'a', text: '4', correct: true }, { id: 'b', text: '5' }] } }));
    const html = render(createElement(LessonBlock, {
      blockId: 'b1', body, missing: false, preview: false,
      submission: { ...base, status: 'graded', score: 10, answer: { type: 'choice', selected: ['a'] }, comment: 'Молодец' },
    }));
    expect(html).toContain('Сколько будет 2 + 2?');
    expect(html).toContain('type="radio"');
    expect(html).toContain('Проверено: 10 из 10.');
    expect(html).toContain('Комментарий учителя: Молодец');
    expect(html).not.toContain('правильный');
  });

  it('текст и удалённый тренажёр', () => {
    expect(render(createElement(LessonBlock, { blockId: 'b2', missing: false, preview: false, submission: null,
      body: { kind: 'text', payload: { title: 'Период', body: '**важно**' } } }))).toContain('<strong>важно</strong>');
    expect(render(createElement(LessonBlock, { blockId: 'b3', missing: true, preview: false, submission: null,
      body: { kind: 'simulation', payload: { simulationId: '11111111-2222-3333-4444-555555555555', caption: '', preset: {}, locked: [] } } })))
      .toContain('Тренажёр удалён автором.');
  });

  it('мои оценки', () => {
    const html = render(createElement(GradesTable, { grades: [
      { courseId: 'c1', courseTitle: 'Физика 7', topicId: 't1', topicTitle: 'Маятник', blockId: 'b1',
        title: 'Период', points: 10, state: 'graded', score: 8 },
      { courseId: 'c1', courseTitle: 'Физика 7', topicId: 't1', topicTitle: 'Маятник', blockId: 'b2',
        title: 'Объясните', points: 5, state: 'none', score: null },
    ] }));
    expect(html).toContain('8 из 10');
    expect(html).toContain('не начато');
    expect(html).toContain('href="/learn/topics/t1#block-b1"');
    expect(render(createElement(GradesTable, { grades: [] }))).toContain('Оценок пока нет.');
  });
});
