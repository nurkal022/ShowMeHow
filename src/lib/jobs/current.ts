import { db, hasDb } from '../db/client';
import { createMemoryJobStore } from './store-memory';
import { createPgJobStore } from './store-pg';
import type { Job, JobStore } from './store';

// Драйвер в памяти живёт на globalThis: в next dev роуты и встроенный воркер
// получают разные экземпляры модулей, а очередь у процесса должна быть одна.
const MEMORY_KEY = Symbol.for('tesseract.memoryJobStore');

let override: JobStore | null = null;
let pgStore: JobStore | null = null;

/** Подмена драйвера в тестах; null возвращает автоматический выбор. */
export function __setJobStoreForTests(store: JobStore | null): void {
  override = store;
  pgStore = null;
}

/**
 * Как getRepo(): Postgres при заданном DATABASE_URL, память без него. В продакшне
 * работа без базы — ошибка конфигурации: очередь в памяти не видит воркер-службу.
 */
export function getJobStore(): JobStore {
  if (override) return override;
  if (hasDb()) {
    pgStore ??= createPgStore();
    return pgStore;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL не задан: в продакшне очередь заданий без базы данных запрещена');
  }
  const g = globalThis as unknown as Record<symbol, JobStore | undefined>;
  g[MEMORY_KEY] ??= createMemoryJobStore();
  return g[MEMORY_KEY]!;
}

/** Чужое задание неотличимо от несуществующего: и то и другое — null. */
export async function getOwnedJob(ownerId: string, id: string): Promise<Job | null> {
  const job = await getJobStore().get(id);
  return job && job.ownerId === ownerId ? job : null;
}

function createPgStore(): JobStore {
  return createPgJobStore(db());
}
