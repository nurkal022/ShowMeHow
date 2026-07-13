import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './settings';
import type { PipelineEvent, QualityMode } from './types';

export type JobStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface JobRequest {
  prompt: string;
  mode: QualityMode;
  candidates: number;
  hasImage: boolean;
}

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  events: PipelineEvent[];
  simulationId?: string;
  error?: string;
  request: JobRequest;
}

const jobs = new Map<string, Job>();
const cancelFlags = new Set<string>();
const subscribers = new Map<string, Set<(e: PipelineEvent) => void>>();

function jobsRoot(): string {
  return path.join(dataDir(), 'jobs');
}

function jobPath(id: string): string {
  return path.join(jobsRoot(), `${id}.json`);
}

function persist(job: Job): void {
  fs.mkdirSync(jobsRoot(), { recursive: true });
  fs.writeFileSync(jobPath(job.id), JSON.stringify(job));
}

function loadFromDisk(id: string): Job | null {
  const file = jobPath(id);
  if (!fs.existsSync(file)) return null;
  try {
    const job = JSON.parse(fs.readFileSync(file, 'utf8')) as Job;
    if (job.status === 'running') {
      // Осиротевший running job (найден на диске, но не в памяти этого процесса) —
      // процесс, который его вёл, был перезапущен/убит.
      job.status = 'error';
      job.error = 'Сервер был перезапущен';
      persist(job);
    }
    jobs.set(id, job);
    return job;
  } catch {
    return null;
  }
}

export function createJob(request: JobRequest): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    status: 'running',
    createdAt: new Date().toISOString(),
    events: [],
    request,
  };
  jobs.set(job.id, job);
  persist(job);
  return job;
}

export function getJob(id: string): Job | null {
  const inMemory = jobs.get(id);
  if (inMemory) return inMemory;
  return loadFromDisk(id);
}

function notify(id: string, e: PipelineEvent): void {
  const subs = subscribers.get(id);
  if (!subs) return;
  for (const cb of subs) cb(e);
}

export function appendEvent(id: string, e: PipelineEvent): void {
  const job = jobs.get(id);
  if (!job) return;
  job.events.push(e);
  if (e.type === 'done') {
    job.status = 'done';
    job.simulationId = e.simulationId;
  } else if (e.type === 'error') {
    job.status = 'error';
    job.error = e.message;
  }
  persist(job);
  notify(id, e);
}

export function markCancelled(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  const event: PipelineEvent = { type: 'cancelled' };
  job.events.push(event);
  job.status = 'cancelled';
  persist(job);
  notify(id, event);
}

export function requestCancel(id: string): void {
  cancelFlags.add(id);
}

export function isCancelled(id: string): boolean {
  return cancelFlags.has(id);
}

export function subscribe(id: string, cb: (e: PipelineEvent) => void): () => void {
  let subs = subscribers.get(id);
  if (!subs) {
    subs = new Set();
    subscribers.set(id, subs);
  }
  subs.add(cb);
  return () => {
    subs!.delete(cb);
    if (subs!.size === 0) subscribers.delete(id);
  };
}

export function __clearForTests(): void {
  jobs.clear();
  cancelFlags.clear();
  subscribers.clear();
}
