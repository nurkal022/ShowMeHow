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
    expect(first).toEqual(expect.arrayContaining(['001_init.sql', '005_job_queue.sql']));
    const tables = await p.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'migrate_test'");
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(
      ['users', 'sessions', 'simulations', 'jobs', 'job_events', 'workers', 'login_attempts']));
    const second = await applyMigrations(p);
    expect(second).toEqual([]);
  });

  // Прежний код держал задания в памяти процесса: после перехода продолжить их некому,
  // а два «активных» задания одного человека не дали бы создать уникальный индекс.
  it('005 закрывает задания, оставшиеся активными от прежнего кода', async () => {
    const p = pool!;
    await resetSchema(p, SCHEMA);
    const upTo4 = await applyMigrations(p, { until: '004_organizations.sql' });
    expect(upTo4).not.toContain('005_job_queue.sql');
    const userId = '11111111-1111-1111-1111-111111111111';
    await p.query(
      "INSERT INTO users (id, email, password_hash, role) VALUES ($1, 'old@example.com', 'x', 'user')",
      [userId]);
    for (const status of ['running', 'queued', 'done']) {
      await p.query(
        "INSERT INTO jobs (id, owner_id, status, request) VALUES (gen_random_uuid(), $1, $2, '{}'::jsonb)",
        [userId, status]);
    }
    expect(await applyMigrations(p, { until: '005_job_queue.sql' })).toEqual(['005_job_queue.sql']);
    const { rows } = await p.query<{ status: string; error: string | null; kind: string }>(
      'SELECT status, error, kind FROM jobs ORDER BY status');
    expect(rows).toEqual([
      { status: 'done', error: null, kind: 'generate' },
      { status: 'error', error: 'Сервер был перезапущен', kind: 'generate' },
      { status: 'error', error: 'Сервер был перезапущен', kind: 'generate' },
    ]);
  });
});
