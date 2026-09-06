import { describe, it, expect } from 'vitest';
import { sanitizePrefs, mergePrefs, sanitizeDisplayName, MAX_DISPLAY_NAME } from '@/lib/auth/prefs';

describe('sanitizePrefs', () => {
  it('оставляет только известные ключи с допустимыми значениями', () => {
    expect(sanitizePrefs({ theme: 'dark', quality: 'fast', junk: 1, level: 'students' }))
      .toEqual({ theme: 'dark', quality: 'fast', level: 'students' });
  });

  it('выбрасывает значения вне перечисления', () => {
    expect(sanitizePrefs({ theme: 'neon', quality: 'ultra', style: 'schematic' }))
      .toEqual({ style: 'schematic' });
  });

  it('не падает на не-объектах и массивах', () => {
    for (const bad of [null, undefined, 42, 'dark', [{ theme: 'dark' }]]) {
      expect(sanitizePrefs(bad)).toEqual({});
    }
  });

  it('булевы флаги принимаются только настоящими булевыми', () => {
    expect(sanitizePrefs({ voiceInput: false })).toEqual({ voiceInput: false });
    expect(sanitizePrefs({ voiceInput: 'false' })).toEqual({});
  });
});

describe('mergePrefs', () => {
  it('патч перекрывает только пришедшие ключи', () => {
    const current = { theme: 'dark' as const, quality: 'max' as const };
    expect(mergePrefs(current, { quality: 'fast' }))
      .toEqual({ theme: 'dark', quality: 'fast' });
  });

  it('мусор в патче не стирает существующие настройки', () => {
    const current = { theme: 'dark' as const };
    expect(mergePrefs(current, { theme: 'neon' })).toEqual({ theme: 'dark' });
  });
});

describe('sanitizeDisplayName', () => {
  it('undefined означает «не трогать», пустая строка — «убрать»', () => {
    expect(sanitizeDisplayName(undefined)).toBeUndefined();
    expect(sanitizeDisplayName('   ')).toBeNull();
    expect(sanitizeDisplayName(null)).toBeNull();
  });

  it('схлопывает пробелы и обрезает по длине', () => {
    expect(sanitizeDisplayName('  Нурлыхан   К.  ')).toBe('Нурлыхан К.');
    expect(sanitizeDisplayName('я'.repeat(200))).toHaveLength(MAX_DISPLAY_NAME);
  });
});
