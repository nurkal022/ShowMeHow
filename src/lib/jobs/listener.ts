import { Client } from 'pg';

/** То немногое от pg.Client, что нужно слушателю; в тестах подменяется. */
export interface ListenClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  on(event: string, cb: (arg?: unknown) => void): unknown;
  end(): Promise<void>;
}

export interface Listener {
  onJob(jobId: string, cb: () => void): () => void;
  onQueue(cb: () => void): () => void;
  close(): Promise<void>;
}

const DEFAULT_RETRY_MS = [1000, 2000, 5000, 10000, 30000];

function safeCall(cb: () => void): void {
  try {
    cb();
  } catch (e) {
    console.error('Подписчик уведомлений заданий упал:', e);
  }
}

/**
 * Одно выделенное соединение LISTEN на процесс. Карта подписчиков — кэш соединения,
 * а не источник правды: подписчик по сигналу дочитывает журнал из базы по seq.
 * После любого (пере)подключения будим всех — за время обрыва уведомления терялись.
 */
export function createListener(factory: () => ListenClient, opts: { retryMs?: number[] } = {}): Listener {
  const delays = opts.retryMs ?? DEFAULT_RETRY_MS;
  const jobSubs = new Map<string, Set<() => void>>();
  const queueSubs = new Set<() => void>();
  let client: ListenClient | null = null;
  let connecting = false;
  let failures = 0;
  let closed = false;
  let timer: NodeJS.Timeout | null = null;

  function wakeAll(): void {
    for (const set of jobSubs.values()) for (const cb of set) safeCall(cb);
    for (const cb of queueSubs) safeCall(cb);
  }

  function schedule(): void {
    if (closed || timer) return;
    const delay = delays[Math.min(failures, delays.length - 1)];
    failures++;
    timer = setTimeout(() => {
      timer = null;
      ensure();
    }, delay);
    // Переподключение само по себе не должно держать процесс живым.
    timer.unref?.();
  }

  function ensure(): void {
    if (closed || client || connecting) return;
    connecting = true;
    const c = factory();
    let dropped = false;
    const drop = (err?: unknown) => {
      if (dropped) return;
      dropped = true;
      if (err) console.error('Соединение LISTEN потеряно:', err);
      if (client === c) client = null;
      c.end().catch(() => {});
      schedule();
    };
    c.on('error', drop);
    c.on('end', () => drop());
    c.on('notification', (arg) => {
      const msg = arg as { channel?: string; payload?: string };
      if (msg.channel === 'job_queue') {
        for (const cb of queueSubs) safeCall(cb);
      } else if (msg.channel === 'job_events' && msg.payload) {
        for (const cb of jobSubs.get(msg.payload) ?? []) safeCall(cb);
      }
    });
    (async () => {
      try {
        await c.connect();
        await c.query('LISTEN job_events');
        await c.query('LISTEN job_queue');
        connecting = false;
        if (dropped || closed) {
          if (closed) await c.end().catch(() => {});
          return;
        }
        client = c;
        failures = 0;
        wakeAll();
      } catch (e) {
        connecting = false;
        drop(e);
      }
    })();
  }

  return {
    onJob(jobId, cb) {
      let set = jobSubs.get(jobId);
      if (!set) {
        set = new Set();
        jobSubs.set(jobId, set);
      }
      set.add(cb);
      ensure();
      return () => {
        set!.delete(cb);
        if (set!.size === 0) jobSubs.delete(jobId);
      };
    },
    onQueue(cb) {
      queueSubs.add(cb);
      ensure();
      return () => { queueSubs.delete(cb); };
    },
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const c = client;
      client = null;
      await c?.end().catch(() => {});
    },
  };
}

let shared: Listener | null = null;

function sharedListener(): Listener {
  // pg.Client перегружает on() по именам событий; слушателю хватает общего вида.
  shared ??= createListener(
    () => new Client({ connectionString: process.env.DATABASE_URL }) as unknown as ListenClient);
  return shared;
}

export function listenJobEvents(jobId: string, cb: () => void): () => void {
  return sharedListener().onJob(jobId, cb);
}

export function listenQueue(cb: () => void): () => void {
  return sharedListener().onQueue(cb);
}

export async function closeListener(): Promise<void> {
  const l = shared;
  shared = null;
  await l?.close();
}
