import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyMigrations } from '../../scripts/migrate';
import { testDb, resetSchema } from '../db';

const SCHEMA = 'migrate_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
});

afterAll(async () => { await pool?.end(); });

// Без базы набор пропускается целиком: `npm test` обязан быть зелёным на голой машине.
describe.skipIf(!pool)('миграции', () => {
  it('создают схему и применяются повторно вхолостую', async () => {
    const p = pool!;
    const first = await applyMigrations(p);
    expect(first).toContain('001_init.sql');
    const tables = await p.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'migrate_test'");
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(['users', 'sessions', 'simulations', 'jobs']));
    const second = await applyMigrations(p);
    expect(second).toEqual([]);
  });
});
