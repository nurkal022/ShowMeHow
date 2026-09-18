import { db, hasDb } from '../db/client';

/**
 * Черновики задания — версии симуляции по ходу генерации. HTML лежит отдельно от журнала
 * событий: событие несёт только номер версии, иначе каждый реплей потока тащил бы сотни
 * килобайт. Без базы (разработка) черновики живут в памяти процесса.
 */

export interface DraftInfo { version: number; label: string; createdAt: string }

const MEMORY_KEY = Symbol.for('tesseract.memoryDrafts');
type Mem = Map<string, { version: number; label: string; html: string; createdAt: string }[]>;
function mem(): Mem {
  const g = globalThis as unknown as Record<symbol, Mem | undefined>;
  g[MEMORY_KEY] ??= new Map();
  return g[MEMORY_KEY]!;
}

/** Возвращает номер новой версии (с единицы). */
export async function saveDraft(jobId: string, label: string, html: string): Promise<number> {
  if (!hasDb()) {
    const list = mem().get(jobId) ?? [];
    const version = list.length + 1;
    list.push({ version, label, html, createdAt: new Date().toISOString() });
    mem().set(jobId, list);
    return version;
  }
  const { rows } = await db().query<{ version: number }>(
    `INSERT INTO job_drafts (job_id, version, label, html)
     VALUES ($1, (SELECT coalesce(max(version), 0) + 1 FROM job_drafts WHERE job_id = $1), $2, $3)
     RETURNING version`, [jobId, label, html]);
  return rows[0].version;
}

export async function getDraft(jobId: string, version: number): Promise<{ label: string; html: string } | null> {
  if (!Number.isInteger(version) || version < 1) return null;
  if (!hasDb()) {
    const d = mem().get(jobId)?.find((x) => x.version === version);
    return d ? { label: d.label, html: d.html } : null;
  }
  const { rows } = await db().query<{ label: string; html: string }>(
    'SELECT label, html FROM job_drafts WHERE job_id = $1 AND version = $2', [jobId, version]);
  return rows[0] ?? null;
}

export async function listDrafts(jobId: string): Promise<DraftInfo[]> {
  if (!hasDb()) return (mem().get(jobId) ?? []).map(({ version, label, createdAt }) => ({ version, label, createdAt }));
  const { rows } = await db().query<{ version: number; label: string; created_at: Date }>(
    'SELECT version, label, created_at FROM job_drafts WHERE job_id = $1 ORDER BY version', [jobId]);
  return rows.map((r) => ({ version: r.version, label: r.label, createdAt: r.created_at.toISOString() }));
}

/** Человек оставил черновик как результат: задание помнит симуляцию, история ведёт к ней. */
export async function linkKeptSimulation(jobId: string, simulationId: string): Promise<void> {
  if (!hasDb()) return;
  await db().query('UPDATE jobs SET simulation_id = $2 WHERE id = $1 AND simulation_id IS NULL', [jobId, simulationId]);
}
