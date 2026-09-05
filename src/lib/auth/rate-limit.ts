const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, number[]>();

/**
 * Скользящее окно в памяти процесса. Пробной версии этого достаточно: цель —
 * не дать перебирать пароли в лоб, а не пережить перезапуск.
 */
function pruned(key: string): number[] {
  const now = Date.now();
  const fresh = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, fresh);
  return fresh;
}

/**
 * Проверка БЕЗ расхода попытки — вызывается до обращения к базе, чтобы не тратить
 * время на проверку пароля, если ключ уже исчерпал лимит.
 */
export function isLimited(key: string): boolean {
  return pruned(key).length >= MAX_ATTEMPTS;
}

/**
 * Расходует одну попытку. Вызывается только на неудачном входе: успешный вход
 * лимит не трогает, иначе десять подряд правильных входов положили бы форму.
 */
export function recordFailure(key: string): void {
  const fresh = pruned(key);
  fresh.push(Date.now());
  attempts.set(key, fresh);
}

export function __resetAttemptsForTests(): void {
  attempts.clear();
}
