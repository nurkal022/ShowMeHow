import type { PipelineEvent, QualityMode } from '../types';
import type { ReapDecision } from './policy';

export type JobKind = 'generate' | 'refine';
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface GenerateRequest { prompt: string; mode: QualityMode; hasImage: boolean }
export interface RefineRequest { instruction: string }
export type JobRequest = GenerateRequest | RefineRequest;

export interface Job {
  id: string;
  ownerId: string;
  kind: JobKind;
  status: JobStatus;
  priority: number;
  request: JobRequest;
  targetSimulationId: string | null;
  simulationId: string | null;
  error: string | null;
  attempts: number;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Задание в руках воркера: только ему нужна картинка-образец. */
export interface ClaimedJob extends Job {
  imageDataUrl: string | null;
}

export interface NewJob {
  ownerId: string;
  kind: JobKind;
  priority: number;
  request: JobRequest;
  targetSimulationId?: string;
  imageDataUrl?: string;
}

export interface StoredEvent { seq: number; event: PipelineEvent }

export type JobOutcome =
  | { status: 'done'; simulationId: string }
  | { status: 'error'; message: string }
  | { status: 'cancelled' };

export interface HeartbeatResult {
  /** Задания, аренду которых продлили. Своё задание вне списка потеряно. */
  leased: string[];
  cancelRequested: string[];
}

export interface ReapedJob { id: string; decision: ReapDecision }

export interface QueueStats {
  queued: number;
  oldestQueuedSec: number | null;
  running: number;
  workersAlive: number;
  lastWorkerSeenSec: number | null;
}

export interface PublicJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  createdAt: string;
  request: JobRequest;
  targetSimulationId?: string;
  simulationId?: string;
  error?: string;
}

/**
 * Единственный путь к заданиям. Владение здесь не проверяется: get отдаёт любое
 * задание, а роуты сверяют владельца через getOwnedJob.
 */
export interface JobStore {
  /** Бросает ActiveJobExistsError, если у человека уже есть активное задание этого вида. */
  create(input: NewJob): Promise<Job>;
  get(id: string): Promise<Job | null>;
  claim(workerId: string): Promise<ClaimedJob | null>;
  /** С workerId пишет, только пока задание в его аренде. null — событие не записано. */
  appendEvent(id: string, event: PipelineEvent, workerId?: string): Promise<number | null>;
  events(id: string, afterSeq: number): Promise<StoredEvent[]>;
  markSaved(id: string, workerId: string, simulationId: string): Promise<void>;
  /** Одна транзакция: статус, результат, снятие аренды и терминальное событие. */
  finish(id: string, workerId: string, outcome: JobOutcome): Promise<boolean>;
  requestCancel(id: string): Promise<void>;
  cancelQueued(id: string): Promise<boolean>;
  /**
   * Отмечает воркер живым и продлевает аренду только перечисленных заданий, которые он
   * держит. Задание без живой попытки в процессе не продлевается и достаётся уборщику.
   */
  heartbeat(workerId: string, host: string, running: number, jobIds: string[]): Promise<HeartbeatResult>;
  retireWorker(workerId: string): Promise<void>;
  reap(): Promise<ReapedJob[]>;
  /** Место в очереди с единицы; 0 — задание не ждёт. */
  position(id: string): Promise<number>;
  stats(): Promise<QueueStats>;
  /** Сигнал «в журнале могло появиться новое»; дочитывать по seq должен подписчик. */
  subscribe(id: string, onChange: () => void): () => void;
  subscribeQueue(onQueued: () => void): () => void;
}

export class ActiveJobExistsError extends Error {
  readonly kind: JobKind;
  constructor(kind: JobKind) {
    super(`у пользователя уже есть активное задание вида ${kind}`);
    this.name = 'ActiveJobExistsError';
    this.kind = kind;
  }
}

/** Аренда, которую продлевает сердцебиение раз в 15 секунд. */
export const LEASE_SECONDS = 60;
/** Запас сверх аренды, после которого уборщик считает воркер потерянным. */
export const REAP_GRACE_SECONDS = 30;
/** Воркер жив, если его видели за это время. */
export const WORKER_ALIVE_SECONDS = 60;

export const REQUEUE_WARNING = 'Воркер перезапущен, генерация начата заново.';
export const LOST_TWICE_MESSAGE = 'Генерация прервалась дважды. Попробуйте ещё раз.';

export function isTerminalStatus(s: JobStatus): boolean {
  return s === 'done' || s === 'error' || s === 'cancelled';
}

export function isTerminalEvent(e: PipelineEvent): boolean {
  return e.type === 'done' || e.type === 'error' || e.type === 'cancelled';
}

export function outcomeEvent(o: JobOutcome): PipelineEvent {
  if (o.status === 'done') return { type: 'done', simulationId: o.simulationId };
  if (o.status === 'error') return { type: 'error', message: o.message };
  return { type: 'cancelled' };
}

/**
 * Терминальное событие по статусу. Нужно для старых записей: прежний код помечал
 * задание ошибкой при чтении и событие в журнал не добавлял.
 */
export function terminalEventFor(job: Job): PipelineEvent | null {
  if (job.status === 'done' && job.simulationId) {
    return { type: 'done', simulationId: job.simulationId };
  }
  if (job.status === 'error') return { type: 'error', message: job.error ?? 'Ошибка генерации.' };
  if (job.status === 'cancelled') return { type: 'cancelled' };
  return null;
}

/** Наружу не уходят владелец, приоритет, попытки и аренда. */
export function publicJob(job: Job): PublicJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    request: job.request,
    ...(job.targetSimulationId ? { targetSimulationId: job.targetSimulationId } : {}),
    ...(job.simulationId ? { simulationId: job.simulationId } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}
