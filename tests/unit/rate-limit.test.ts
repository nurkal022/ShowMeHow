import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLimited, recordFailure, __resetAttemptsForTests,
  isLoginBlocked, recordLoginFailure, IDENTIFIER_LIMIT, IP_LIMIT, __attemptKeysForTests,
  purgeOldAttempts, createMemoryAttemptStore, __setAttemptStoreForTests,
} from '@/lib/auth/rate-limit';

describe('rate-limit', () => {
  beforeEach(async () => { await __resetAttemptsForTests(); });

  it('ключ без попыток не лимитирован', async () => {
    expect(await isLimited('k')).toBe(false);
  });

  it('isLimited сам по себе не расходует попытку', async () => {
    for (let i = 0; i < 100; i++) await isLimited('k');
    expect(await isLimited('k')).toBe(false);
  });

  it('после десяти неудач ключ лимитирован', async () => {
    for (let i = 0; i < 9; i++) {
      await recordFailure('k');
      expect(await isLimited('k')).toBe(false);
    }
    await recordFailure('k');
    expect(await isLimited('k')).toBe(true);
  });

  it('ключи независимы', async () => {
    for (let i = 0; i < 10; i++) await recordFailure('a');
    expect(await isLimited('a')).toBe(true);
    expect(await isLimited('b')).toBe(false);
  });
});

describe('лимит входа по двум счётчикам', () => {
  beforeEach(async () => { await __resetAttemptsForTests(); });
  const IP = '203.0.113.7';

  it('пороги: 10 по идентификатору и 300 всего с одного IP', () => {
    expect([IDENTIFIER_LIMIT, IP_LIMIT]).toEqual([10, 300]);
  });

  it('30 неудач по разным идентификаторам с одного IP не блокируют вход', async () => {
    for (let i = 0; i < 30; i++) await recordLoginFailure(IP, `student${i}`);
    expect(await isLoginBlocked(IP, 'student31')).toBe(false);
    expect(await isLoginBlocked(IP, 'student0')).toBe(false);
  });

  it('после 10 неудач по одному идентификатору 11-я попытка блокируется с любого IP', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(`10.0.0.${i}`, 'ivanov');
    expect(await isLoginBlocked('10.0.0.99', 'ivanov')).toBe(true);
    expect(await isLoginBlocked('10.0.0.99', 'petrov')).toBe(false);
  });

  it('счётчик идентификатора растёт одинаково для несуществующего логина — оракула по коду ответа нет', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(`10.1.0.${i}`, 'nobody');
    expect(await isLoginBlocked('10.9.9.9', 'nobody')).toBe(true);
  });

  it('300 неудач с одного IP закрывают вход для 301-й попытки', async () => {
    for (let i = 0; i < 299; i++) await recordLoginFailure(IP, `s${i % 25}x${i}`);
    expect(await isLoginBlocked(IP, 'fresh')).toBe(false);
    await recordLoginFailure(IP, 'last');
    expect(await isLoginBlocked(IP, 'fresh')).toBe(true);
  });

  it('без идентификатора проверяется только счётчик IP', async () => {
    expect(await isLoginBlocked(IP, null)).toBe(false);
    for (let i = 0; i < 299; i++) await recordLoginFailure(IP, null);
    expect(await isLoginBlocked(IP, null)).toBe(false);
    await recordLoginFailure(IP, null);
    expect(await isLoginBlocked(IP, null)).toBe(true);
  });

  it('без адреса клиента счётчика IP нет: 301 неудача не закрывает другие идентификаторы', async () => {
    for (let i = 0; i < 301; i++) await recordLoginFailure(null, `s${i}`);
    expect(await isLoginBlocked(null, 'fresh')).toBe(false);
    expect(await isLoginBlocked(null, null)).toBe(false);
    // Счётчик идентификатора при этом работает как обычно.
    for (let i = 0; i < 10; i++) await recordLoginFailure(null, 'ivanov');
    expect(await isLoginBlocked(null, 'ivanov')).toBe(true);
  });
});

describe('ключи счётчиков', () => {
  beforeEach(async () => { await __resetAttemptsForTests(); });

  it('мегабайтный идентификатор и IP не попадают в хранилище как есть', async () => {
    const huge = 'я'.repeat(1_000_000);
    const hugeIp = '1'.repeat(1_000_000);
    for (let i = 0; i < 10; i++) await recordLoginFailure(hugeIp, huge);
    const keys = await __attemptKeysForTests();
    expect(keys).toHaveLength(2);
    for (const k of keys) expect(k.length).toBeLessThan(100);
    // Хеш не ломает сам счётчик.
    expect(await isLoginBlocked('10.0.0.1', huge)).toBe(true);
    expect(await isLoginBlocked('10.0.0.1', huge + 'x')).toBe(false);
  });
});

describe('хранилище попыток в памяти', () => {
  it('окно в пятнадцать минут и уборка старше суток', async () => {
    let t = 0;
    __setAttemptStoreForTests(createMemoryAttemptStore(() => t));
    try {
      for (let i = 0; i < 10; i++) await recordLoginFailure('10.0.0.1', 'ivanov');
      expect(await isLoginBlocked('10.0.0.2', 'ivanov')).toBe(true);
      t += 15 * 60_000 - 1;
      expect(await isLoginBlocked('10.0.0.2', 'ivanov')).toBe(true);
      t += 1;
      expect(await isLoginBlocked('10.0.0.2', 'ivanov')).toBe(false);
      expect(await purgeOldAttempts()).toBe(0);
      t += 24 * 60 * 60_000;
      // Десять попыток по идентификатору и десять по IP.
      expect(await purgeOldAttempts()).toBe(20);
      expect(await __attemptKeysForTests()).toEqual([]);
    } finally {
      __setAttemptStoreForTests(null);
    }
  });
});
