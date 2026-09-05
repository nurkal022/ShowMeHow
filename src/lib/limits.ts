export const MAX_CONCURRENT = 2;

interface Waiting {
  jobId: string;
  userId: string;
  start: () => void;
}

const running = new Map<string, string>();   // jobId → userId
const queue: Waiting[] = [];
// Пользователи, за которыми место уже закреплено, но задание ещё не создано.
// Между проверкой «нет ли активной генерации» и submit в роуте стоят два await
// (запрос квоты и INSERT задания), поэтому без синхронного резервирования два
// одновременных POST одного пользователя проходили проверку оба.
const reservations = new Set<string>();
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

/** Есть ли у пользователя задание, которое уже идёт, ждёт очереди или зарезервировано. */
export function hasActive(userId: string): boolean {
  if (reservations.has(userId)) return true;
  for (const owner of running.values()) if (owner === userId) return true;
  return queue.some((w) => w.userId === userId);
}

/**
 * Синхронно закрепляет за пользователем единственную активную генерацию.
 * false — у него уже есть идущая, ожидающая или зарезервированная. Между этим
 * вызовом и submit не должно быть ни одного await, который мог бы пропустить
 * второй запрос вперёд.
 */
export function reserveUser(userId: string): boolean {
  if (hasActive(userId)) return false;
  reservations.add(userId);
  return true;
}

/** Снимает резервацию на путях, где до submit дело не дошло (квота, ошибка createJob). */
export function releaseUser(userId: string): void {
  reservations.delete(userId);
}

/**
 * Одна генерация — это Chromium и несколько минут работы, поэтому одновременных
 * не больше MAX_CONCURRENT на весь сервер. Сверх лимита задание ждёт в FIFO-очереди.
 */
export function submit(jobId: string, userId: string, start: () => void): 'running' | 'queued' {
  // Резервация превращается в настоящую запись реестра: дальше пользователя
  // держит само задание — в running или в очереди.
  reservations.delete(userId);
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
  reservations.clear();
  listener = null;
}
