import { describe, expect, it } from 'vitest';
import { readClarification } from '@/lib/pipeline/clarify';

describe('readClarification', () => {
  it('берёт вопрос с вариантами', () => {
    const out = '```json\n{"clear": false, "question": "Что замедлить?", "options": ["маятник", "график", "маятник"]}\n```';
    expect(readClarification(out)).toEqual({ question: 'Что замедлить?', options: ['маятник', 'график'] });
  });
  it('понятную просьбу не переспрашивает', () => {
    expect(readClarification('{"clear": true}')).toBeNull();
  });
  it('один вариант — это не выбор', () => {
    expect(readClarification('{"clear": false, "question": "Так?", "options": ["да"]}')).toBeNull();
  });
  it('мусор вместо JSON не ломает доработку', () => {
    expect(readClarification('конечно, сейчас сделаю')).toBeNull();
  });
});
