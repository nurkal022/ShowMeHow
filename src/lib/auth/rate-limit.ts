const WINDOW_MS = 15 * 60 * 1000;

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

const attempts = new Map<string, number[]>();

/**
 * Скользящее окно в памяти процесса. В базу хранилище переносит цикл 1.
 * Пустые окна удаляются, чтобы карта не росла от одних проверок.
 */
function pruned(key: string): number[] {
  const now = Date.now();
  const fresh = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (fresh.length) attempts.set(key, fresh);
  else attempts.delete(key);
  return fresh;
}

/** Проверка БЕЗ расхода попытки. */
export function isLimited(key: string, max: number = IDENTIFIER_LIMIT): boolean {
  return pruned(key).length >= max;
}

/** Расходует одну попытку. Успешный вход лимит не трогает. */
export function recordFailure(key: string): void {
  const fresh = pruned(key);
  fresh.push(Date.now());
  attempts.set(key, fresh);
}

const idKey = (identifier: string) => `id:${identifier}`;
const ipAllKey = (ip: string) => `ip-all:${ip}`;

/**
 * Вход закрыт, если исчерпан счётчик IP или (когда идентификатор задан) его
 * собственный счётчик. Исчерпанный IP закрывает и верные входы: иначе перебор
 * одного частого пароля по списку логинов продолжал бы находить совпадения
 * (неудачи — 429, успехи — 200).
 */
export function isLoginBlocked(ip: string, identifier: string | null): boolean {
  return isLimited(ipAllKey(ip), IP_LIMIT)
    || (identifier !== null && isLimited(idKey(identifier), IDENTIFIER_LIMIT));
}

/**
 * Счётчик идентификатора растёт на любой неудаче — существует аккаунт или нет.
 * Если бы несуществующие идентификаторы его не трогали, ответ (401 против 429
 * после десятой попытки) сам выдавал бы, зарегистрирован ли идентификатор.
 * Так оба случая после одинакового числа попыток дают одинаковый код ответа.
 */
export function recordLoginFailure(ip: string, identifier: string | null): void {
  recordFailure(ipAllKey(ip));
  if (identifier !== null) recordFailure(idKey(identifier));
}

export function __resetAttemptsForTests(): void {
  attempts.clear();
}
