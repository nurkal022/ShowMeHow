import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST as postGenerate } from '@/app/api/generate/route';
import { GET as getJobRoute } from '@/app/api/jobs/[id]/route';
import { POST as postCancel } from '@/app/api/jobs/[id]/cancel/route';
import { GET as getStream } from '@/app/api/jobs/[id]/stream/route';
import { createJob, appendEvent, setStatus, __clearForTests } from '@/lib/jobs';
import { submit, __resetLimitsForTests } from '@/lib/limits';
import { saveSettings, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import type { JobRequest } from '@/lib/jobs';
import type { AuthUser } from '@/lib/auth/users';
import type { PipelineEvent } from '@/lib/types';

// В этих тестах роуты вызываются напрямую, без базы и cookie — резолвер сессии
// подменяется пользователем, которого тест выставляет через session.current.
const TEST_USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111', email: 'a@t', role: 'user',
};
const OTHER_USER: AuthUser = {
  id: '22222222-2222-2222-2222-222222222222', email: 'b@t', role: 'user',
};
const session = vi.hoisted(() => ({ current: null as AuthUser | null }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => session.current,
  currentUserFromCookies: async () => session.current,
}));

// Роут /api/generate зовёт базу за квотой и поднимает настоящий Chromium — в юнит-тесте
// подменяются оба: квота всегда свободна, пайплайн повисает и не завершает задание.
vi.mock('@/lib/quota', async (orig) => ({
  ...(await orig<typeof import('@/lib/quota')>()),
  quotaStatus: async () => ({ limit: 10, used: 0, remaining: 10 }),
}));
vi.mock('@/lib/pipeline/run', async (orig) => ({
  ...(await orig<typeof import('@/lib/pipeline/run')>()),
  makeCtx: () => ({}),
  runPipeline: () => new Promise<void>(() => {}),
}));

const REQUEST: JobRequest = { prompt: 'маятник', mode: 'standard', hasImage: false };

function generateRequest(): Request {
  return new Request('http://t/api/generate', {
    method: 'POST', body: JSON.stringify({ prompt: 'маятник' }),
  });
}

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-jobs-api-'));
  // Персистентность заданий отключена отсутствием DATABASE_URL: хранилище работает в памяти.
  delete process.env.DATABASE_URL;
  session.current = TEST_USER;
  __clearForTests();
  __resetLimitsForTests();
});

describe('POST /api/generate', () => {
  it('returns 400 and creates no job when no provider is configured', async () => {
    saveSettings({ activeProviderId: null, providers: [], qualityMode: 'standard' });
    const req = new Request('http://t/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'маятник' }),
    });
    const res = await postGenerate(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(NO_PROVIDER_MESSAGE);
  });

  // Регрессия: между hasActive и submit стояли два await (квота и INSERT задания),
  // поэтому два одновременных POST одного пользователя проходили проверку оба.
  it('вторая генерация того же пользователя отбивается 409, в том числе параллельная', async () => {
    process.env.SHOWMEHOW_API_KEY = 'test-key';
    process.env.SHOWMEHOW_MODEL = 'test-model';
    try {
      const first = await postGenerate(generateRequest());
      expect(first.status).toBe(200);
      const second = await postGenerate(generateRequest());
      expect(second.status).toBe(409);
      expect((await second.json()).error)
        .toBe('У вас уже идёт генерация. Дождитесь её окончания или отмените.');

      __clearForTests();
      __resetLimitsForTests();
      // Два запроса без единого await между ними: слот должен достаться одному.
      const [a, b] = await Promise.all([postGenerate(generateRequest()),
        postGenerate(generateRequest())]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    } finally {
      delete process.env.SHOWMEHOW_API_KEY;
      delete process.env.SHOWMEHOW_MODEL;
    }
  });

  it('без сессии отвечает 401', async () => {
    session.current = null;
    const res = await postGenerate(new Request('http://t/api/generate', {
      method: 'POST', body: JSON.stringify({ prompt: 'маятник' }),
    }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/jobs/[id]/cancel', () => {
  it('returns 404 for an unknown job', async () => {
    const res = await postCancel(new Request('http://t', { method: 'POST' }),
      { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('returns {ok:true} for a known job and is idempotent', async () => {
    const job = await createJob(TEST_USER.id, REQUEST);
    const params = Promise.resolve({ id: job.id });
    const res1 = await postCancel(new Request('http://t', { method: 'POST' }), { params });
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ ok: true });
    const res2 = await postCancel(new Request('http://t', { method: 'POST' }), { params });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ ok: true });
  });
});

describe('GET /api/jobs/[id]', () => {
  it('returns 404 for an unknown job', async () => {
    const res = await getJobRoute(new Request('http://t'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('returns the job without an events array', async () => {
    const job = await createJob(TEST_USER.id, REQUEST);
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });
    const res = await getJobRoute(new Request('http://t'), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: job.id, status: 'queued', createdAt: job.createdAt, request: REQUEST,
    });
    expect(body.events).toBeUndefined();
    // Владелец наружу не отдаётся — клиенту он не нужен.
    expect(body.ownerId).toBeUndefined();
  });
});

// Регрессия: по угаданному id посторонний читал чужой промпт, весь журнал пайплайна
// и мог отменить чужую генерацию — все три роута заданий обязаны проверять владельца.
describe('изоляция владельцев в роутах заданий', () => {
  it('без сессии — 401, чужое задание — 404', async () => {
    const job = await createJob(TEST_USER.id, REQUEST);
    const params = () => Promise.resolve({ id: job.id });

    session.current = null;
    expect((await getJobRoute(new Request('http://t'), { params: params() })).status).toBe(401);
    expect((await getStream(new Request('http://t'), { params: params() })).status).toBe(401);
    expect((await postCancel(new Request('http://t', { method: 'POST' }),
      { params: params() })).status).toBe(401);

    session.current = OTHER_USER;
    expect((await getJobRoute(new Request('http://t'), { params: params() })).status).toBe(404);
    expect((await getStream(new Request('http://t'), { params: params() })).status).toBe(404);
    expect((await postCancel(new Request('http://t', { method: 'POST' }),
      { params: params() })).status).toBe(404);

    session.current = TEST_USER;
    expect((await getJobRoute(new Request('http://t'), { params: params() })).status).toBe(200);
    expect((await postCancel(new Request('http://t', { method: 'POST' }),
      { params: params() })).status).toBe(200);
  });
});

// Регрессия: задание, поднятое из очереди, оставалось в статусе 'queued', и роут
// отмены принимал его за не стартовавшее — markCancelled освобождал слот, физически
// занятый живым Chromium, и на сервере оказывалось три параллельных генерации.
describe('отмена задания, поднятого из очереди', () => {
  it('не освобождает третий слот', async () => {
    const users: AuthUser[] = [
      TEST_USER, OTHER_USER,
      { id: '33333333-3333-3333-3333-333333333333', email: 'c@t', role: 'user' },
      { id: '44444444-4444-4444-4444-444444444444', email: 'd@t', role: 'user' },
    ];
    const started: string[] = [];
    const ids: string[] = [];
    for (const u of users) {
      const job = await createJob(u.id, REQUEST);
      ids.push(job.id);
      // Колбэк повторяет то, что делает роут: статус ставится в момент старта.
      submit(job.id, u.id, () => { setStatus(job.id, 'running'); started.push(job.id); });
    }
    expect(started).toEqual([ids[0], ids[1]]);

    // Первое задание кончилось — третье поднимается из очереди и обязано стать running.
    appendEvent(ids[0], { type: 'done', simulationId: '55555555-5555-5555-5555-555555555555' });
    expect(started).toEqual([ids[0], ids[1], ids[2]]);

    session.current = users[2];
    const res = await postCancel(new Request('http://t', { method: 'POST' }),
      { params: Promise.resolve({ id: ids[2] }) });
    expect(res.status).toBe(200);
    // Четвёртое НЕ стартовало: слот занят живым пайплайном третьего, который сам
    // закроется по флагу отмены.
    expect(started).toEqual([ids[0], ids[1], ids[2]]);
  });
});

async function readAllSSE(res: Response): Promise<PipelineEvent[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: PipelineEvent[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    // eslint-disable-next-line no-cond-assign
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)));
    }
  }
  return events;
}

describe('GET /api/jobs/[id]/stream', () => {
  it('returns 404 for an unknown job', async () => {
    const res = await getStream(new Request('http://t'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('replays past events, delivers live events, and closes on the terminal event', async () => {
    const job = await createJob(TEST_USER.id, REQUEST);
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'end', at: 2 });

    const res = await getStream(new Request('http://t'), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const events: PipelineEvent[] = [];
    const readFrames = () => {
      let idx: number;
      // eslint-disable-next-line no-cond-assign
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)));
      }
    };

    // Реплей: два уже накопленных события должны прийти первыми.
    while (events.length < 2) {
      const { value } = await reader.read();
      buf += decoder.decode(value!, { stream: true });
      readFrames();
    }
    expect(events).toEqual([
      { type: 'stage', stage: 'planning', status: 'start', at: 1 },
      { type: 'stage', stage: 'planning', status: 'end', at: 2 },
    ]);

    // Live: новое событие, добавленное после того как стрим уже открыт, доезжает.
    appendEvent(job.id, { type: 'warning', message: 'осторожно' });
    while (events.length < 3) {
      const { value } = await reader.read();
      buf += decoder.decode(value!, { stream: true });
      readFrames();
    }
    expect(events[2]).toEqual({ type: 'warning', message: 'осторожно' });

    // Терминальное событие закрывает поток: done → reader.read() возвращает done:true
    // после доставки самого события, без дублирования и потери.
    appendEvent(job.id, { type: 'done', simulationId: 'sim-1' });
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      if (value) {
        buf += decoder.decode(value, { stream: true });
        readFrames();
      }
      if (done) finished = true;
    }
    expect(events).toHaveLength(4);
    expect(events[3]).toEqual({ type: 'done', simulationId: 'sim-1' });
    // Никаких дублей.
    expect(new Set(events.map((e) => JSON.stringify(e))).size).toBe(4);
  });

  it('closes immediately after replay when the job is already terminal', async () => {
    const job = await createJob(TEST_USER.id, REQUEST);
    appendEvent(job.id, { type: 'done', simulationId: 'sim-2' });

    const res = await getStream(new Request('http://t'), { params: Promise.resolve({ id: job.id }) });
    const events = await readAllSSE(res);
    expect(events).toEqual([{ type: 'done', simulationId: 'sim-2' }]);
  });
});
