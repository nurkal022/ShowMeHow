import { db, hasDb } from '../db/client';
import { isUuid } from '../org/access';
import type { JobStatus } from './store';

/**
 * История работы человека, как список чатов: одна сессия — одна генерация вместе со всеми
 * доработками получившейся симуляции. Отменённые и упавшие генерации тоже здесь: к ним
 * можно вернуться, открыть черновик или повторить запрос. Без базы истории нет.
 */

export interface SessionItem {
  jobId: string;
  status: JobStatus;
  prompt: string;
  title: string | null;
  simulationId: string | null;
  createdAt: string;
  updatedAt: string;
  refinements: number;
  drafts: number;
  error: string | null;
}

export async function listSessions(ownerId: string, limit = 60): Promise<SessionItem[]> {
  if (!hasDb()) return [];
  const { rows } = await db().query<{
    id: string; status: JobStatus; prompt: string | null; title: string | null; simulation_id: string | null;
    created_at: Date; updated_at: Date; refinements: number; drafts: number; error: string | null;
  }>(
    `SELECT j.id, j.status, j.request->>'prompt' AS prompt, s.title, s.id AS simulation_id, j.created_at, j.error,
       greatest(j.created_at, coalesce(s.updated_at, j.created_at)) AS updated_at,
       (SELECT count(*)::int FROM jobs r WHERE r.kind = 'refine' AND r.status = 'done'
          AND r.target_simulation_id = j.simulation_id) AS refinements,
       (SELECT count(*)::int FROM job_drafts d WHERE d.job_id = j.id) AS drafts
     FROM jobs j LEFT JOIN simulations s ON s.id = j.simulation_id AND s.owner_id = j.owner_id
     WHERE j.owner_id = $1 AND j.kind = 'generate'
       -- Симуляцию удалили из библиотеки — сессия без результата уходит вместе с ней.
       AND NOT (j.status = 'done' AND s.id IS NULL)
     ORDER BY updated_at DESC LIMIT $2`, [ownerId, limit]);
  return rows.map((r) => ({
    jobId: r.id, status: r.status, prompt: r.prompt ?? '', title: r.title, simulationId: r.simulation_id,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
    refinements: r.refinements, drafts: r.drafts, error: r.error,
  }));
}

export interface ThreadMessage { role: 'user' | 'bot'; text: string; at: string }

/** Переписка по симуляции: исходный запрос и все доработки по порядку. */
export async function simulationThread(ownerId: string, simulationId: string): Promise<ThreadMessage[]> {
  if (!hasDb() || !isUuid(simulationId)) return [];
  const { rows } = await db().query<{
    kind: string; status: JobStatus; prompt: string | null; instruction: string | null; error: string | null; created_at: Date;
  }>(
    `SELECT kind, status, request->>'prompt' AS prompt, request->>'instruction' AS instruction, error, created_at
     FROM jobs WHERE owner_id = $1 AND (simulation_id = $2 OR target_simulation_id = $2)
       AND status IN ('done', 'error', 'cancelled')
     ORDER BY created_at LIMIT 100`, [ownerId, simulationId]);
  const out: ThreadMessage[] = [];
  for (const r of rows) {
    const at = r.created_at.toISOString();
    const text = r.kind === 'refine' ? r.instruction : r.prompt;
    if (text) out.push({ role: 'user', text, at });
    out.push({ role: 'bot', at, text: r.status === 'done' ? (r.kind === 'refine' ? 'Готово, обновил.' : 'Симуляция готова.')
      : r.status === 'cancelled' ? (r.kind === 'refine' ? 'Доработка отменена.' : 'Полировка остановлена — оставлена версия с экрана.')
        : `Не получилось: ${r.error ?? 'ошибка'}` });
  }
  return out;
}
