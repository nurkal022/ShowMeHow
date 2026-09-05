import { describe, it, expect, beforeEach } from 'vitest';
import { isLimited, recordFailure, __resetAttemptsForTests } from '@/lib/auth/rate-limit';

describe('rate-limit', () => {
  beforeEach(() => __resetAttemptsForTests());

  it('ключ без попыток не лимитирован', () => {
    expect(isLimited('k')).toBe(false);
  });

  it('isLimited сам по себе не расходует попытку', () => {
    for (let i = 0; i < 100; i++) isLimited('k');
    expect(isLimited('k')).toBe(false);
  });

  it('после десяти неудач ключ лимитирован', () => {
    for (let i = 0; i < 9; i++) {
      recordFailure('k');
      expect(isLimited('k')).toBe(false);
    }
    recordFailure('k');
    expect(isLimited('k')).toBe(true);
  });

  it('ключи независимы', () => {
    for (let i = 0; i < 10; i++) recordFailure('a');
    expect(isLimited('a')).toBe(true);
    expect(isLimited('b')).toBe(false);
  });
});
