import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET as health } from '@/app/api/health/route';
import { middleware } from '@/middleware';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { __setJobStoreForTests } from '@/lib/jobs/current';
import type { JobStore } from '@/lib/jobs/store';

let store: JobStore;

beforeEach(() => {
  delete process.env.DATABASE_URL;
  store = createMemoryJobStore();
  __setJobStoreForTests(store);
});

const queue = () => store.create({
  ownerId: crypto.randomUUID(), kind: 'generate', priority: 0,
  request: { prompt: 'p', mode: 'fast', hasImage: false },
});

describe('GET /api/health', () => {
  it('пустая очередь без воркеров — 200', async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      db: 'ok', queued: 0, oldestQueuedSec: null, running: 0, workersAlive: 0, lastWorkerSeenSec: null,
    });
  });

  it('очередь стоит, воркеров нет — 503', async () => {
    await queue();
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ db: 'ok', queued: 1, workersAlive: 0 });
  });

  it('живой воркер — 200', async () => {
    await queue();
    await store.heartbeat('w1', 'host', 0, []);
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ queued: 1, workersAlive: 1 });
  });

  it('база недоступна — 503 без подробностей', async () => {
    __setJobStoreForTests({
      ...store,
      stats: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5435'); },
    });
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ db: 'error' });
  });

  it('открыта без входа', () => {
    const res = middleware(new NextRequest('http://t/api/health'));
    expect(res.status).not.toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });
});
