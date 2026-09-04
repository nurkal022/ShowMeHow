import { describe, it, expect } from 'vitest';
import { resolveRole } from '@/lib/roles';
import type { ProviderProfile } from '@/lib/types';

const base: ProviderProfile = {
  id: 'p', name: 'p', baseURL: 'http://x', apiKey: 'k',
  generationModel: 'gen', visionModel: 'vis',
};

describe('resolveRole', () => {
  it('по умолчанию текстовые роли идут на generationModel', () => {
    expect(resolveRole(base, 'planner').model).toBe('gen');
    expect(resolveRole(base, 'generator').model).toBe('gen');
    expect(resolveRole(base, 'fixer').model).toBe('gen');
    expect(resolveRole(base, 'refiner').model).toBe('gen');
  });
  it('по умолчанию критик и судья идут на visionModel', () => {
    expect(resolveRole(base, 'critic').model).toBe('vis');
    expect(resolveRole(base, 'judge').model).toBe('vis');
  });
  it('HTML-роли получают крупный лимит токенов, JSON-роли — умеренный', () => {
    expect(resolveRole(base, 'generator').maxTokens).toBe(16000);
    expect(resolveRole(base, 'refiner').maxTokens).toBe(16000);
    expect(resolveRole(base, 'fixer').maxTokens).toBe(16000);
    expect(resolveRole(base, 'planner').maxTokens).toBe(4000);
    expect(resolveRole(base, 'judge').maxTokens).toBe(4000);
  });
  it('роль из настроек побеждает дефолты, extraBody сливается', () => {
    const p: ProviderProfile = {
      ...base,
      extraBody: { enable_thinking: false },
      roles: { generator: { model: 'big', maxTokens: 32000, temperature: 0.9,
        extraBody: { top_p: 0.8 } } },
    };
    const r = resolveRole(p, 'generator');
    expect(r.model).toBe('big');
    expect(r.maxTokens).toBe(32000);
    expect(r.extraBody).toEqual({ enable_thinking: false, top_p: 0.8, temperature: 0.9 });
  });
});
