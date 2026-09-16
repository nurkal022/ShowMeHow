import crypto from 'node:crypto';
import type { PipelineEvent } from '../types';
import { reapDecision } from './policy';
import {
  ActiveJobExistsError, LEASE_SECONDS, LOST_TWICE_MESSAGE, REAP_GRACE_SECONDS, REQUEUE_WARNING,
  WORKER_ALIVE_SECONDS, outcomeEvent,
  type ClaimedJob, type Job, type JobStore, type ReapedJob, type StoredEvent,
} from './store';

interface Row extends ClaimedJob {
  order: number;
  lockedBy: string | null;
  lockedUntil: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Драйвер для тестов и для dev без базы. Даёт те же гарантии, что Postgres, но только
 * внутри одного процесса.
 */
export function createMemoryJobStore(opts: { now?: () => number } = {}): JobStore {
  const now = opts.now ?? Date.now;
  const rows = new Map<string, Row>();
  const log = new Map<string, StoredEvent[]>();
  const workers = new Map<string, { seenAt: number; running: number }>();
  const jobListeners = new Map<string, Set<() => void>>();
  const queueListeners = new Set<() => void>();
  let order = 0;

  const iso = (ms: number) => new Date(ms).toISOString();
  const isActive = (r: Row) => r.status === 'queued' || r.status === 'running';
  const owns = (r: Row, workerId: string) => r.status === 'running' && r.lockedBy === workerId;

  function view(r: Row): Job {
    const { order: _o, lockedBy: _b, lockedUntil: _u, imageDataUrl: _i, ...job } = r;
    return structuredClone(job);
  }

  // Уведомления асинхронны, как у NOTIFY: подписчик не должен рассчитывать на синхронный вызов.
  function notifyJob(id: string): void {
    for (const cb of jobListeners.get(id) ?? []) queueMicrotask(cb);
  }
  function notifyQueue(): void {
    for (const cb of queueListeners) queueMicrotask(cb);
  }

  function push(id: string, event: PipelineEvent): number {
    const list = log.get(id) ?? [];
    const seq = list.length + 1;
    list.push({ seq, event: structuredClone(event) });
    log.set(id, list);
    notifyJob(id);
    return seq;
  }

  function release(r: Row): void {
    r.lockedBy = null;
    r.lockedUntil = null;
  }

  function close(r: Row): void {
    r.finishedAt = iso(now());
    r.imageDataUrl = null;
    release(r);
  }

  return {
    async create(input) {
      for (const r of rows.values()) {
        if (r.ownerId === input.ownerId && r.kind === input.kind && isActive(r)) {
          throw new ActiveJobExistsError(input.kind);
        }
      }
      const row: Row = {
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        kind: input.kind,
        status: 'queued',
        priority: input.priority,
        request: structuredClone(input.request),
        targetSimulationId: input.targetSimulationId ?? null,
        simulationId: null,
        error: null,
        attempts: 0,
        cancelRequested: false,
        createdAt: iso(now()),
        startedAt: null,
        finishedAt: null,
        imageDataUrl: input.imageDataUrl ?? null,
        order: order++,
        lockedBy: null,
        lockedUntil: null,
      };
      rows.set(row.id, row);
      notifyQueue();
      return view(row);
    },

    async get(id) {
      const r = rows.get(id);
      return r ? view(r) : null;
    },

    async claim(workerId) {
      const next = [...rows.values()]
        .filter((r) => r.status === 'queued')
        .sort((a, b) => b.priority - a.priority || a.order - b.order)[0];
      if (!next) return null;
      next.status = 'running';
      next.lockedBy = workerId;
      next.lockedUntil = now() + LEASE_SECONDS * 1000;
      next.attempts += 1;
      next.startedAt ??= iso(now());
      return { ...view(next), imageDataUrl: next.imageDataUrl };
    },

    async appendEvent(id, event, workerId) {
      const r = rows.get(id);
      if (!r) return null;
      if (workerId !== undefined && !owns(r, workerId)) return null;
      return push(id, event);
    },

    async events(id, afterSeq) {
      return structuredClone((log.get(id) ?? []).filter((e) => e.seq > afterSeq));
    },

    async markSaved(id, workerId, simulationId) {
      const r = rows.get(id);
      if (r && owns(r, workerId)) r.simulationId = simulationId;
    },

    async finish(id, workerId, outcome) {
      const r = rows.get(id);
      if (!r || !owns(r, workerId)) return false;
      r.status = outcome.status;
      if (outcome.status === 'done') r.simulationId = outcome.simulationId;
      r.error = outcome.status === 'error' ? outcome.message : null;
      close(r);
      push(id, outcomeEvent(outcome));
      return true;
    },

    async requestCancel(id) {
      const r = rows.get(id);
      if (r && isActive(r)) r.cancelRequested = true;
    },

    async cancelQueued(id) {
      const r = rows.get(id);
      if (!r || r.status !== 'queued') return false;
      r.status = 'cancelled';
      r.cancelRequested = true;
      close(r);
      push(id, { type: 'cancelled' });
      return true;
    },

    async heartbeat(workerId, _host, running) {
      workers.set(workerId, { seenAt: now(), running });
      const leased: string[] = [];
      const cancelRequested: string[] = [];
      for (const r of rows.values()) {
        if (!owns(r, workerId)) continue;
        r.lockedUntil = now() + LEASE_SECONDS * 1000;
        leased.push(r.id);
        if (r.cancelRequested) cancelRequested.push(r.id);
      }
      return { leased, cancelRequested };
    },

    async retireWorker(workerId) {
      workers.delete(workerId);
    },

    async reap() {
      const out: ReapedJob[] = [];
      const deadline = now() - REAP_GRACE_SECONDS * 1000;
      for (const r of rows.values()) {
        if (r.status !== 'running' || r.lockedUntil === null || r.lockedUntil >= deadline) continue;
        const decision = reapDecision(r);
        if (decision === 'requeue') {
          r.status = 'queued';
          release(r);
          push(r.id, { type: 'warning', message: REQUEUE_WARNING });
          notifyQueue();
        } else if (decision === 'fail') {
          r.status = 'error';
          r.error = LOST_TWICE_MESSAGE;
          close(r);
          push(r.id, { type: 'error', message: LOST_TWICE_MESSAGE });
        } else {
          r.status = 'cancelled';
          close(r);
          push(r.id, { type: 'cancelled' });
        }
        out.push({ id: r.id, decision });
      }
      for (const [id, w] of workers) if (w.seenAt < now() - DAY_MS) workers.delete(id);
      return out;
    },

    async position(id) {
      const me = rows.get(id);
      if (!me || me.status !== 'queued') return 0;
      let ahead = 0;
      for (const q of rows.values()) {
        if (q === me || q.status !== 'queued') continue;
        if (q.priority > me.priority || (q.priority === me.priority && q.order < me.order)) ahead++;
      }
      return ahead + 1;
    },

    async stats() {
      const queued = [...rows.values()].filter((r) => r.status === 'queued');
      const running = [...rows.values()].filter((r) => r.status === 'running').length;
      const oldest = queued.length ? Math.min(...queued.map((r) => Date.parse(r.createdAt))) : null;
      const seen = [...workers.values()].map((w) => w.seenAt);
      const alive = seen.filter((t) => t > now() - WORKER_ALIVE_SECONDS * 1000).length;
      const last = seen.length ? Math.max(...seen) : null;
      return {
        queued: queued.length,
        oldestQueuedSec: oldest === null ? null : Math.floor((now() - oldest) / 1000),
        running,
        workersAlive: alive,
        lastWorkerSeenSec: last === null ? null : Math.floor((now() - last) / 1000),
      };
    },

    subscribe(id, onChange) {
      let set = jobListeners.get(id);
      if (!set) {
        set = new Set();
        jobListeners.set(id, set);
      }
      set.add(onChange);
      return () => {
        set!.delete(onChange);
        if (set!.size === 0) jobListeners.delete(id);
      };
    },

    subscribeQueue(onQueued) {
      queueListeners.add(onQueued);
      return () => { queueListeners.delete(onQueued); };
    },
  };
}
