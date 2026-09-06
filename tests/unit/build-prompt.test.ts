import { describe, it, expect } from 'vitest';
import { buildPrompt, isComplete } from '@/components/constructor/buildPrompt';
import { SECTIONS } from '@/components/constructor/data';

const base = {
  section: 'mechanics', phenomenon: 'математический маятник', mode: '2d' as const,
  style: 'schematic' as const, parameters: ['масса', 'длина'], level: 'grade10to11' as const,
};

describe('конструктор промпта', () => {
  it('включает явление, режим, стиль, параметры и уровень', () => {
    const p = buildPrompt(base);
    expect(p).toContain('математический маятник');
    expect(p).toContain('2D');
    expect(p).toContain('схематичной');
    expect(p).toContain('масса, длина');
    expect(p).toContain('10-11 класса');
  });

  it('пустой список параметров просит подобрать их самостоятельно', () => {
    const p = buildPrompt({ ...base, parameters: [] });
    expect(p).toContain('Подбери сам');
    expect(p).not.toContain('Управляемые параметры');
  });

  it('своё явление попадает в текст дословно', () => {
    expect(buildPrompt({ ...base, phenomonon: undefined, phenomenon: 'качели во дворе' } as typeof base))
      .toContain('качели во дворе');
  });

  it('isComplete требует раздел, явление, режим, стиль и уровень, но не параметры', () => {
    expect(isComplete({ ...base, parameters: [] })).toBe(true);
    expect(isComplete({ ...base, phenomenon: '  ' })).toBe(false);
    expect(isComplete({ ...base, section: '' })).toBe(false);
  });

  it('таблица разделов согласована', () => {
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
    for (const s of SECTIONS) {
      expect(s.phenomena.length).toBeGreaterThan(0);
      expect(s.parameters.length).toBeGreaterThan(0);
    }
  });
});
