import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { POST as login } from '@/app/api/auth/login/route';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'org_migration_test';
const pool = testDb(SCHEMA);

/** Накатывает только миграции до `last` включительно — так получается база прежней схемы. */
async function applyUpTo(last: string): Promise<void> {
  const p = pool!;
  await p.query(
    'CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(process.cwd(), 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && f <= last).sort();
  for (const f of files) {
    await p.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await p.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
  }
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('миграция 004 на базе прежней схемы', () => {
  it('накатывается поверх данных, и старый пользователь входит почтой', async () => {
    const p = pool!;
    await applyUpTo('003_demos_seeded.sql');
    const oldId = crypto.randomUUID();
    await p.query(
      "INSERT INTO users (id, email, password_hash, role) VALUES ($1, 'old@example.com', $2, 'user')",
      [oldId, hashPassword('пароль123')]);
    await p.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h1', $1, now() + interval '1 day')",
      [oldId]);

    expect(await applyMigrations(p, { until: '004_organizations.sql' })).toEqual(['004_organizations.sql']);

    const { rows } = await p.query<{ login: string | null; must_change_password: boolean; disabled_at: Date | null }>(
      'SELECT login, must_change_password, disabled_at FROM users WHERE id = $1', [oldId]);
    expect(rows[0]).toEqual({ login: null, must_change_password: false, disabled_at: null });
    const s = await p.query<{ sliding: boolean }>('SELECT sliding FROM sessions');
    expect(s.rows[0].sliding).toBe(true);

    __resetAttemptsForTests();
    const res = await login(new Request('http://t', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'old@example.com', password: 'пароль123' }),
    }));
    expect(res.status).toBe(200);
  });

  it('не пускает пользователя без почты и без логина и держит логин уникальным', async () => {
    const p = pool!;
    await expect(p.query(
      "INSERT INTO users (id, password_hash, role) VALUES ($1, 'x', 'user')", [crypto.randomUUID()]))
      .rejects.toThrow(/users_has_identifier/);
    await p.query("INSERT INTO users (id, login, password_hash, role) VALUES ($1, 'ivanov.i.sch12', 'x', 'user')",
      [crypto.randomUUID()]);
    await expect(p.query(
      "INSERT INTO users (id, login, password_hash, role) VALUES ($1, 'ivanov.i.sch12', 'x', 'user')",
      [crypto.randomUUID()])).rejects.toThrow(/duplicate key/);
  });

  it('роли и типы организаций ограничены схемой', async () => {
    const p = pool!;
    await expect(p.query(
      "INSERT INTO organizations (id, slug, name, kind) VALUES ($1, 'x1', 'X', 'kindergarten')",
      [crypto.randomUUID()])).rejects.toThrow(/check constraint/);
    const orgId = crypto.randomUUID();
    await p.query("INSERT INTO organizations (id, slug, name, kind) VALUES ($1, 'x2', 'X', 'school')", [orgId]);
    const u = await p.query<{ id: string }>("SELECT id FROM users WHERE email = 'old@example.com'");
    await expect(p.query(
      "INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'director')", [orgId, u.rows[0].id]))
      .rejects.toThrow(/check constraint/);
    const org = await p.query<{ settings: unknown }>('SELECT settings FROM organizations WHERE id = $1', [orgId]);
    expect(org.rows[0].settings).toEqual({});
  });
});
