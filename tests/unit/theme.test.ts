import { describe, it, expect } from 'vitest';
import { isTheme, resolveTheme, THEME_BOOT_SCRIPT, THEME_KEY } from '@/lib/theme';

describe('тема оформления', () => {
  it('распознаёт только три допустимых значения', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(true);
    expect(isTheme('neon')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it('«системная» разворачивается в светлую или тёмную по настройке ОС', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    // Явный выбор системную настройку игнорирует.
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('загрузочный скрипт читает тот же ключ, что и клиент, и падает в светлую', () => {
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(THEME_KEY));
    expect(THEME_BOOT_SCRIPT).toContain("setAttribute('data-theme','light')");
  });
});
