import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLimited, recordFailure, __resetAttemptsForTests,
  isLoginBlocked, recordLoginFailure, IDENTIFIER_LIMIT, UNKNOWN_IP_LIMIT, IP_LIMIT,
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

describe('лимит входа по трём счётчикам', () => {
  beforeEach(() => __resetAttemptsForTests());
  const IP = '203.0.113.7';

  it('пороги: 10 по идентификатору, 50 неизвестных и 300 всего с одного IP', () => {
    expect([IDENTIFIER_LIMIT, UNKNOWN_IP_LIMIT, IP_LIMIT]).toEqual([10, 50, 300]);
  });

  it('30 неудач по разным существующим аккаунтам с одного IP не блокируют вход', () => {
    for (let i = 0; i < 30; i++) recordLoginFailure(IP, `student${i}`, true);
    expect(isLoginBlocked(IP, 'student31')).toBe(false);
    expect(isLoginBlocked(IP, 'student0')).toBe(false);
  });

  it('после 50 неудач по несуществующим аккаунтам 51-я попытка блокируется для всех', () => {
    for (let i = 0; i < 49; i++) recordLoginFailure(IP, `ghost${i}`, false);
    expect(isLoginBlocked(IP, 'ghost-next')).toBe(false);
    recordLoginFailure(IP, 'ghost49', false);
    expect(isLoginBlocked(IP, 'ghost-next')).toBe(true);
    // Исчерпанный счётчик IP закрывает вход и в существующий аккаунт.
    expect(isLoginBlocked(IP, 'real.student')).toBe(true);
    expect(isLoginBlocked('198.51.100.1', 'real.student')).toBe(false);
  });

  it('после 10 неверных паролей к одному аккаунту 11-я попытка блокируется с любого IP', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure(`10.0.0.${i}`, 'ivanov', true);
    expect(isLoginBlocked('10.0.0.99', 'ivanov')).toBe(true);
    expect(isLoginBlocked('10.0.0.99', 'petrov')).toBe(false);
  });

  it('неудача по несуществующему аккаунту не растит счётчик идентификатора', () => {
    for (let i = 0; i < 20; i++) recordLoginFailure(`10.1.0.${i}`, 'nobody', false);
    expect(isLoginBlocked('10.9.9.9', 'nobody')).toBe(false);
  });

  it('300 неудач любого рода с одного IP закрывают вход', () => {
    for (let i = 0; i < 299; i++) recordLoginFailure(IP, `s${i % 25}x${i}`, true);
    expect(isLoginBlocked(IP, 'fresh')).toBe(false);
    recordLoginFailure(IP, 'last', true);
    expect(isLoginBlocked(IP, 'fresh')).toBe(true);
  });

  it('без идентификатора проверяются только счётчики IP', () => {
    expect(isLoginBlocked(IP, null)).toBe(false);
    recordLoginFailure(IP, null, true);  // без идентификатора считается как неизвестный
    for (let i = 0; i < 49; i++) recordLoginFailure(IP, null, false);
    expect(isLoginBlocked(IP, null)).toBe(true);
  });
});
