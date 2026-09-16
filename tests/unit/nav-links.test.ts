import { describe, it, expect } from 'vitest';
import { isSectionActive } from '@/components/NavLinks';

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
