import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLimited, recordFailure, __resetAttemptsForTests,
  isLoginBlocked, recordLoginFailure, IDENTIFIER_LIMIT, IP_LIMIT,
} from '@/lib/auth/rate-limit';

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

describe('лимит входа по двум счётчикам', () => {
  beforeEach(() => __resetAttemptsForTests());
  const IP = '203.0.113.7';

  it('пороги: 10 по идентификатору и 300 всего с одного IP', () => {
    expect([IDENTIFIER_LIMIT, IP_LIMIT]).toEqual([10, 300]);
  });

  it('30 неудач по разным идентификаторам с одного IP не блокируют вход', () => {
    for (let i = 0; i < 30; i++) recordLoginFailure(IP, `student${i}`);
    expect(isLoginBlocked(IP, 'student31')).toBe(false);
    expect(isLoginBlocked(IP, 'student0')).toBe(false);
  });

  it('после 10 неудач по одному идентификатору 11-я попытка блокируется с любого IP', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure(`10.0.0.${i}`, 'ivanov');
    expect(isLoginBlocked('10.0.0.99', 'ivanov')).toBe(true);
    expect(isLoginBlocked('10.0.0.99', 'petrov')).toBe(false);
  });

  it('счётчик идентификатора растёт одинаково для несуществующего логина — оракула по коду ответа нет', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure(`10.1.0.${i}`, 'nobody');
    expect(isLoginBlocked('10.9.9.9', 'nobody')).toBe(true);
  });

  it('300 неудач с одного IP закрывают вход для 301-й попытки', () => {
    for (let i = 0; i < 299; i++) recordLoginFailure(IP, `s${i % 25}x${i}`);
    expect(isLoginBlocked(IP, 'fresh')).toBe(false);
    recordLoginFailure(IP, 'last');
    expect(isLoginBlocked(IP, 'fresh')).toBe(true);
  });

  it('без идентификатора проверяется только счётчик IP', () => {
    expect(isLoginBlocked(IP, null)).toBe(false);
    for (let i = 0; i < 299; i++) recordLoginFailure(IP, null);
    expect(isLoginBlocked(IP, null)).toBe(false);
    recordLoginFailure(IP, null);
    expect(isLoginBlocked(IP, null)).toBe(true);
  });
});
