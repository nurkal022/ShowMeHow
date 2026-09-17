import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { POST as postGenerate } from '@/app/api/generate/route';
import { GET as getJobRoute } from '@/app/api/jobs/[id]/route';
import { POST as postCancel } from '@/app/api/jobs/[id]/cancel/route';
import { GET as getStream } from '@/app/api/jobs/[id]/stream/route';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { __setJobStoreForTests } from '@/lib/jobs/current';
import type { JobStore, NewJob } from '@/lib/jobs/store';
import { HIGH_PRIORITY } from '@/lib/jobs/policy';
import { GENERATION_BUSY_MESSAGE, EMPTY_PROMPT_MESSAGE } from '@/lib/jobs/messages';
import { saveSettings, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { DEFAULT_ORG_SETTINGS } from '@/lib/org/settings';
import type { Membership } from '@/lib/org/types';
import type { AuthUser } from '@/lib/auth/users';
import type { PipelineEvent } from '@/lib/types';

function user(id: string, email: string): AuthUser {
  return { id, email, login: null, displayName: null, role: 'user', mustChangePassword: false };
}
const TEST_USER = user('11111111-1111-1111-1111-111111111111', 'a@t');
const OTHER_USER = user('22222222-2222-2222-2222-222222222222', 'b@t');

// Роуты вызываются напрямую, без базы и cookie: пользователя и членства выставляет тест.
const session = vi.hoisted(() => ({ current: null as AuthUser | null, memberships: [] as unknown[] }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => session.current,
  currentUserFromCookies: async () => session.current,
}));
vi.mock('@/lib/quota', async (orig) => ({
  ...(await orig<typeof import('@/lib/quota')>()),
  quotaStatus: async () => ({ limit: 10, used: 0, remaining: 10 }),
}));
vi.mock('@/lib/org/access', async (orig) => ({
  ...(await orig<typeof import('@/lib/org/access')>()),
  listMemberships: async () => session.memberships,
}));

const REQUEST = { prompt: 'маятник', mode: 'standard' as const, hasImage: false };
let store: JobStore;

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const newJob = (ownerId = TEST_USER.id): NewJob =>
  ({ ownerId, kind: 'generate', priority: 0, request: REQUEST });

function generateRequest(body: object = { prompt: 'маятник' }): Request {
  return new Request('http://t/api/generate', { method: 'POST', body: JSON.stringify(body) });
}

function withProvider<T>(fn: () => Promise<T>): Promise<T> {
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
  return fn().finally(() => {
    delete process.env.SHOWMEHOW_API_KEY;
    delete process.env.SHOWMEHOW_MODEL;
  });
}

/** Читатель SSE: пропускает комментарии `: ping`, отдаёт события по одному. */
function sse(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const queue: PipelineEvent[] = [];
  let buf = '';
  let ended = false;
  function drain() {
    let idx = buf.indexOf('\n\n');
    while (idx !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (frame.startsWith('data: ')) queue.push(JSON.parse(frame.slice(6)));
      idx = buf.indexOf('\n\n');
    }
  }
  async function next(): Promise<PipelineEvent | null> {
    while (queue.length === 0 && !ended) {
      const { value, done } = await reader.read();
      if (done) ended = true;
      else { buf += decoder.decode(value, { stream: true }); drain(); }
    }
    return queue.shift() ?? null;
  }
  async function rest(): Promise<PipelineEvent[]> {
    const out: PipelineEvent[] = [];
    for (let e = await next(); e; e = await next()) out.push(e);
    return out;
  }
  return { next, rest, cancel: () => reader.cancel() };
}

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-jobs-api-'));
  delete process.env.DATABASE_URL;
  session.current = TEST_USER;
  session.memberships = [];
  store = createMemoryJobStore();
  __setJobStoreForTests(store);
});

describe('POST /api/generate', () => {
  it('без провайдера отвечает 400 и задания не создаёт', async () => {
    saveSettings({ activeProviderId: null, providers: [], qualityMode: 'standard' });
    const res = await postGenerate(generateRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(NO_PROVIDER_MESSAGE);
    expect((await store.stats()).queued).toBe(0);
  });

  it('пустой запрос — 400', async () => {
    await withProvider(async () => {
      const res = await postGenerate(generateRequest({ prompt: '   ' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(EMPTY_PROMPT_MESSAGE);
    });
  });

  it('без сессии отвечает 401', async () => {
    session.current = null;
    expect((await postGenerate(generateRequest())).status).toBe(401);
  });

  it('ставит задание в очередь с картинкой и обычным приоритетом', async () => {
    await withProvider(async () => {
      const res = await postGenerate(generateRequest(
        { prompt: 'маятник', mode: 'fast', imageDataUrl: 'data:image/png;base64,AA' }));
      expect(res.status).toBe(200);
      const { jobId } = await res.json();
      expect(await store.get(jobId)).toMatchObject({
        ownerId: TEST_USER.id, kind: 'generate', status: 'queued', priority: 0,
        request: { prompt: 'маятник', mode: 'fast', hasImage: true },
      });
      expect((await store.claim('w1'))?.imageDataUrl).toBe('data:image/png;base64,AA');
    });
  });

  it('учитель получает высокий приоритет', async () => {
    const teacher: Membership = {
      orgId: 'o1', orgSlug: 'sch12', orgName: 'Школа №12', orgKind: 'school', role: 'teacher',
      settings: { ...DEFAULT_ORG_SETTINGS },
    };
    session.memberships = [teacher];
    await withProvider(async () => {
      const { jobId } = await (await postGenerate(generateRequest())).json();
      expect((await store.get(jobId))?.priority).toBe(HIGH_PRIORITY);
    });
  });

  it('вторая генерация того же человека — 409, в том числе параллельная', async () => {
    await withProvider(async () => {
      expect((await postGenerate(generateRequest())).status).toBe(200);
      const second = await postGenerate(generateRequest());
      expect(second.status).toBe(409);
      expect((await second.json()).error).toBe(GENERATION_BUSY_MESSAGE);

      __setJobStoreForTests(createMemoryJobStore());
      const [a, b] = await Promise.all([postGenerate(generateRequest()), postGenerate(generateRequest())]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });
  });
});

describe('GET /api/jobs/[id]', () => {
  it('неизвестное задание — 404', async () => {
    expect((await getJobRoute(new Request('http://t'), params('nope'))).status).toBe(404);
    expect((await getJobRoute(new Request('http://t'), params(crypto.randomUUID()))).status).toBe(404);
  });

  it('отдаёт задание без владельца, аренды и журнала', async () => {
    const job = await store.create(newJob());
    const res = await getJobRoute(new Request('http://t'), params(job.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: job.id, kind: 'generate', status: 'queued', createdAt: job.createdAt, request: REQUEST,
    });
  });

  it('готовое задание несёт id симуляции', async () => {
    const job = await store.create(newJob());
    await store.claim('w1');
    const simId = crypto.randomUUID();
    await store.finish(job.id, 'w1', { status: 'done', simulationId: simId });
    const body = await (await getJobRoute(new Request('http://t'), params(job.id))).json();
    expect(body).toMatchObject({ status: 'done', simulationId: simId });
  });
});

describe('POST /api/jobs/[id]/cancel', () => {
  const cancel = (id: string) => postCancel(new Request('http://t', { method: 'POST' }), params(id));

  it('неизвестное задание — 404', async () => {
    expect((await cancel('nope')).status).toBe(404);
  });

  it('ожидающее отменяется сразу, повтор безвреден', async () => {
    const job = await store.create(newJob());
    expect(await (await cancel(job.id)).json()).toEqual({ ok: true });
    expect(await (await cancel(job.id)).json()).toEqual({ ok: true });
    expect((await store.get(job.id))?.status).toBe('cancelled');
    expect(await store.events(job.id, 0)).toEqual([{ seq: 1, event: { type: 'cancelled' } }]);
  });

  it('идущее получает флаг отмены, статус меняет воркер', async () => {
    const job = await store.create(newJob());
    await store.claim('w1');
    expect((await cancel(job.id)).status).toBe(200);
    expect(await store.get(job.id)).toMatchObject({ status: 'running', cancelRequested: true });
    expect((await store.heartbeat('w1', 'h', 1, [job.id])).cancelRequested).toEqual([job.id]);
  });
});

// Регрессия: по угаданному id посторонний читал чужой промпт, весь журнал пайплайна
// и мог отменить чужую генерацию — все три роута заданий обязаны проверять владельца.
describe('изоляция владельцев в роутах заданий', () => {
  it('без сессии — 401, чужое задание — 404', async () => {
    const job = await store.create(newJob());
    const post = () => new Request('http://t', { method: 'POST' });

    session.current = null;
    expect((await getJobRoute(new Request('http://t'), params(job.id))).status).toBe(401);
    expect((await getStream(new Request('http://t'), params(job.id))).status).toBe(401);
    expect((await postCancel(post(), params(job.id))).status).toBe(401);

    session.current = OTHER_USER;
    expect((await getJobRoute(new Request('http://t'), params(job.id))).status).toBe(404);
    expect((await getStream(new Request('http://t'), params(job.id))).status).toBe(404);
    expect((await postCancel(post(), params(job.id))).status).toBe(404);
    expect((await store.get(job.id))?.status).toBe('queued');
  });
});

describe('GET /api/jobs/[id]/stream', () => {
  it('неизвестное задание — 404', async () => {
    expect((await getStream(new Request('http://t'), params('nope'))).status).toBe(404);
  });

  it('реплей, живые события без дублей и закрытие на терминальном', async () => {
    const job = await store.create(newJob());
    await store.claim('w1');
    await store.appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 }, 'w1');
    await store.appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'end', at: 2 }, 'w1');

    const res = await getStream(new Request('http://t'), params(job.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const s = sse(res);
    expect(await s.next()).toEqual({ type: 'stage', stage: 'planning', status: 'start', at: 1 });
    expect(await s.next()).toEqual({ type: 'stage', stage: 'planning', status: 'end', at: 2 });

    await store.appendEvent(job.id, { type: 'warning', message: 'осторожно' }, 'w1');
    expect(await s.next()).toEqual({ type: 'warning', message: 'осторожно' });

    await store.finish(job.id, 'w1', { status: 'done', simulationId: 'sim-1' });
    expect(await s.rest()).toEqual([{ type: 'done', simulationId: 'sim-1' }]);
  });

  it('завершённое задание: реплей и сразу закрытие', async () => {
    const job = await store.create(newJob());
    await store.cancelQueued(job.id);
    const s = sse(await getStream(new Request('http://t'), params(job.id)));
    expect(await s.rest()).toEqual([{ type: 'cancelled' }]);
  });

  it('пока задание в очереди, поток сообщает позицию и её изменения', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      await store.create(newJob(OTHER_USER.id));
      const mine = await store.create(newJob());
      const s = sse(await getStream(new Request('http://t'), params(mine.id)));
      expect(await s.next()).toEqual({ type: 'queued', position: 2 });
      await store.claim('w1');                 // первое задание ушло из очереди
      await vi.advanceTimersByTimeAsync(3000);
      expect(await s.next()).toEqual({ type: 'queued', position: 1 });
      await store.claim('w1');
      await store.appendEvent(mine.id, { type: 'stage', stage: 'planning', status: 'start', at: 5 }, 'w1');
      expect(await s.next()).toEqual({ type: 'stage', stage: 'planning', status: 'start', at: 5 });
      // Позиция в журнал не пишется.
      expect((await store.events(mine.id, 0)).map((e) => e.event.type)).toEqual(['stage']);
      await s.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});
