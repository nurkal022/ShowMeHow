import { describe, it, expect } from 'vitest';
import { buildJournal, journalCsv, cellText, buildProgress } from '@/lib/lms/journal';
import { formatScore, ruPlural, formatDate } from '@/lib/lms/format';

const students = [
  { id: 's2', name: 'Петрова Анна', groups: ['7А'] },
  { id: 's1', name: 'Иванов Иван', groups: ['7А', '7Б'] },
];
const assignments = [
  { blockId: 'b1', topicTitle: 'Маятник', title: 'Период', points: 10 },
  { blockId: 'b2', topicTitle: 'Маятник', title: 'Объясните', points: 5 },
];

describe('журнал', () => {
  const j = buildJournal(students, assignments, [
    { blockId: 'b1', studentId: 's1', status: 'graded', score: 10 },
    { blockId: 'b2', studentId: 's1', status: 'submitted', score: null },
    { blockId: 'b1', studentId: 's2', status: 'returned', score: null },
    { blockId: 'b9', studentId: 's2', status: 'graded', score: 3 },
  ]);

  it('строки по алфавиту, клетки по заданиям, итог по проверенным', () => {
    expect(j.rows.map((r) => r.student.name)).toEqual(['Иванов Иван', 'Петрова Анна']);
    expect(j.rows[0].cells).toEqual([
      { blockId: 'b1', state: 'graded', score: 10 },
      { blockId: 'b2', state: 'submitted', score: null },
    ]);
    expect(j.rows[0].total).toBe(10);
    expect(j.rows[0].max).toBe(15);
    expect(j.rows[1].cells.map(cellText)).toEqual(['возвращено', 'не начато']);
    expect(j.rows[1].total).toBe(0);
  });

  it('CSV: BOM, точка с запятой, экранирование и защита от формул', () => {
    const csv = journalCsv(buildJournal(
      [{ id: 's', name: '=HYPERLINK("x")', groups: ['7"А'] }],
      [{ blockId: 'b', topicTitle: 'Тема; 1', title: 'Вопрос', points: 4 }],
      [{ blockId: 'b', studentId: 's', status: 'graded', score: 3.5 }]));
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Ученик;Группы;"Тема; 1: Вопрос (4)";Итого;Максимум');
    expect(lines[1]).toBe(`"'=HYPERLINK(""x"")";"7""А";3,5;3,5;4`);
  });
});

describe('прогресс', () => {
  it('ученики × темы, отметка «открывал»', () => {
    const p = buildProgress(students, [{ id: 't1', title: 'Первая' }, { id: 't2', title: 'Вторая' }],
      [{ topicId: 't2', userId: 's1' }, { topicId: 't1', userId: 's1' }, { topicId: 't1', userId: 'чужой' }]);
    expect(p.rows.map((r) => [r.student.id, r.opened, r.count])).toEqual([
      ['s1', [true, true], 2],
      ['s2', [false, false], 0],
    ]);
  });
});

describe('форматирование', () => {
  it('баллы, склонения, даты', () => {
    expect(formatScore(8.5)).toBe('8,5');
    expect(formatScore(null)).toBe('—');
    expect(ruPlural(1, 'тема', 'темы', 'тем')).toBe('тема');
    expect(ruPlural(3, 'тема', 'темы', 'тем')).toBe('темы');
    expect(ruPlural(12, 'тема', 'темы', 'тем')).toBe('тем');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('2026-09-18T10:00:00.000Z')).toMatch(/18\.09\.2026/);
  });
});
