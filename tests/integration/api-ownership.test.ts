import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createSimulation, saveThumbnail } from '@/lib/storage';
import { GET as getSim, DELETE as delSim } from '@/app/api/simulations/[id]/route';
import { GET as getExport } from '@/app/api/simulations/[id]/export/route';
import { GET as getHistory } from '@/app/api/simulations/[id]/history/route';
import { GET as getThumbnail } from '@/app/api/simulations/[id]/thumbnail/route';
import { GET as listSims } from '@/app/api/simulations/route';

const pool = testDb('ownership_test');

let simId = '';
let mine = '';
let theirs = '';

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, 'ownership_test');
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  await pool.query('DELETE FROM sessions; DELETE FROM simulations; DELETE FROM users;');
  const a = await createUser('owner@example.com', 'пароль123');
  const b = await createUser('stranger@example.com', 'пароль123');
  mine = `${SESSION_COOKIE}=${await createSession(a.id)}`;
  theirs = `${SESSION_COOKIE}=${await createSession(b.id)}`;
  // Набор про изоляцию владельцев, а не про первый вход: помечаем примеры
  // разложенными, иначе список каждого пользователя начинался бы с десяти демок
  // (их автозасев проверяется отдельно в demo-seed.test.ts).
  await pool.query('UPDATE users SET demos_seeded_at = now()');
  const meta = await createSimulation(
    a.id, { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>x</html>');
  simId = meta.id;
  // Без превью getThumbnail всегда даст 404 даже владельцу — проверка «владельцу 200»
  // была бы бессмысленной без реально сохранённой картинки.
  await saveThumbnail(a.id, meta.id, Buffer.from('png'));
});
afterAll(async () => { await pool?.end(); await closeDb(); });

function req(cookie?: string): Request {
  return new Request('http://t', { headers: cookie ? { cookie } : {} });
}

describe.skipIf(!pool)('изоляция владельцев', () => {
  it('чужая симуляция даёт 404, отсутствие сессии — 401', async () => {
    const params = () => Promise.resolve({ id: simId });
    for (const handler of [getSim, getExport, getHistory, getThumbnail]) {
      expect((await handler(req(mine), { params: params() })).status).toBe(200);
      expect((await handler(req(theirs), { params: params() })).status).toBe(404);
      expect((await handler(req(), { params: params() })).status).toBe(401);
    }
    expect((await delSim(req(theirs), { params: params() })).status).toBe(404);
    expect((await getSim(req(mine), { params: params() })).status).toBe(200);
  });

  it('список содержит только свои симуляции', async () => {
    expect(await (await listSims(req(mine))).json()).toHaveLength(1);
    expect(await (await listSims(req(theirs))).json()).toHaveLength(0);
  });
});
