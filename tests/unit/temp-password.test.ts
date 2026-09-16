import { describe, it, expect } from 'vitest';
import { generateTempPassword, TEMP_PASSWORD_WORDS } from '@/lib/auth/temp-password';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';

describe('временный пароль', () => {
  it('три слова через дефис из словаря', () => {
    for (let i = 0; i < 500; i++) {
      const pw = generateTempPassword();
      const words = pw.split('-');
      expect(words).toHaveLength(3);
      for (const w of words) expect(TEMP_PASSWORD_WORDS).toContain(w);
      expect(pw.length).toBeGreaterThanOrEqual(8);
      expect(pw.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it('берёт слова по индексам из генератора случайных чисел', () => {
    const seq = [0, 1, 2];
    let i = 0;
    expect(generateTempPassword(() => seq[i++])).toBe('лиса-дом-семь');
  });

  it('генератору передаётся размер словаря', () => {
    const seen: number[] = [];
    generateTempPassword((max) => { seen.push(max); return 0; });
    expect(seen).toEqual([TEMP_PASSWORD_WORDS.length, TEMP_PASSWORD_WORDS.length, TEMP_PASSWORD_WORDS.length]);
  });

  it('словарь: не меньше 40 разных коротких слов строчной кириллицей без ё и й', () => {
    expect(TEMP_PASSWORD_WORDS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TEMP_PASSWORD_WORDS).size).toBe(TEMP_PASSWORD_WORDS.length);
    for (const w of TEMP_PASSWORD_WORDS) expect(w).toMatch(/^[а-еж-ик-я]{3,6}$/);
  });

  it('в словаре нет слов, отличающихся одной буквой', () => {
    const close = (a: string, b: string) =>
      a.length === b.length && [...a].filter((ch, k) => ch !== b[k]).length === 1;
    for (const a of TEMP_PASSWORD_WORDS) {
      for (const b of TEMP_PASSWORD_WORDS) {
        if (a !== b) expect(close(a, b), `${a} и ${b}`).toBe(false);
      }
    }
  });
});
