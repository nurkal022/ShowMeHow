import { describe, it, expect } from 'vitest';
import { parseRemedial } from '@/lib/lms/remedial';
import { topicGaps, type Gap } from '@/lib/lms/gaps';
import { LmsError } from '@/lib/lms/types';

const choice = {
  kind: 'assignment',
  payload: {
    prompt: 'Сколько голов забьёт команда?', points: 5, explanation: 'Считаем по таблице.',
    spec: { type: 'choice', multiple: false, options: [{ text: 'три', correct: true }, { text: 'пять', correct: false }] },
  },
};

const number = {
  kind: 'assignment',
  payload: { prompt: 'Скорость мяча?', points: 10, spec: { type: 'number', answer: 12, tolerance: 0.5, unit: 'м/с' } },
};

describe('разбор ответа модели для работы над ошибками', () => {
  it('берёт заголовок, причину, секции и задания', () => {
    const draft = parseRemedial({
      title: 'Разбор: доли', why: 'Перепутал числитель и знаменатель.',
      sections: [{ title: 'Как думать', body: 'Смотри на целое.' }, { title: 'Пусто', body: '  ' }],
      blocks: [choice, number],
    }, 'запасное название');
    expect(draft.title).toBe('Разбор: доли');
    expect(draft.why).toBe('Перепутал числитель и знаменатель.');
    // Секция без текста — не секция.
    expect(draft.sections).toEqual([{ title: 'Как думать', body: 'Смотри на целое.' }]);
    expect(draft.tasks).toHaveLength(2);
    // Разбор не оценивается, поэтому попытки не ограничены и стенда в нём нет.
    expect(draft.tasks.every((t) => t.allowRetry && t.stand === null)).toBe(true);
  });

  it('без заголовка берёт запасной', () => {
    expect(parseRemedial({ blocks: [choice] }, 'Разбор: дроби').title).toBe('Разбор: дроби');
  });

  it('битые блоки выбрасываются молча', () => {
    const draft = parseRemedial({
      blocks: [
        null, 'мусор', { kind: 'text', payload: { body: 'объяснение' } },
        { kind: 'assignment', payload: { prompt: '', points: 5, spec: { type: 'short', accepted: ['да'] } } },
        { kind: 'assignment', payload: { prompt: 'Ок?', points: 5, spec: { type: 'неизвестно' } } },
        choice,
      ],
    }, 'x');
    expect(draft.tasks).toHaveLength(1);
    expect(draft.tasks[0].prompt).toBe(choice.payload.prompt);
  });

  it('задания, которые ученик не проверит сам, в разбор не попадают', () => {
    const text = { kind: 'assignment', payload: { prompt: 'Объясни своими словами', points: 5, spec: { type: 'text' } } };
    expect(() => parseRemedial({ blocks: [text] }, 'x')).toThrow(LmsError);
    expect(parseRemedial({ blocks: [text, number] }, 'x').tasks).toHaveLength(1);
  });

  it('без единого годного задания — понятная ошибка', () => {
    for (const bad of [null, 'ответ', {}, { blocks: [] }, { blocks: 'нет' }]) {
      expect(() => parseRemedial(bad, 'x')).toThrow('Помощник не смог собрать задания для разбора. Попробуйте ещё раз через минуту.');
    }
  });
});

function gap(topicId: string, blockId: string, topicTotal = 4): Gap {
  return {
    blockId, topicId, topicTitle: `Тема ${topicId}`, courseId: 'c1', courseTitle: 'Физика 8',
    subject: 'Физика', title: 'Задание', prompt: 'Задание', points: 10, score: 2, percent: 20,
    at: '2026-09-01T10:00:00.000Z', topicTotal,
  };
}

describe('сводка пробелов по темам', () => {
  it('темы с одной ошибкой не попадают в сводку', () => {
    expect(topicGaps([gap('t1', 'b1')])).toEqual([]);
  });

  it('считает провалы и сортирует от самых проблемных', () => {
    const list = topicGaps([
      gap('t1', 'b1'), gap('t2', 'b2', 6), gap('t2', 'b3', 6), gap('t2', 'b4', 6), gap('t3', 'b5'), gap('t3', 'b6'),
    ]);
    expect(list.map((t) => [t.topicId, t.failed, t.total])).toEqual([['t2', 3, 6], ['t3', 2, 4]]);
  });

  it('пустой список пробелов — пустая сводка', () => {
    expect(topicGaps([])).toEqual([]);
  });
});
