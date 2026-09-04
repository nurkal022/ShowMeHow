import { describe, it, expect } from 'vitest';
import { pickExemplar, scoreExemplar } from '@/lib/exemplars';
import type { DemoEntry } from '@/lib/demos';
import type { PlanSpec } from '@/lib/types';

function demo(over: Partial<DemoEntry>): DemoEntry {
  return {
    slug: 'x', title: 't', prompt: 'p', subject: 'Физика', tags: [],
    html: '<html></html>', ...over,
  };
}

const spec: PlanSpec = {
  title: 'Четырёхтактный двигатель', subject: 'Техника', mode: '3d',
  learningGoals: [], physics: 'кривошипно-шатунный механизм, цикл Отто',
  parameters: [], visualPlan: 'разрез цилиндра',
};

describe('scoreExemplar', () => {
  it('совпадение режима и предмета поднимает оценку', () => {
    const same = demo({ slug: 'a', mode: '3d', subject: 'Техника' });
    const other = demo({ slug: 'b', mode: '2d', subject: 'Биология' });
    expect(scoreExemplar(same, spec)).toBeGreaterThan(scoreExemplar(other, spec));
  });
  it('совпадение ключевых слов поднимает оценку', () => {
    const hit = demo({ slug: 'a', keywords: ['двигатель', 'цикл отто'] });
    const miss = demo({ slug: 'b', keywords: ['осмос'] });
    expect(scoreExemplar(hit, spec)).toBeGreaterThan(scoreExemplar(miss, spec));
  });
});

describe('pickExemplar', () => {
  it('выбирает лучшего и детерминирован при равенстве (по slug)', () => {
    const a = demo({ slug: 'bbb', mode: '3d' });
    const b = demo({ slug: 'aaa', mode: '3d' });
    expect(pickExemplar([a, b], spec)!.slug).toBe('aaa');
    expect(pickExemplar([b, a], spec)!.slug).toBe('aaa');
  });
  it('пропускает слишком большие эталоны', () => {
    const big = demo({ slug: 'big', mode: '3d', html: 'x'.repeat(40000) });
    const small = demo({ slug: 'small', mode: '2d', html: '<html></html>' });
    expect(pickExemplar([big, small], spec)!.slug).toBe('small');
  });
  it('пустой список -> null', () => {
    expect(pickExemplar([], spec)).toBeNull();
  });
});
