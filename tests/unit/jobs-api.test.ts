import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST as postGenerate } from '@/app/api/generate/route';
import { GET as getJobRoute } from '@/app/api/jobs/[id]/route';
import { POST as postCancel } from '@/app/api/jobs/[id]/cancel/route';
import { GET as getStream } from '@/app/api/jobs/[id]/stream/route';
import { createJob, appendEvent, __clearForTests } from '@/lib/jobs';
import { saveSettings } from '@/lib/settings';
import type { JobRequest } from '@/lib/jobs';
import type { PipelineEvent } from '@/lib/types';

const REQUEST: JobRequest = { prompt: 'маятник', mode: 'standard', candidates: 2, hasImage: false };

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-jobs-api-'));
  __clearForTests();
});

function jobsDirEntries(): string[] {
  const dir = path.join(process.env.SHOWMEHOW_DATA_DIR!, 'jobs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

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
    expect(body.error).toBe('Провайдер не настроен. Откройте Настройки.');
    // Никаких побочных эффектов: job не создан ни в памяти, ни на диске.
    expect(jobsDirEntries()).toHaveLength(0);
  });
});

describe('POST /api/jobs/[id]/cancel', () => {
  it('returns 404 for an unknown job', async () => {
    const res = await postCancel(new Request('http://t', { method: 'POST' }),
      { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('returns {ok:true} for a known job and is idempotent', async () => {
    const job = createJob(REQUEST);
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
    const job = createJob(REQUEST);
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });
    const res = await getJobRoute(new Request('http://t'), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: job.id, status: 'running', createdAt: job.createdAt, request: REQUEST,
    });
    expect(body.events).toBeUndefined();
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
    const job = createJob(REQUEST);
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
    const job = createJob(REQUEST);
    appendEvent(job.id, { type: 'done', simulationId: 'sim-2' });

    const res = await getStream(new Request('http://t'), { params: Promise.resolve({ id: job.id }) });
    const events = await readAllSSE(res);
    expect(events).toEqual([{ type: 'done', simulationId: 'sim-2' }]);
  });
});
