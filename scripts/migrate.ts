import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { db, closeDb } from '../src/lib/db/client';

function migrationsDir(): string {
  return path.join(process.cwd(), 'migrations');
}

/**
 * Применяет непринятые миграции по возрастанию имени, каждую в своей транзакции.
 * Идемпотентен: уже применённые имена лежат в schema_migrations и пропускаются.
 */
export async function applyMigrations(pool: Pool): Promise<string[]> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  const files = fs.readdirSync(migrationsDir()).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir(), file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`миграция ${file} не применилась: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

async function main(): Promise<void> {
  const applied = await applyMigrations(db());
  console.log(applied.length ? `Применено: ${applied.join(', ')}` : 'Новых миграций нет');
}

// Запуск как скрипт: `npm run migrate`. При импорте из тестов main не вызывается.
if (process.argv[1]?.endsWith('migrate.ts')) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());
}
