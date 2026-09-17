import { RECONNECT_COMMENT } from './sse';

/**
 * Реестр открытых потоков заданий на весь процесс. В продакшне `next start` по SIGTERM
 * ждёт, пока закроются все соединения, а поток мастерской живёт, пока идёт задание:
 * без реестра рестарт веба висел бы до SIGKILL. Хранится в globalThis, потому что у роута
 * и у instrumentation разные экземпляры модулей.
 */
interface Registry {
  streams: Set<() => void>;
  draining: boolean;
  sigtermHandler: boolean;
}

const KEY = Symbol.for('tesseract.openStreams');

/** Сколько живёт один поток; потом он закрывается с `: reconnect`, и клиент подключается заново. */
export const STREAM_MAX_MS = 5 * 60_000;

/** SSE-кадр плановой остановки: клиент переподключается сразу, не расходуя попытки. */
export const RECONNECT_FRAME = `${RECONNECT_COMMENT}\n\n`;

function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[KEY] ??= { streams: new Set(), draining: false, sigtermHandler: false });
}

/**
 * Регистрирует функцию закрытия потока. Возвращает функцию снятия с учёта или null,
 * если процесс уже останавливается — тогда поток надо закрыть сразу.
 */
export function registerStream(close: () => void): (() => void) | null {
  const r = registry();
  if (r.draining) return null;
  r.streams.add(close);
  return () => { r.streams.delete(close); };
}

export function openStreamCount(): number {
  return registry().streams.size;
}

/** Закрывает все открытые потоки и больше не принимает новые. Возвращает, сколько закрыто. */
export function closeAllStreams(): number {
  const r = registry();
  r.draining = true;
  const all = [...r.streams];
  r.streams.clear();
  for (const close of all) {
    try {
      close();
    } catch (e) {
      console.error('Не удалось закрыть поток задания:', e);
    }
  }
  return all.length;
}

/**
 * Ставит обработчик SIGTERM: он закрывает потоки, а остановку сервера продолжает
 * собственный обработчик Next — ему остаётся дождаться уже закрытых соединений.
 * Процесс этот обработчик не завершает: при NEXT_MANUAL_SIG_HANDLE выходить пришлось бы
 * самим.
 */
export function closeStreamsOnSigterm(proc: Pick<NodeJS.Process, 'once'> = process): void {
  const r = registry();
  if (r.sigtermHandler) return;
  r.sigtermHandler = true;
  proc.once('SIGTERM', () => {
    const n = closeAllStreams();
    if (n > 0) console.log(`Получен SIGTERM: закрыто потоков заданий: ${n}.`);
  });
}

/** Для тестов: чистый реестр. */
export function __resetOpenStreamsForTests(): void {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  delete g[KEY];
}
