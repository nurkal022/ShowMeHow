import { Pool } from 'pg';

let pool: Pool | null = null;

/** Задан ли адрес базы. В тестах без базы драйвер метаданных подменяется на in-memory. */
export function hasDb(): boolean {
  return !!process.env.DATABASE_URL;
}

export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL не задан: база данных недоступна');
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  const p = pool;
  pool = null;
  await p?.end();
}
