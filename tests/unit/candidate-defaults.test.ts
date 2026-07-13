import { describe, it, expect } from 'vitest';
import { CANDIDATE_DEFAULTS } from '@/lib/candidate-defaults';
import { MODES } from '@/lib/pipeline/run';
import type { QualityMode } from '@/lib/types';

// Клиентский селектор «Кандидатов: N» (Workbench) берёт дефолты из
// CANDIDATE_DEFAULTS, серверный пайплайн — из MODES[mode].candidates.
// Этот тест пиннит их равенство, чтобы рефакторинг одного не разъехался
// со вторым незаметно.
describe('candidate defaults', () => {
  it('CANDIDATE_DEFAULTS matches MODES[mode].candidates for every mode', () => {
    const modes: QualityMode[] = ['fast', 'standard', 'max'];
    for (const mode of modes) {
      expect(CANDIDATE_DEFAULTS[mode]).toBe(MODES[mode].candidates);
    }
  });

  it('every default is within the valid 1-5 range', () => {
    for (const n of Object.values(CANDIDATE_DEFAULTS)) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
