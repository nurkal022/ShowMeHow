import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { POST as postRefine } from '@/app/api/simulations/[id]/refine/route';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { __setJobStoreForTests } from '@/lib/jobs/current';
import type { JobStore } from '@/lib/jobs/store';
import {
  REFINE_BUSY_MESSAGE, EMPTY_INSTRUCTION_MESSAGE, INVALID_REQUEST_MESSAGE,
} from '@/lib/jobs/messages';
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';
import { createSimulation } from '@/lib/storage';
import type { AuthUser } from '@/lib/auth/users';

const OWNER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111', email: 'a@t', login: null, displayName: null,
  role: 'user', mustChangePassword: false,
};
const STRANGER: AuthUser = { ...OWNER, id: '22222222-2222-2222-2222-222222222222', email: 'b@t' };

const session = vi.hoisted(() => ({ current: null as AuthUser | null }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => session.current,
}));
vi.mock('@/lib/org/access', async (orig) => ({
  ...(await orig<typeof import('@/lib/org/access')>()),
  listMemberships: async () => [],
}));

let store: JobStore;
let simId = '';

const refine = (id: string, body: object = { instruction: 'медленнее' }) =>
  postRefine(new Request('http://t', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) });

beforeEach(async () => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-refine-'));
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
  delete process.env.DATABASE_URL;
  __setRepoForTests(createMemoryRepo());
  store = createMemoryJobStore();
  __setJobStoreForTests(store);
  session.current = OWNER;
  simId = (await createSimulation(OWNER.id,
    { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>')).id;
});

describe('POST /api/simulations/[id]/refine', () => {
  it('ставит доработку в очередь и сразу отвечает id задания', async () => {
    const res = await refine(simId);
    expect(res.status).toBe(200);
    const { jobId } = await res.json();
    expect(await store.get(jobId)).toMatchObject({
      ownerId: OWNER.id, kind: 'refine', status: 'queued', targetSimulationId: simId,
      request: { instruction: 'медленнее' },
    });
  });

  it('вторая доработка — 409, а генерация рядом разрешена', async () => {
    expect((await refine(simId)).status).toBe(200);
    const again = await refine(simId);
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe(REFINE_BUSY_MESSAGE);
    await expect(store.create({
      ownerId: OWNER.id, kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: false },
    })).resolves.toMatchObject({ kind: 'generate' });
  });

  it('пустая инструкция — 400', async () => {
    const res = await refine(simId, { instruction: '  ' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(EMPTY_INSTRUCTION_MESSAGE);
  });

  it('нечитаемое тело — 400, а не 500', async () => {
    for (const raw of ['{не json', 'null', '"строка"']) {
      const res = await postRefine(new Request('http://t', { method: 'POST', body: raw }),
        { params: Promise.resolve({ id: simId }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(INVALID_REQUEST_MESSAGE);
    }
    expect((await store.stats()).queued).toBe(0);
  });

  it('чужая и несуществующая симуляция — 404, обход каталога — 400', async () => {
    session.current = STRANGER;
    expect((await refine(simId)).status).toBe(404);
    expect((await refine(crypto.randomUUID())).status).toBe(404);
    expect((await refine('..%2Fevil')).status).toBe(400);
    expect((await store.stats()).queued).toBe(0);
  });

  it('без сессии — 401', async () => {
    session.current = null;
    expect((await refine(simId)).status).toBe(401);
  });
});
