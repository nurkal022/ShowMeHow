function intFromEnv(
  env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Переменная ${name}=${raw}: ожидается целое число от ${min} до ${max}.`);
  }
  return n;
}

/** Сколько генераций один воркер ведёт одновременно. Каждая — это Chromium. */
export function workerConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  return intFromEnv(env, 'WORKER_CONCURRENCY', 2, 1, 16);
}

/** Сколько воркер ждёт текущие задания после SIGTERM. systemd ждёт на минуту дольше. */
export function drainSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return intFromEnv(env, 'WORKER_DRAIN_SECONDS', 600, 0, 3600);
}

/**
 * Встроенный воркер нужен в `npm run dev`: там нет отдельной службы. В продакшне его
 * включают только явно, а во время `next build` не запускают никогда.
 */
export function embeddedWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  if (env.SHOWMEHOW_EMBEDDED_WORKER === '1') return true;
  if (env.SHOWMEHOW_EMBEDDED_WORKER === '0') return false;
  return env.NODE_ENV === 'development';
}
