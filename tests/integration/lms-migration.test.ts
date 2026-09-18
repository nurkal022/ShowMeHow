import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';

const SCHEMA = 'lms_migration_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

async function count(table: string): Promise<number> {
  const { rows } = await pool!.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

describe.skipIf(!pool)('миграция 006', () => {
  const ownerId = crypto.randomUUID();

  it('накатывается поверх данных: прежние симуляции становятся личными', async () => {
    const p = pool!;
    await applyMigrations(p, { until: '005_job_queue.sql' });
    await p.query(
      "INSERT INTO users (id, email, password_hash, role) VALUES ($1, 'teacher@example.com', 'x', 'user')",
      [ownerId]);
    const simId = crypto.randomUUID();
    await p.query(
      `INSERT INTO simulations (id, owner_id, title, prompt, subject, created_at, updated_at)
       VALUES ($1, $2, 'Маятник', 'п', 'Физика', now(), now())`, [simId, ownerId]);

    expect(await applyMigrations(p)).toEqual(['006_lms.sql']);

    const { rows } = await p.query<{ visibility: string }>(
      'SELECT visibility FROM simulations WHERE id = $1', [simId]);
    expect(rows[0].visibility).toBe('private');
    await expect(p.query("UPDATE simulations SET visibility = 'public'")).rejects.toThrow(/check constraint/);
  });

  it('курс, темы, блоки и ответы связаны каскадом, ответ один на ученика и задание', async () => {
    const p = pool!;
    const orgId = crypto.randomUUID();
    await p.query("INSERT INTO organizations (id, slug, name, kind) VALUES ($1, 'sch12', 'Школа №12', 'school')",
      [orgId]);
    const studentId = crypto.randomUUID();
    await p.query("INSERT INTO users (id, login, password_hash, role) VALUES ($1, 'ivanov.i.sch12', 'x', 'user')",
      [studentId]);
    const courseId = crypto.randomUUID();
    await p.query('INSERT INTO courses (id, org_id, owner_id, title) VALUES ($1, $2, $3, $4)',
      [courseId, orgId, ownerId, 'Физика 7']);
    const course = await p.query<{ status: string; subject: string }>(
      'SELECT status, subject FROM courses WHERE id = $1', [courseId]);
    expect(course.rows[0]).toEqual({ status: 'draft', subject: '' });
    await expect(p.query("UPDATE courses SET status = 'hidden'")).rejects.toThrow(/check constraint/);

    const topicId = crypto.randomUUID();
    await p.query('INSERT INTO topics (id, course_id, position, title) VALUES ($1, $2, 1, $3)',
      [topicId, courseId, 'Маятник']);
    const blockId = crypto.randomUUID();
    await p.query(
      "INSERT INTO blocks (id, topic_id, position, kind, payload) VALUES ($1, $2, 1, 'assignment', '{}'::jsonb)",
      [blockId, topicId]);
    await expect(p.query(
      "INSERT INTO blocks (id, topic_id, position, kind, payload) VALUES ($1, $2, 2, 'video', '{}'::jsonb)",
      [crypto.randomUUID(), topicId])).rejects.toThrow(/check constraint/);
    const block = await p.query<{ revision: number }>('SELECT revision FROM blocks WHERE id = $1', [blockId]);
    expect(block.rows[0].revision).toBe(1);

    await p.query(
      `INSERT INTO submissions (id, block_id, student_id, block_revision, answer, status)
       VALUES ($1, $2, $3, 1, '{}'::jsonb, 'draft')`, [crypto.randomUUID(), blockId, studentId]);
    await expect(p.query(
      `INSERT INTO submissions (id, block_id, student_id, block_revision, answer, status)
       VALUES ($1, $2, $3, 1, '{}'::jsonb, 'draft')`, [crypto.randomUUID(), blockId, studentId]))
      .rejects.toThrow(/duplicate key/);
    await p.query('INSERT INTO topic_views (topic_id, user_id) VALUES ($1, $2)', [topicId, studentId]);

    await p.query('DELETE FROM courses WHERE id = $1', [courseId]);
    expect(await count('topics')).toBe(0);
    expect(await count('blocks')).toBe(0);
    expect(await count('submissions')).toBe(0);
    expect(await count('topic_views')).toBe(0);
  });

  it('открытый временный пароль уходит вместе с пользователем, журнал админки — нет', async () => {
    const p = pool!;
    const userId = crypto.randomUUID();
    await p.query("INSERT INTO users (id, login, password_hash, role) VALUES ($1, 'petrova.a.sch12', 'x', 'user')",
      [userId]);
    await p.query("INSERT INTO pending_credentials (user_id, password) VALUES ($1, 'лиса-дом-семь')", [userId]);
    await p.query("INSERT INTO admin_actions (actor_id, action, target) VALUES ($1, 'user.disable', 'x')", [userId]);
    await p.query('DELETE FROM users WHERE id = $1', [userId]);
    expect(await count('pending_credentials')).toBe(0);
    const { rows } = await p.query<{ actor_id: string | null; payload: unknown }>(
      'SELECT actor_id, payload FROM admin_actions');
    expect(rows).toEqual([{ actor_id: null, payload: {} }]);
  });
});
