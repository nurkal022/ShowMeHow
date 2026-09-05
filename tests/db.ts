import { Pool } from 'pg';

/**
 * Пул для теста в СВОЕЙ схеме Postgres. Файлы vitest исполняются в отдельных
 * процессах, поэтому каждый может выставить свой search_path и не мешать соседям:
 * общая схема public была бы гонкой (см. Ruling 5 в леджере).
 * Возвращает null, если SHOWMEHOW_TEST_DATABASE_URL не задан — тогда набор пропускается.
 */
export function testDb(schema: string): Pool | null {
  const base = process.env.SHOWMEHOW_TEST_DATABASE_URL;
  if (!base) return null;
  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}options=-c%20search_path%3D${schema}`;
  // Приложение читает адрес базы из DATABASE_URL — направляем его в ту же схему.
  process.env.DATABASE_URL = url;
  return new Pool({ connectionString: url });
}

/** Чистая схема под тест: вызывается в beforeAll до applyMigrations. */
export async function resetSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.query(`CREATE SCHEMA ${schema}`);
}
