const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, number[]>();

/**
 * Скользящее окно в памяти процесса. Пробной версии этого достаточно: цель —
 * не дать перебирать пароли в лоб, а не пережить перезапуск.
 */
export function hitLimit(key: string): boolean {
  const now = Date.now();
  const fresh = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  fresh.push(now);
  attempts.set(key, fresh);
  return fresh.length > MAX_ATTEMPTS;
}

export function __resetAttemptsForTests(): void {
  attempts.clear();
}
