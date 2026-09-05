import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/components/AuthForm';

describe('safeNextPath', () => {
  it('пропускает обычный внутренний путь', () => {
    expect(safeNextPath('/library')).toBe('/library');
    expect(safeNextPath('/simulations/123?tab=x')).toBe('/simulations/123?tab=x');
  });

  it('отбрасывает чужой домен на "/"', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
  });

  it('отбрасывает protocol-relative адрес на "/"', () => {
    expect(safeNextPath('//evil.example')).toBe('/');
  });

  it('отбрасывает javascript: на "/"', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe('/');
  });

  it('пустое или отсутствующее значение даёт "/"', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('')).toBe('/');
  });
});
