import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createJob, getJob, appendEvent, markCancelled, requestCancel, isCancelled,
  subscribe, __clearForTests,
} from '@/lib/jobs';
import type { JobRequest } from '@/lib/jobs';

const REQUEST: JobRequest = { prompt: 'маятник', mode: 'standard', hasImage: false };

describe('jobs store', () => {
  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-jobs-'));
    __clearForTests();
  });

  it('create → getJob returns the same job', () => {
    const job = createJob(REQUEST);
    expect(job.status).toBe('running');
    expect(job.events).toEqual([]);
    expect(job.request).toEqual(REQUEST);
    expect(getJob(job.id)).toEqual(job);
  });

  it('getJob returns null for unknown id', () => {
    expect(getJob('nope')).toBeNull();
  });

  it('appendEvent persists to disk (file matches in-memory job)', () => {
    const job = createJob(REQUEST);
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });
    const file = path.join(process.env.SHOWMEHOW_DATA_DIR!, 'jobs', `${job.id}.json`);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(onDisk).toEqual(getJob(job.id));
  });

  it('done event sets status done + simulationId', () => {
    const job = createJob(REQUEST);
    appendEvent(job.id, { type: 'done', simulationId: 'sim-1' });
    const updated = getJob(job.id)!;
    expect(updated.status).toBe('done');
    expect(updated.simulationId).toBe('sim-1');
    expect(updated.events).toEqual([{ type: 'done', simulationId: 'sim-1' }]);
  });

  it('error event sets status error + error message', () => {
    const job = createJob(REQUEST);
    appendEvent(job.id, { type: 'error', message: 'boom' });
    const updated = getJob(job.id)!;
    expect(updated.status).toBe('error');
    expect(updated.error).toBe('boom');
  });

  it('subscribe receives only events appended after subscription; unsubscribe stops delivery', () => {
    const job = createJob(REQUEST);
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });

    const received: string[] = [];
    const unsubscribe = subscribe(job.id, (e) => received.push(e.type));

    appendEvent(job.id, { type: 'stage', stage: 'generating', status: 'start', at: 2 });
    expect(received).toEqual(['stage']);

    unsubscribe();
    appendEvent(job.id, { type: 'stage', stage: 'judging', status: 'start', at: 3 });
    expect(received).toEqual(['stage']);
  });

  it('requestCancel / isCancelled', () => {
    const job = createJob(REQUEST);
    expect(isCancelled(job.id)).toBe(false);
    requestCancel(job.id);
    expect(isCancelled(job.id)).toBe(true);
  });

  it('markCancelled appends a cancelled event and sets terminal status', () => {
    const job = createJob(REQUEST);
    const received: string[] = [];
    subscribe(job.id, (e) => received.push(e.type));
    markCancelled(job.id);
    const updated = getJob(job.id)!;
    expect(updated.status).toBe('cancelled');
    expect(updated.events).toEqual([{ type: 'cancelled' }]);
    expect(received).toEqual(['cancelled']);
  });

  it('orphaned running job on disk (memory cleared) → error "Сервер был перезапущен", re-persisted', () => {
    const job = createJob(REQUEST);
    appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 });
    __clearForTests();

    const recovered = getJob(job.id)!;
    expect(recovered.status).toBe('error');
    expect(recovered.error).toBe('Сервер был перезапущен');

    const file = path.join(process.env.SHOWMEHOW_DATA_DIR!, 'jobs', `${job.id}.json`);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(onDisk.status).toBe('error');
    expect(onDisk.error).toBe('Сервер был перезапущен');
  });

  it('cancelled status is terminal (does not get overwritten by orphan recovery)', () => {
    const job = createJob(REQUEST);
    markCancelled(job.id);
    __clearForTests();
    const recovered = getJob(job.id)!;
    expect(recovered.status).toBe('cancelled');
  });
});
