import { describe, it, expect } from 'vitest';
import { newPasswordError, MIN_NEW_PASSWORD_LENGTH } from '@/components/ForcePasswordChange';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';

describe('проверка нового пароля в форме', () => {
  it('порог совпадает с серверным', () => {
    expect(MIN_NEW_PASSWORD_LENGTH).toBe(MIN_PASSWORD_LENGTH);
  });
  it('короткий пароль отклоняется раньше несовпадения', () => {
    expect(newPasswordError('корот', 'другой')).toBe('Пароль должен быть не короче 8 символов.');
  });
  it('несовпадающие пароли отклоняются', () => {
    expect(newPasswordError('мой-пароль-1', 'мой-пароль-2')).toBe('Пароли не совпадают.');
  });
  it('совпадающий достаточно длинный пароль проходит', () => {
    expect(newPasswordError('мой-пароль-1', 'мой-пароль-1')).toBeNull();
  });
});
