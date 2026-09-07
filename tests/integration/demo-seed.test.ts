import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as register } from '@/app/api/auth/register/route';
import { GET as listSims } from '@/app/api/simulations/route';
import { listBundledDemos, ensureDemosForUser } from '@/lib/demos';
import { deleteSimulation } from '@/lib/storage';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA = 'demo_seed_test';
const pool = testDb(SCHEMA);

// Артефакты пишутся на диск — уводим их во временный каталог, чтобы тест
// не трогал рабочую библиотеку разработчика.
let dataDir: string;

function get(cookie?: string): Request {
  return new Request('http://t', { headers: cookie ? { cookie } : {} });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}
async function signUp(email: string): Promise<{ cookie: string; id: string }> {
  const res = await register(new Request('http://t', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'пароль123' }),
  }));
  const body = await res.json();
  return { cookie: cookieOf(res), id: body.user.id };
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tesseract-demo-seed-'));
  process.env.SHOWMEHOW_DATA_DIR = dataDir;
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('DELETE FROM sessions; DELETE FROM simulations; DELETE FROM users;');
});
afterAll(async () => {
  await pool?.end();
  await closeDb();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe.skipIf(!pool)('примеры раскладываются сами', () => {
  it('первый заход в библиотеку возвращает встроенные примеры без установки вручную', async () => {
    const { cookie } = await signUp('seed1@example.com');
    const sims = await (await listSims(get(cookie))).json();
    expect(sims).toHaveLength(listBundledDemos().length);
    expect(sims.length).toBeGreaterThan(0);
  });

  it('превью берётся из каталога демки, а не снимается заново', async () => {
    const { cookie } = await signUp('seed2@example.com');
    const sims = await (await listSims(get(cookie))).json();
    // Файл превью лежит рядом с артефактом каждой симуляции.
    for (const s of sims) {
      expect(fs.existsSync(path.join(dataDir, 'simulations', s.id, 'thumbnail.png'))).toBe(true);
    }
  });

  it('второй заход ничего не добавляет и не возвращает удалённое', async () => {
    const { cookie, id } = await signUp('seed3@example.com');
    const first = await (await listSims(get(cookie))).json();
    await deleteSimulation(id, first[0].id);

    const second = await (await listSims(get(cookie))).json();
    expect(second).toHaveLength(first.length - 1);
  });

  it('повторный вызов установки возвращает false, не трогая библиотеку', async () => {
    const { cookie, id } = await signUp('seed4@example.com');
    await listSims(get(cookie));
    expect(await ensureDemosForUser(id)).toBe(false);
  });

  it('у каждого пользователя своя копия примеров', async () => {
    const a = await signUp('seed5a@example.com');
    const b = await signUp('seed5b@example.com');
    const simsA = await (await listSims(get(a.cookie))).json();
    const simsB = await (await listSims(get(b.cookie))).json();
    expect(simsA).toHaveLength(simsB.length);
    // Идентификаторы разные: это копии, а не общая библиотека.
    expect(simsA.map((s: { id: string }) => s.id).sort())
      .not.toEqual(simsB.map((s: { id: string }) => s.id).sort());
  });
});
