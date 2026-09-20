import { describe, it, expect } from 'vitest';
import { ICONS, isSectionActive } from '@/components/NavLinks';
import { ALL_NAV_SECTIONS } from '@/lib/org/policy';

describe('активный раздел', () => {
  it('«Создать» активен только на корне', () => {
    expect(isSectionActive('/', '/')).toBe(true);
    expect(isSectionActive('/', '/library')).toBe(false);
  });
  it('остальные — по префиксу пути', () => {
    expect(isSectionActive('/library', '/library')).toBe(true);
    expect(isSectionActive('/labs', '/labs/chem')).toBe(true);
    expect(isSectionActive('/labs', '/library')).toBe(false);
    expect(isSectionActive('/labs', null)).toBe(false);
  });
});

describe('иконки разделов', () => {
  it('у каждого раздела есть иконка', () => {
    for (const s of ALL_NAV_SECTIONS) expect(ICONS[s.key]).toBeTypeOf('function');
  });
  it('«Лаборатории» не подсвечиваются на «Курсах» и наоборот', () => {
    expect(isSectionActive('/learn', '/learn/topics/1')).toBe(true);
    expect(isSectionActive('/labs', '/learn')).toBe(false);
  });
  it('«Моё обучение» и «Каталог» делят префикс /learn, но не подсвечиваются вместе', () => {
    expect(isSectionActive('/learn', '/learn/catalog')).toBe(false);
    expect(isSectionActive('/learn/catalog', '/learn/catalog')).toBe(true);
    expect(isSectionActive('/learn', '/learn/courses/1')).toBe(true);
    // Личные страницы ученика живут в меню аккаунта — в шапке ничего не горит.
    expect(isSectionActive('/learn', '/learn/grades')).toBe(false);
    expect(isSectionActive('/learn', '/learn/me')).toBe(false);
  });
});
