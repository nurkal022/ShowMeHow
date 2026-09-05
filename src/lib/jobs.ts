import crypto from 'node:crypto';
import { db, hasDb } from './db/client';
import { finish, setQueueListener } from './limits';
import type { PipelineEvent, QualityMode } from './types';

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface JobRequest {
  prompt: string;
  mode: QualityMode;
  hasImage: boolean;
}

export interface Job {
  id: string;
  ownerId: string;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Записи в базу выстроены в одну цепочку: appendEvent и setStatus синхронны
 * (их зовёт emit пайплайна), поэтому запись отправляется в фоне, но порядок
 * UPDATE-ов обязан совпадать с порядком вызовов — иначе финальный статус мог бы
 * быть перезаписан более ранним.
 */
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>): void {
  if (!hasDb()) return;
  writeChain = writeChain.then(fn).catch((e) => {
    // Задание живёт в памяти и без базы: сбой персистентности не должен ронять пайплайн.
    console.error('Не удалось сохранить задание:', e);
  });
}

/** Дождаться, пока отложенные записи заданий дойдут до базы. Нужно тестам. */
export async function flushJobWrites(): Promise<void> {
  await writeChain;
}

/**
 * Терминальное состояние уходит в базу один раз, вместе с журналом событий.
 * Писать журнал на каждое событие бессмысленно: события идут по несколько раз
 * в секунду, а после перезапуска процесса задание всё равно помечается ошибкой,
 * поэтому промежуточный журнал на диске никому не нужен.
 */
function persistTerminal(job: Job): void {
  const { id, status, events, simulationId, error } = job;
  enqueueWrite(async () => {
    await db().query(
      'UPDATE jobs SET status = $2, events = $3::jsonb, simulation_id = $4, error = $5 WHERE id = $1',
      [id, status, JSON.stringify(events), simulationId ?? null, error ?? null]);
  });
}

export async function createJob(ownerId: string, request: JobRequest): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    ownerId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    events: [],
    request,
  };
  jobs.set(job.id, job);
  if (hasDb()) {
    await db().query(
      'INSERT INTO jobs (id, owner_id, status, request, created_at) VALUES ($1,$2,$3,$4::jsonb,$5)',
      [job.id, ownerId, job.status, JSON.stringify(request), job.createdAt]);
  }
  return job;
}

/** Статус ставит вызывающий сразу после submit: 'running' или 'queued'. */
export function setStatus(id: string, status: JobStatus): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = status;
  enqueueWrite(async () => {
    await db().query('UPDATE jobs SET status = $2 WHERE id = $1', [id, status]);
  });
}

/**
 * Задание, найденное в базе в статусе running/queued, вело не это поколение процесса:
 * его пайплайн уже не существует, поэтому помечаем ошибкой.
 */
async function loadFromDb(ownerId: string, id: string): Promise<Job | null> {
  if (!hasDb() || !UUID_RE.test(id) || !UUID_RE.test(ownerId)) return null;
  const { rows } = await db().query<{
    id: string; owner_id: string; status: JobStatus; request: JobRequest;
    events: PipelineEvent[]; simulation_id: string | null; error: string | null; created_at: Date;
  }>(
    'SELECT id, owner_id, status, request, events, simulation_id, error, created_at'
    + ' FROM jobs WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  const row = rows[0];
  if (!row) return null;
  const job: Job = {
    id: row.id,
    ownerId: row.owner_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    events: row.events ?? [],
    request: row.request,
    ...(row.simulation_id ? { simulationId: row.simulation_id } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
  if (job.status === 'running' || job.status === 'queued') {
    job.status = 'error';
    job.error = 'Сервер был перезапущен';
    persistTerminal(job);
  }
  jobs.set(id, job);
  return job;
}

/** Чужое задание неотличимо от несуществующего: и то и другое — null. */
export async function getJob(ownerId: string, id: string): Promise<Job | null> {
  const inMemory = jobs.get(id);
  if (inMemory) return inMemory.ownerId === ownerId ? inMemory : null;
  return loadFromDb(ownerId, id);
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
  if (e.type === 'done' || e.type === 'error') {
    // Место в ограничителе освобождается ровно тогда, когда задание кончилось,
    // чтобы следующее из очереди стартовало без задержки.
    finish(id);
    persistTerminal(job);
  }
  notify(id, e);
}

export function markCancelled(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  const event: PipelineEvent = { type: 'cancelled' };
  job.events.push(event);
  job.status = 'cancelled';
  finish(id);
  persistTerminal(job);
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
  writeChain = Promise.resolve();
}

// Ожидающие задания узнают свою новую позицию по SSE при каждом сдвиге очереди.
setQueueListener((jobId, position) => appendEvent(jobId, { type: 'queued', position }));
