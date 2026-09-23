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

export interface ThreadMessage {
  role: 'user' | 'bot';
  text: string;
  at: string;
  /** Разбор доработки, если модель его прислала: что изменено, чего не стала, что дальше. */
  changed?: string[];
  skipped?: string[];
  next?: string[];
}

/** Переписка по симуляции: исходный запрос и все доработки по порядку. */
export async function simulationThread(ownerId: string, simulationId: string): Promise<ThreadMessage[]> {
  if (!hasDb() || !isUuid(simulationId)) return [];
  const { rows } = await db().query<{
    kind: string; status: JobStatus; prompt: string | null; instruction: string | null;
    error: string | null; created_at: Date; note: RefineNote | null;
  }>(
    `SELECT j.kind, j.status, j.request->>'prompt' AS prompt, j.request->>'instruction' AS instruction,
       j.error, j.created_at,
       -- Отчёт о правке лежит в журнале задания: отдельного места для него не заводили,
       -- журнал и так переживает перезагрузку страницы и рестарт веба.
       (SELECT e.event FROM job_events e
        WHERE e.job_id = j.id AND e.event->>'type' = 'note' ORDER BY e.seq DESC LIMIT 1) AS note
     FROM jobs j
     WHERE j.owner_id = $1 AND (j.simulation_id = $2 OR j.target_simulation_id = $2)
       AND j.status IN ('done', 'error', 'cancelled')
     ORDER BY j.created_at LIMIT 100`, [ownerId, simulationId]);
  const out: ThreadMessage[] = [];
  for (const r of rows) {
    const at = r.created_at.toISOString();
    const text = r.kind === 'refine' ? r.instruction : r.prompt;
    if (text) out.push({ role: 'user', text, at });
    if (r.status === 'done' && r.note) { out.push(noteMessage(r.note, at)); continue; }
    out.push({ role: 'bot', at, text: r.status === 'done' ? (r.kind === 'refine' ? 'Готово, обновил.' : 'Симуляция готова.')
      : r.status === 'cancelled' ? (r.kind === 'refine' ? 'Доработка отменена.' : 'Полировка остановлена — оставлена версия с экрана.')
        : `Не получилось: ${r.error ?? 'ошибка'}` });
  }
  return out;
}

interface RefineNote { summary?: unknown; changed?: unknown; skipped?: unknown; next?: unknown }

function noteList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

function noteMessage(note: RefineNote, at: string): ThreadMessage {
  return {
    role: 'bot', at,
    text: typeof note.summary === 'string' && note.summary ? note.summary : 'Готово, обновил.',
    changed: noteList(note.changed), skipped: noteList(note.skipped), next: noteList(note.next),
  };
}

/**
 * Прошлые просьбы по симуляции — контекст для уточняющего вопроса: то, что уже
 * обсуждалось, переспрашивать незачем.
 */
export async function pastInstructions(ownerId: string, simulationId: string, limit = 5): Promise<string[]> {
  if (!hasDb() || !isUuid(simulationId)) return [];
  const { rows } = await db().query<{ instruction: string }>(
    `SELECT request->>'instruction' AS instruction FROM jobs
     WHERE owner_id = $1 AND target_simulation_id = $2 AND kind = 'refine' AND status = 'done'
       AND request->>'instruction' IS NOT NULL
     ORDER BY created_at DESC LIMIT $3`, [ownerId, simulationId, limit]);
  return rows.map((r) => r.instruction).reverse();
}
