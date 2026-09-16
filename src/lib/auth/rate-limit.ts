const WINDOW_MS = 15 * 60 * 1000;

/** Неверный пароль к одному существующему аккаунту. */
export const IDENTIFIER_LIMIT = 10;
/** Входы в несуществующие аккаунты с одного IP — перебор логинов. */
export const UNKNOWN_IP_LIMIT = 50;
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
const ipUnknownKey = (ip: string) => `ip-unknown:${ip}`;
const ipAllKey = (ip: string) => `ip-all:${ip}`;

/**
 * Вход закрыт, если исчерпан счётчик идентификатора или любой счётчик IP.
 * Исчерпанный IP закрывает и верные входы: иначе перебор одного частого пароля
 * по списку логинов продолжал бы находить совпадения (неудачи — 429, успехи — 200).
 */
export function isLoginBlocked(ip: string, identifier: string | null): boolean {
  return isLimited(ipAllKey(ip), IP_LIMIT)
    || isLimited(ipUnknownKey(ip), UNKNOWN_IP_LIMIT)
    || (identifier !== null && isLimited(idKey(identifier), IDENTIFIER_LIMIT));
}

/**
 * accountExists сообщает только вызывающий роут; клиент видит одинаковый 401
 * в обоих случаях, поэтому разделение счётчиков оракула не создаёт.
 */
export function recordLoginFailure(ip: string, identifier: string | null, accountExists: boolean): void {
  recordFailure(ipAllKey(ip));
  if (accountExists && identifier !== null) recordFailure(idKey(identifier));
  else recordFailure(ipUnknownKey(ip));
}

export function __resetAttemptsForTests(): void {
  attempts.clear();
}
