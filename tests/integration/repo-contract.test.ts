import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyMigrations } from '../../scripts/migrate';
import { testDb, resetSchema } from '../db';
import { createMemoryRepo, type MetaRepo, type SimRecord } from '@/lib/db/repo';
import { createPgRepo } from '@/lib/db/repo-pg';

const SCHEMA = 'repo_test';
const pool = testDb(SCHEMA);
const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function rec(id: string, ownerId: string, over: Partial<SimRecord> = {}): SimRecord {
  const now = new Date().toISOString();
  return {
    id, ownerId, title: 'т', prompt: 'п', subject: 'Физика', tags: ['газ'],
    createdAt: now, updatedAt: now, ...over,
  };
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
  await pool.query(
    "INSERT INTO users (id, email, password_hash, role) VALUES ($1,'a@t','x','user'), ($2,'b@t','x','user')",
    [OWNER, OTHER]);
});
afterAll(async () => { await pool?.end(); });

const drivers: [string, () => MetaRepo][] = [['memory', createMemoryRepo]];
if (pool) drivers.push(['postgres', () => createPgRepo(pool)]);

describe.each(drivers)('MetaRepo (%s)', (_name, make) => {
  it('пишет, читает и отдаёт только записи владельца', async () => {
    const repo = make();
    const a = '33333333-3333-3333-3333-333333333333';
    const b = '44444444-4444-4444-4444-444444444444';
    await repo.insert(rec(a, OWNER));
    await repo.insert(rec(b, OTHER));
    expect((await repo.get(a))?.ownerId).toBe(OWNER);
    expect(await repo.get('55555555-5555-5555-5555-555555555555')).toBeNull();
    const mine = await repo.listByOwner(OWNER);
    expect(mine.map((m) => m.id)).toEqual([a]);
  });

  it('touch двигает updatedAt, remove убирает запись', async () => {
    const repo = make();
    const id = '66666666-6666-6666-6666-666666666666';
    await repo.insert(rec(id, OWNER, { updatedAt: '2020-01-01T00:00:00.000Z' }));
    await repo.touch(id, '2026-01-01T00:00:00.000Z');
    expect((await repo.get(id))?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    await repo.remove(id);
    expect(await repo.get(id)).toBeNull();
  });

  it('hasDemo различает владельцев', async () => {
    const repo = make();
    await repo.insert(rec('77777777-7777-7777-7777-777777777777', OWNER, { demo: 'pendulum' }));
    expect(await repo.hasDemo(OWNER, 'pendulum')).toBe(true);
    expect(await repo.hasDemo(OTHER, 'pendulum')).toBe(false);
  });

  it('listByOwner отдаёт свежие первыми', async () => {
    const repo = make();
    await repo.insert(rec('88888888-8888-8888-8888-888888888888', OWNER, { updatedAt: '2021-01-01T00:00:00.000Z' }));
    await repo.insert(rec('99999999-9999-9999-9999-999999999999', OWNER, { updatedAt: '2026-06-01T00:00:00.000Z' }));
    const ids = (await repo.listByOwner(OWNER)).map((m) => m.id);
    expect(ids.indexOf('99999999-9999-9999-9999-999999999999'))
      .toBeLessThan(ids.indexOf('88888888-8888-8888-8888-888888888888'));
  });

  it('insert отклоняет повторный id', async () => {
    const repo = make();
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await repo.insert(rec(id, OWNER));
    await expect(repo.insert(rec(id, OWNER))).rejects.toThrow();
  });

  it('listByOwner отдаёт независимую копию: мутация снаружи не портит хранилище', async () => {
    const repo = make();
    const id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await repo.insert(rec(id, OWNER, { tags: ['исходный'] }));
    const before = await repo.listByOwner(OWNER);
    const item = before.find((m) => m.id === id);
    item?.tags.push('чужой');
    const after = await repo.listByOwner(OWNER);
    expect(after.find((m) => m.id === id)?.tags).toEqual(['исходный']);
  });
});
