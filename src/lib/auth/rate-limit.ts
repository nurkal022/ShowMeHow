import crypto from 'node:crypto';
import { db, hasDb } from '../db/client';

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Неверный пароль к одному идентификатору — считается одинаково для существующего
 * и несуществующего аккаунта, иначе разница между 401 и 429 сама стала бы оракулом.
 */
export const IDENTIFIER_LIMIT = 10;
/**
 * Любые неудачи с одного IP. Школа выходит в интернет через один адрес, поэтому
 * порог высокий: класс с опечатками до него не доходит.
 */
export const IP_LIMIT = 300;

export interface AttemptStore {
  /** Неудачи по ключу за последние пятнадцать минут. */
  count(key: string): Promise<number>;
  add(key: string): Promise<void>;
  /** Удаляет попытки старше суток; возвращает число удалённых. */
  purge(): Promise<number>;
}

// Карты хранилищ в памяти — только для тестовых помощников внизу файла.
const memoryMaps = new WeakMap<AttemptStore, Map<string, number[]>>();
// Хранилища на базе — тестовые помощники работают с ними прямым SQL.
const pgStores = new WeakSet<AttemptStore>();

/**
 * Хранилище в памяти процесса — для запуска без базы (разработка и юнит-тесты).
 * Проверка ничего не создаёт, а запись отбрасывает вышедшие из окна попытки ключа,
 * поэтому карта не растёт от одних проверок.
 */
export function createMemoryAttemptStore(now: () => number = Date.now): AttemptStore {
  const attempts = new Map<string, number[]>();
  const fresh = (key: string, t: number) => (attempts.get(key) ?? []).filter((at) => t - at < WINDOW_MS);
  const store: AttemptStore = {
    async count(key) {
      return fresh(key, now()).length;
    },
    async add(key) {
      const t = now();
      attempts.set(key, [...fresh(key, t), t]);
    },
    async purge() {
      const t = now();
      let removed = 0;
      for (const [key, list] of attempts) {
        const kept = list.filter((at) => t - at <= DAY_MS);
        removed += list.length - kept.length;
        if (kept.length) attempts.set(key, kept);
        else attempts.delete(key);
      }
      return removed;
    },
  };
  memoryMaps.set(store, attempts);
  return store;
}

/**
 * Счётчики в базе: их видят все экземпляры веба, и рестарт их не обнуляет.
 * Строки старше суток удаляет уборщик воркера (purgeOldAttempts).
 */
export function createPgAttemptStore(): AttemptStore {
  const store: AttemptStore = {
    async count(key) {
      const { rows } = await db().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM login_attempts
         WHERE key = $1 AND at > now() - interval '${WINDOW_MINUTES} minutes'`, [key]);
      return rows[0].n;
    },
    async add(key) {
      await db().query('INSERT INTO login_attempts (key) VALUES ($1)', [key]);
    },
    async purge() {
      const r = await db().query("DELETE FROM login_attempts WHERE at < now() - interval '1 day'");
      return r.rowCount ?? 0;
    },
  };
  pgStores.add(store);
  return store;
}

let override: AttemptStore | null = null;
let memory: AttemptStore | null = null;
let pg: AttemptStore | null = null;

/**
 * Как getJobStore(): Postgres при заданном DATABASE_URL, память без него. В продакшне
 * работа без базы — ошибка конфигурации: счётчики в памяти не общие для процессов.
 */
function attempts(): AttemptStore {
  if (override) return override;
  if (hasDb()) return (pg ??= createPgAttemptStore());
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL не задан: в продакшне лимиты входа без базы данных запрещены');
  }
  return (memory ??= createMemoryAttemptStore());
}

/** Проверка БЕЗ расхода попытки. */
export async function isLimited(key: string, max: number = IDENTIFIER_LIMIT): Promise<boolean> {
  return (await attempts().count(key)) >= max;
}

/** Расходует одну попытку. Успешный вход лимит не трогает. */
export async function recordFailure(key: string): Promise<void> {
  await attempts().add(key);
}

/**
 * Идентификатор и IP приходят от клиента и могут весить мегабайты: в хранилище
 * кладём их sha256, иначе поток таких запросов раздувал бы память и таблицу.
 */
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const idKey = (identifier: string) => `id:${digest(identifier)}`;
const ipAllKey = (ip: string) => `ip-all:${digest(ip)}`;

/**
 * Вход закрыт, если исчерпан счётчик IP или (когда идентификатор задан) его
 * собственный счётчик. Исчерпанный IP закрывает и верные входы: иначе перебор
 * одного частого пароля по списку логинов продолжал бы находить совпадения
 * (неудачи — 429, успехи — 200).
 *
 * ip === null — адрес клиента неизвестен (нет доверенного прокси, см. clientIp):
 * счётчик IP тогда не ведётся, иначе все запросы делили бы один ключ и триста
 * чужих ошибок закрывали бы вход всему сайту.
 */
export async function isLoginBlocked(ip: string | null, identifier: string | null): Promise<boolean> {
  const checks: Promise<boolean>[] = [];
  if (ip !== null) checks.push(isLimited(ipAllKey(ip), IP_LIMIT));
  if (identifier !== null) checks.push(isLimited(idKey(identifier), IDENTIFIER_LIMIT));
  return (await Promise.all(checks)).some(Boolean);
}

/**
 * Счётчик идентификатора растёт на любой неудаче — существует аккаунт или нет.
 * Если бы несуществующие идентификаторы его не трогали, ответ (401 против 429
 * после десятой попытки) сам выдавал бы, зарегистрирован ли идентификатор.
 * Так оба случая после одинакового числа попыток дают одинаковый код ответа.
 */
export async function recordLoginFailure(ip: string | null, identifier: string | null): Promise<void> {
  if (ip !== null) await recordFailure(ipAllKey(ip));
  if (identifier !== null) await recordFailure(idKey(identifier));
}

/** Удаляет попытки старше суток. Вызывается уборщиком воркера. */
export async function purgeOldAttempts(): Promise<number> {
  return attempts().purge();
}

/** Подмена хранилища в тестах; null возвращает автоматический выбор. */
export function __setAttemptStoreForTests(store: AttemptStore | null): void {
  override = store;
}

/**
 * Тестовые помощники стирают и читают счётчики входа. Вне vitest они отказываются
 * работать: случайный вызов в продакшне снял бы все лимиты.
 */
function assertTestRun(name: string): void {
  if (!process.env.VITEST) throw new Error(`${name} доступен только в тестах`);
}

type TestTarget = { kind: 'memory'; map: Map<string, number[]> } | { kind: 'pg' };

function testTarget(name: string): TestTarget {
  const store = attempts();
  const map = memoryMaps.get(store);
  if (map) return { kind: 'memory', map };
  if (pgStores.has(store)) return { kind: 'pg' };
  throw new Error(`${name}: неизвестное хранилище попыток`);
}

/** Очищает текущее хранилище: память процесса или таблицу login_attempts. */
export async function __resetAttemptsForTests(): Promise<void> {
  assertTestRun('__resetAttemptsForTests');
  const target = testTarget('__resetAttemptsForTests');
  if (target.kind === 'memory') target.map.clear();
  else await db().query('DELETE FROM login_attempts');
}

/** Ключи, под которыми лежат попытки в текущем хранилище. */
export async function __attemptKeysForTests(): Promise<string[]> {
  assertTestRun('__attemptKeysForTests');
  const target = testTarget('__attemptKeysForTests');
  if (target.kind === 'memory') return [...target.map.keys()];
  const { rows } = await db().query<{ key: string }>('SELECT DISTINCT key FROM login_attempts ORDER BY key');
  return rows.map((r) => r.key);
}
