import { Client, Pool } from 'pg';
import { applyMigrations } from '../scripts/migrate';

/**
 * Готовит базу e2e до старта dev-сервера: создаёт её, если её ещё нет, и накатывает
 * миграции. Запускается командой webServer из playwright.config.ts, поэтому воркер
 * и роуты с первого запроса видят полную схему. Адрес берётся из DATABASE_URL,
 * который конфиг Playwright задаёт серверу явно.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан: e2e нужна база данных.');
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name) throw new Error(`В адресе базы e2e нет имени базы: ${url}`);

  // Создать базу можно только из другой базы того же сервера.
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`База e2e создана: ${name}`);
    }
  } finally {
    await client.end();
  }

  const pool = new Pool({ connectionString: url });
  try {
    const applied = await applyMigrations(pool);
    console.log(applied.length ? `Миграции e2e: ${applied.join(', ')}` : 'База e2e в актуальной схеме');
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
