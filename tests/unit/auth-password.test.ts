import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('пароли', () => {
  it('хеш не содержит пароля и проверяется', () => {
    const stored = hashPassword('очень секретно');
    expect(stored).not.toContain('очень секретно');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('очень секретно', stored)).toBe(true);
    expect(verifyPassword('другое', stored)).toBe(false);
  });

  it('два хеша одного пароля различаются солью', () => {
    expect(hashPassword('одинаковый')).not.toBe(hashPassword('одинаковый'));
  });

  it('повреждённая строка хеша не роняет проверку', () => {
    expect(verifyPassword('x', 'мусор')).toBe(false);
    expect(verifyPassword('x', 'scrypt$нехекс$нехекс')).toBe(false);
  });
});
