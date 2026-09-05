import { describe, it, expect, beforeEach } from 'vitest';
import {
  createJob, getJob, setStatus, appendEvent, markCancelled, requestCancel, isCancelled,
  subscribe, __clearForTests,
} from '@/lib/jobs';
import type { JobRequest } from '@/lib/jobs';
import { submit, finish, hasActive, __resetLimitsForTests } from '@/lib/limits';

const REQUEST: JobRequest = { prompt: 'маятник', mode: 'standard', hasImage: false };
const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';
const THIRD = '33333333-3333-3333-3333-333333333333';

describe('jobs store', () => {
  beforeEach(() => {
    // DATABASE_URL не задан: хранилище заданий обязано работать целиком в памяти.
    delete process.env.DATABASE_URL;
    __clearForTests();
    __resetLimitsForTests();
  });

  it('create → getJob returns the same job', async () => {
    const job = await createJob(OWNER, REQUEST);
    expect(job.status).toBe('queued');
    expect(job.ownerId).toBe(OWNER);
    expect(job.events).toEqual([]);
    expect(job.request).toEqual(REQUEST);
    expect(await getJob(OWNER, job.id)).toEqual(job);
  });

  it('getJob returns null for unknown id', async () => {
    expect(await getJob(OWNER, 'nope')).toBeNull();
  });

  it('чужое задание неотличимо от несуществующего: getJob даёт null', async () => {
    const job = await createJob(OWNER, REQUEST);
    expect(await getJob(STRANGER, job.id)).toBeNull();
  });

  it('setStatus меняет статус задания', async () => {
    const job = await createJob(OWNER, REQUEST);
    setStatus(job.id, 'running');
    expect((await getJob(OWNER, job.id))!.status).toBe('running');
  });

  it('done event sets status done + simulationId', async () => {
    const job = await createJob(OWNER, REQUEST);
    appendEvent(job.id, { type: 'done', simulationId: 'sim-1' });
    const updated = (await getJob(OWNER, job.id))!;
    expect(updated.status).toBe('done');
    expect(updated.simulationId).toBe('sim-1');
    expect(updated.events).toEqual([{ type: 'done', simulationId: 'sim-1' }]);
  });

  it('error event sets status error + error message', async () => {
    const job = await createJob(OWNER, REQUEST);
    appendEvent(job.id, { type: 'error', message: 'boom' });
    const updated = (await getJob(OWNER, job.id))!;
    expect(updated.status).toBe('error');
    expect(updated.error).toBe('boom');
  });

  it('subscribe receives only events appended after subscription; unsubscribe stops delivery', async () => {
    const job = await createJob(OWNER, REQUEST);
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });

    const received: string[] = [];
    const unsubscribe = subscribe(job.id, (e) => received.push(e.type));

    appendEvent(job.id, { type: 'stage', stage: 'generating', status: 'start', at: 2 });
    expect(received).toEqual(['stage']);

    unsubscribe();
    appendEvent(job.id, { type: 'stage', stage: 'judging', status: 'start', at: 3 });
    expect(received).toEqual(['stage']);
  });

  it('requestCancel / isCancelled', async () => {
    const job = await createJob(OWNER, REQUEST);
    expect(isCancelled(job.id)).toBe(false);
    requestCancel(job.id);
    expect(isCancelled(job.id)).toBe(true);
  });

  it('markCancelled appends a cancelled event and sets terminal status', async () => {
    const job = await createJob(OWNER, REQUEST);
    const received: string[] = [];
    subscribe(job.id, (e) => received.push(e.type));
    markCancelled(job.id);
    const updated = (await getJob(OWNER, job.id))!;
    expect(updated.status).toBe('cancelled');
    expect(updated.events).toEqual([{ type: 'cancelled' }]);
    expect(received).toEqual(['cancelled']);
  });

  it('терминальное событие освобождает место в ограничителе', async () => {
    const job = await createJob(OWNER, REQUEST);
    submit(job.id, OWNER, () => {});
    expect(hasActive(OWNER)).toBe(true);
    appendEvent(job.id, { type: 'done', simulationId: 'sim-1' });
    expect(hasActive(OWNER)).toBe(false);
  });

  // Отменённое задание доигрывает пайплайн и может прислать свой 'done': принять его
  // значило бы освободить слот второй раз и переписать терминальный статус.
  it('терминальное задание не меняется повторными событиями и не выдаёт второй слот', async () => {
    const started: string[] = [];
    const mine = await createJob(OWNER, REQUEST);
    submit(mine.id, OWNER, () => started.push(mine.id));
    const other = await createJob(STRANGER, REQUEST);
    submit(other.id, STRANGER, () => started.push(other.id));
    const waiting = await createJob(THIRD, REQUEST);
    expect(submit(waiting.id, THIRD, () => started.push(waiting.id))).toBe('queued');

    markCancelled(mine.id);
    expect(started).toEqual([mine.id, other.id, waiting.id]);

    // Повтор: ни статус, ни журнал, ни занятость слотов не меняются.
    markCancelled(mine.id);
    appendEvent(mine.id, { type: 'done', simulationId: 'sim-1' });
    setStatus(mine.id, 'running');
    const updated = (await getJob(OWNER, mine.id))!;
    expect(updated.status).toBe('cancelled');
    expect(updated.events).toEqual([{ type: 'cancelled' }]);
    expect(started).toEqual([mine.id, other.id, waiting.id]);
    expect(hasActive(OWNER)).toBe(false);
  });

  // Регрессия: задание, поднятое из очереди, оставалось в статусе 'queued', и роут
  // отмены принимал его за не стартовавшее — освобождая слот под живым Chromium.
  it('поднятое из очереди задание получает статус running', async () => {
    const startAsRoute = (id: string) => () => setStatus(id, 'running');
    const a = await createJob(OWNER, REQUEST);
    submit(a.id, OWNER, startAsRoute(a.id));
    const b = await createJob(STRANGER, REQUEST);
    submit(b.id, STRANGER, startAsRoute(b.id));
    const c = await createJob(THIRD, REQUEST);
    expect(submit(c.id, THIRD, startAsRoute(c.id))).toBe('queued');
    expect((await getJob(THIRD, c.id))!.status).toBe('queued');

    appendEvent(a.id, { type: 'done', simulationId: 'sim-1' });
    expect((await getJob(THIRD, c.id))!.status).toBe('running');
    finish(b.id);
  });
});
