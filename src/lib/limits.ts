export const MAX_CONCURRENT = 2;

interface Waiting {
  jobId: string;
  userId: string;
  start: () => void;
}

const running = new Map<string, string>();   // jobId → userId
const queue: Waiting[] = [];
let listener: ((jobId: string, position: number) => void) | null = null;

/** Кого оповещать о сдвиге очереди. Ставится один раз при инициализации jobs.ts. */
export function setQueueListener(cb: (jobId: string, position: number) => void): void {
  listener = cb;
}

// Место в очереди видит пользователь, поэтому после любого сдвига всем ожидающим
// рассылается их новая позиция — иначе «перед вами 3» висело бы до самого старта.
function announce(): void {
  if (!listener) return;
  queue.forEach((w, i) => listener!(w.jobId, i + 1));
}

/** Есть ли у пользователя задание, которое уже идёт или ждёт очереди. */
export function hasActive(userId: string): boolean {
  for (const owner of running.values()) if (owner === userId) return true;
  return queue.some((w) => w.userId === userId);
}

/**
 * Одна генерация — это Chromium и несколько минут работы, поэтому одновременных
 * не больше MAX_CONCURRENT на весь сервер. Сверх лимита задание ждёт в FIFO-очереди.
 */
export function submit(jobId: string, userId: string, start: () => void): 'running' | 'queued' {
  if (running.size < MAX_CONCURRENT) {
    running.set(jobId, userId);
    start();
    return 'running';
  }
  queue.push({ jobId, userId, start });
  return 'queued';
}

/** Задание завершилось (или снято из очереди) — освобождает место и двигает очередь. */
export function finish(jobId: string): void {
  running.delete(jobId);
  const idx = queue.findIndex((w) => w.jobId === jobId);
  if (idx !== -1) queue.splice(idx, 1);
  while (running.size < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()!;
    running.set(next.jobId, next.userId);
    next.start();
  }
  announce();
}

/** Место в очереди, считая с единицы; 0 — задание не ждёт. */
export function queuePosition(jobId: string): number {
  const idx = queue.findIndex((w) => w.jobId === jobId);
  return idx === -1 ? 0 : idx + 1;
}

export function __resetLimitsForTests(): void {
  running.clear();
  queue.length = 0;
  listener = null;
}
