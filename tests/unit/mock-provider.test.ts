import { describe, it, expect } from 'vitest';
import { roleOf } from '../../e2e/mock-provider';
import {
  PLANNER_SYSTEM, JUDGE_SYSTEM, CRITIC_SYSTEM, FIXER_SYSTEM, REFINER_SYSTEM, generatorSystem,
  STYLE_HINTS,
} from '@/lib/pipeline/prompts';

describe('mock-provider roleOf', () => {
  it('различает роли по НАСТОЯЩИМ системным промптам', () => {
    expect(roleOf(PLANNER_SYSTEM)).toBe('planner');
    expect(roleOf(JUDGE_SYSTEM)).toBe('judge');
    expect(roleOf(CRITIC_SYSTEM)).toBe('critic');
    // Генератор, фиксер и рефайнер ждут HTML: рефайнер раньше получал вердикт
    // критика, потому что его промпт упоминает «физика-рецензента».
    expect(roleOf(generatorSystem(STYLE_HINTS[0]))).toBe('html');
    expect(roleOf(FIXER_SYSTEM)).toBe('html');
    expect(roleOf(REFINER_SYSTEM)).toBe('html');
  });
});
