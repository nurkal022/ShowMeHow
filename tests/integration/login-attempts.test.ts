import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import {
  isLoginBlocked, recordLoginFailure, purgeOldAttempts, __resetAttemptsForTests,
  __attemptKeysForTests, createPgAttemptStore,
} from '@/lib/auth/rate-limit';

const SCHEMA = 'login_attempts_test';
const pool = testDb(SCHEMA);
const IP = '203.0.113.30';

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await __resetAttemptsForTests();
});
afterAll(async () => { await pool?.end(); await closeDb(); });

async function rows(): Promise<number> {
  const { rows: r } = await pool!.query<{ n: number }>('SELECT count(*)::int AS n FROM login_attempts');
  return r[0].n;
}

// Те же правила, что юниты цикла 0, но счётчики лежат в базе и общие для всех процессов.
describe.skipIf(!pool)('лимиты входа в базе', () => {
  it('попытки пишутся в login_attempts под хешированными ключами', async () => {
    await recordLoginFailure(IP, 'ivanov');
    expect(await rows()).toBe(2);
    const keys = await __attemptKeysForTests();
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      expect(k).not.toContain('ivanov');
      expect(k).not.toContain(IP);
    }
  });

  it('тридцать неудач по разным аккаунтам с одного IP не закрывают вход', async () => {
    for (let i = 0; i < 30; i++) await recordLoginFailure(IP, `ученик${i}`);
    expect(await isLoginBlocked(IP, 'ученик31')).toBe(false);
    expect(await isLoginBlocked(IP, 'ученик0')).toBe(false);
  });

  it('после десяти неудач идентификатор закрыт с любого IP — существует аккаунт или нет', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(`10.0.0.${i}`, 'ivanov');
    expect(await isLoginBlocked('10.0.0.99', 'ivanov')).toBe(true);
    expect(await isLoginBlocked('10.0.0.99', 'petrov')).toBe(false);
  });

  it('301-я попытка с одного IP закрыта, с другого IP — нет', async () => {
    for (let i = 0; i < 299; i++) await recordLoginFailure(IP, `s${i}`);
    expect(await isLoginBlocked(IP, 'fresh')).toBe(false);
    await recordLoginFailure(IP, 's299');
    expect(await isLoginBlocked(IP, 'fresh')).toBe(true);
    expect(await isLoginBlocked(IP, null)).toBe(true);
    expect(await isLoginBlocked('198.51.100.1', 'fresh')).toBe(false);
  });

  it('без адреса клиента счётчик IP не ведётся', async () => {
    for (let i = 0; i < 301; i++) await recordLoginFailure(null, `s${i}`);
    expect(await rows()).toBe(301);
    expect(await isLoginBlocked(null, 'fresh')).toBe(false);
  });

  it('счётчики общие: отдельный экземпляр хранилища видит те же попытки', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(IP, 'shared');
    const other = createPgAttemptStore();
    const counts = await Promise.all((await __attemptKeysForTests()).map((k) => other.count(k)));
    expect(counts).toEqual([10, 10]);
  });

  it('сброс для тестов очищает таблицу', async () => {
    await recordLoginFailure(IP, 'gone');
    await __resetAttemptsForTests();
    expect(await rows()).toBe(0);
  });

  it('старые попытки не считаются и удаляются уборщиком', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(IP, 'old');
    expect(await isLoginBlocked(IP, 'old')).toBe(true);
    await pool!.query("UPDATE login_attempts SET at = now() - interval '16 minutes'");
    expect(await isLoginBlocked(IP, 'old')).toBe(false);
    expect(await purgeOldAttempts()).toBe(0);
    await pool!.query("UPDATE login_attempts SET at = now() - interval '2 days'");
    await recordLoginFailure(IP, 'fresh');
    expect(await purgeOldAttempts()).toBe(20);
    expect(await rows()).toBe(2);
  });
});
