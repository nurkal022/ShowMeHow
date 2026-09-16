import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PipelineEvent } from '../types';
import { reapDecision } from './policy';
import { listenJobEvents, listenQueue } from './listener';
import {
  ActiveJobExistsError, LEASE_SECONDS, LOST_TWICE_MESSAGE, REAP_GRACE_SECONDS, REQUEUE_WARNING,
  WORKER_ALIVE_SECONDS, outcomeEvent,
  type Job, type JobKind, type JobRequest, type JobStatus, type JobStore,
  type ReapedJob, type StoredEvent,
} from './store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = `id, owner_id, kind, status, priority, request, target_simulation_id, simulation_id,
  error, attempts, cancel_requested_at, created_at, started_at, finished_at`;

interface Row {
  id: string; owner_id: string; kind: JobKind; status: JobStatus; priority: number;
  request: JobRequest; target_simulation_id: string | null; simulation_id: string | null;
  error: string | null; attempts: number; cancel_requested_at: Date | null;
  created_at: Date; started_at: Date | null; finished_at: Date | null;
  image_data_url?: string | null;
}

function toJob(r: Row): Job {
  return {
    id: r.id,
    ownerId: r.owner_id,
    kind: r.kind,
    status: r.status,
    priority: r.priority,
    request: r.request,
    targetSimulationId: r.target_simulation_id,
    simulationId: r.simulation_id,
    error: r.error,
    attempts: r.attempts,
    cancelRequested: r.cancel_requested_at !== null,
    createdAt: r.created_at.toISOString(),
    startedAt: r.started_at?.toISOString() ?? null,
    finishedAt: r.finished_at?.toISOString() ?? null,
  };
}

const ACTIVE_INDEX: Record<string, JobKind> = {
  jobs_one_active_generate: 'generate',
  jobs_one_active_refine: 'refine',
};

function errorCode(e: unknown): { code?: string; constraint?: string } {
  return typeof e === 'object' && e !== null ? (e as { code?: string; constraint?: string }) : {};
}

async function inTx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Событие внутри транзакции; NOTIFY уйдёт подписчикам в момент COMMIT. */
async function insertEvent(c: PoolClient, id: string, event: PipelineEvent): Promise<number> {
  const { rows } = await c.query<{ seq: number }>(
    `INSERT INTO job_events (job_id, seq, event)
     SELECT $1::uuid, coalesce(max(seq), 0) + 1, $2::jsonb FROM job_events WHERE job_id = $1::uuid
     RETURNING seq`, [id, JSON.stringify(event)]);
  await c.query("SELECT pg_notify('job_events', $1)", [id]);
  return rows[0].seq;
}

const SECONDS = (n: number) => `interval '${n} seconds'`;

export function createPgJobStore(
  pool: Pool,
  listen: {
    job: (id: string, cb: () => void) => () => void;
    queue: (cb: () => void) => () => void;
  } = { job: listenJobEvents, queue: listenQueue },
): JobStore {
  return {
    async create(input) {
      try {
        const { rows } = await pool.query<Row>(
          `WITH ins AS (
             INSERT INTO jobs (id, owner_id, kind, status, priority, request, target_simulation_id, image_data_url)
             VALUES ($1, $2, $3, 'queued', $4, $5::jsonb, $6, $7)
             RETURNING ${COLUMNS})
           SELECT ins.*, pg_notify('job_queue', '') FROM ins`,
          [crypto.randomUUID(), input.ownerId, input.kind, input.priority,
            JSON.stringify(input.request), input.targetSimulationId ?? null, input.imageDataUrl ?? null]);
        return toJob(rows[0]);
      } catch (e) {
        const { code, constraint } = errorCode(e);
        if (code === '23505' && constraint && ACTIVE_INDEX[constraint]) {
          throw new ActiveJobExistsError(ACTIVE_INDEX[constraint]);
        }
        throw e;
      }
    },

    async get(id) {
      if (!UUID_RE.test(id)) return null;
      const { rows } = await pool.query<Row>(`SELECT ${COLUMNS} FROM jobs WHERE id = $1`, [id]);
      return rows[0] ? toJob(rows[0]) : null;
    },

    async claim(workerId) {
      const { rows } = await pool.query<Row>(
        `UPDATE jobs SET status = 'running', locked_by = $1,
                locked_until = now() + ${SECONDS(LEASE_SECONDS)},
                attempts = attempts + 1, started_at = coalesce(started_at, now())
         WHERE id = (
           SELECT id FROM jobs WHERE status = 'queued'
           ORDER BY priority DESC, created_at
           FOR UPDATE SKIP LOCKED LIMIT 1)
         RETURNING ${COLUMNS}, image_data_url`, [workerId]);
      const r = rows[0];
      return r ? { ...toJob(r), imageDataUrl: r.image_data_url ?? null } : null;
    },

    async appendEvent(id, event, workerId) {
      if (!UUID_RE.test(id)) return null;
      // HAVING, а не WHERE: агрегат без GROUP BY даёт строку даже на пустом наборе,
      // и условие владения обязано отсечь именно её.
      const sql = `
        WITH ins AS (
          INSERT INTO job_events (job_id, seq, event)
          SELECT $1::uuid, coalesce(max(e.seq), 0) + 1, $2::jsonb
          FROM job_events e WHERE e.job_id = $1::uuid
          HAVING EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = $1::uuid
              AND ($3::text IS NULL OR (j.locked_by = $3::text AND j.status = 'running'))
            FOR SHARE OF j)
          RETURNING seq)
        SELECT seq, pg_notify('job_events', $1::uuid::text) FROM ins`;
      const params = [id, JSON.stringify(event), workerId ?? null];
      // FOR SHARE ждёт идущие finish, уборщика и отмену: они держат строку задания
      // до COMMIT, а после него условие владения перепроверяется по новой версии строки.
      // Без этого finish мог упасть на seq, который вставили между его UPDATE и событием.
      // Оставшаяся гонка за seq (событие без workerId) снимается повтором.
      for (let attempt = 0; ; attempt++) {
        try {
          const { rows } = await pool.query<{ seq: number }>(sql, params);
          return rows[0]?.seq ?? null;
        } catch (e) {
          if (errorCode(e).code !== '23505' || attempt >= 2) throw e;
        }
      }
    },

    async events(id, afterSeq) {
      if (!UUID_RE.test(id)) return [];
      const { rows } = await pool.query<StoredEvent>(
        'SELECT seq, event FROM job_events WHERE job_id = $1 AND seq > $2 ORDER BY seq', [id, afterSeq]);
      if (rows.length > 0) return rows;
      // Старые записи: журнал лежит в jobs.events, пока у задания нет ни одной строки job_events.
      const legacy = await pool.query<{ events: PipelineEvent[] }>(
        `SELECT events FROM jobs WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM job_events WHERE job_id = $1)`, [id]);
      const list = legacy.rows[0]?.events ?? [];
      return list.map((event, i) => ({ seq: i + 1, event })).filter((e) => e.seq > afterSeq);
    },

    async markSaved(id, workerId, simulationId) {
      if (!UUID_RE.test(id)) return;
      await pool.query(
        "UPDATE jobs SET simulation_id = $3 WHERE id = $1 AND locked_by = $2 AND status = 'running'",
        [id, workerId, simulationId]);
    },

    async finish(id, workerId, outcome) {
      if (!UUID_RE.test(id)) return false;
      return inTx(pool, async (c) => {
        const { rowCount } = await c.query(
          `UPDATE jobs SET status = $3,
                  simulation_id = coalesce($4, simulation_id),
                  error = $5, finished_at = now(), image_data_url = NULL,
                  locked_by = NULL, locked_until = NULL
           WHERE id = $1 AND locked_by = $2 AND status = 'running'`,
          [id, workerId, outcome.status,
            outcome.status === 'done' ? outcome.simulationId : null,
            outcome.status === 'error' ? outcome.message : null]);
        if (!rowCount) return false;
        await insertEvent(c, id, outcomeEvent(outcome));
        return true;
      });
    },

    async requestCancel(id) {
      if (!UUID_RE.test(id)) return;
      await pool.query(
        `UPDATE jobs SET cancel_requested_at = coalesce(cancel_requested_at, now())
         WHERE id = $1 AND status IN ('queued', 'running')`, [id]);
    },

    async cancelQueued(id) {
      if (!UUID_RE.test(id)) return false;
      return inTx(pool, async (c) => {
        const { rowCount } = await c.query(
          `UPDATE jobs SET status = 'cancelled',
                  cancel_requested_at = coalesce(cancel_requested_at, now()),
                  finished_at = now(), image_data_url = NULL
           WHERE id = $1 AND status = 'queued'`, [id]);
        if (!rowCount) return false;
        await insertEvent(c, id, { type: 'cancelled' });
        return true;
      });
    },

    async heartbeat(workerId, host, running) {
      // Изменяющий CTE выполняется, даже если на него никто не ссылается.
      const { rows } = await pool.query<{ id: string; cancel: boolean }>(
        `WITH w AS (
           INSERT INTO workers (id, host, running) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET seen_at = now(), running = EXCLUDED.running),
         j AS (
           UPDATE jobs SET locked_until = now() + ${SECONDS(LEASE_SECONDS)}
           WHERE locked_by = $1 AND status = 'running'
           RETURNING id, cancel_requested_at)
         SELECT id, cancel_requested_at IS NOT NULL AS cancel FROM j`,
        [workerId, host, running]);
      return {
        leased: rows.map((r) => r.id),
        cancelRequested: rows.filter((r) => r.cancel).map((r) => r.id),
      };
    },

    async retireWorker(workerId) {
      await pool.query('DELETE FROM workers WHERE id = $1', [workerId]);
    },

    async reap() {
      const reaped = await inTx(pool, async (c) => {
        const { rows } = await c.query<{ id: string; attempts: number; cancel_requested: boolean }>(
          `SELECT id, attempts, cancel_requested_at IS NOT NULL AS cancel_requested
           FROM jobs
           WHERE status = 'running' AND locked_until < now() - ${SECONDS(REAP_GRACE_SECONDS)}
           FOR UPDATE SKIP LOCKED`);
        const out: ReapedJob[] = [];
        for (const r of rows) {
          const decision = reapDecision({ attempts: r.attempts, cancelRequested: r.cancel_requested });
          if (decision === 'requeue') {
            await c.query(
              "UPDATE jobs SET status = 'queued', locked_by = NULL, locked_until = NULL WHERE id = $1",
              [r.id]);
            await insertEvent(c, r.id, { type: 'warning', message: REQUEUE_WARNING });
          } else {
            const status = decision === 'fail' ? 'error' : 'cancelled';
            const error = decision === 'fail' ? LOST_TWICE_MESSAGE : null;
            await c.query(
              `UPDATE jobs SET status = $2, error = $3, finished_at = now(), image_data_url = NULL,
                      locked_by = NULL, locked_until = NULL
               WHERE id = $1`, [r.id, status, error]);
            await insertEvent(c, r.id, decision === 'fail'
              ? { type: 'error', message: LOST_TWICE_MESSAGE }
              : { type: 'cancelled' });
          }
          out.push({ id: r.id, decision });
        }
        if (out.some((r) => r.decision === 'requeue')) {
          await c.query("SELECT pg_notify('job_queue', '')");
        }
        return out;
      });
      await pool.query("DELETE FROM workers WHERE seen_at < now() - interval '1 day'");
      return reaped;
    },

    async position(id) {
      if (!UUID_RE.test(id)) return 0;
      const { rows } = await pool.query<{ position: number }>(
        `SELECT CASE WHEN me.status <> 'queued' THEN 0 ELSE (
           SELECT count(*)::int + 1 FROM jobs q
           WHERE q.status = 'queued'
             AND (q.priority > me.priority
                  OR (q.priority = me.priority AND q.created_at < me.created_at)))
         END AS position
         FROM jobs me WHERE me.id = $1`, [id]);
      return rows[0]?.position ?? 0;
    },

    async stats() {
      const { rows } = await pool.query<{
        queued: number; oldest: string | null; running: number; alive: number; last_seen: string | null;
      }>(
        `SELECT
           (SELECT count(*)::int FROM jobs WHERE status = 'queued') AS queued,
           (SELECT extract(epoch FROM now() - min(created_at)) FROM jobs WHERE status = 'queued') AS oldest,
           (SELECT count(*)::int FROM jobs WHERE status = 'running') AS running,
           (SELECT count(*)::int FROM workers
              WHERE seen_at > now() - ${SECONDS(WORKER_ALIVE_SECONDS)}) AS alive,
           (SELECT extract(epoch FROM now() - max(seen_at)) FROM workers) AS last_seen`);
      const r = rows[0];
      const sec = (v: string | null) => (v === null ? null : Math.max(0, Math.floor(Number(v))));
      return {
        queued: r.queued,
        oldestQueuedSec: sec(r.oldest),
        running: r.running,
        workersAlive: r.alive,
        lastWorkerSeenSec: sec(r.last_seen),
      };
    },

    subscribe(id, onChange) {
      return listen.job(id, onChange);
    },

    subscribeQueue(onQueued) {
      return listen.queue(onQueued);
    },
  };
}
