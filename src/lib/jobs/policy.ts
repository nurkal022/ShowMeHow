import type { AuthUser } from '../auth/users';
import type { Membership } from '../org/types';
import { hasStaffRole, isPlatformAdmin } from '../org/policy';

/** Приоритет учителя и администрации: их генерация идёт раньше пробных. */
export const HIGH_PRIORITY = 10;

/** Сколько раз задание может начаться. Вторая потеря воркера — ошибка. */
export const MAX_ATTEMPTS = 2;

/**
 * Внутри одного приоритета очередь идёт по времени создания. Роль берётся по
 * любому членству: учитель в одной школе остаётся учителем, даже если в другой он ученик.
 */
export function jobPriority(user: Pick<AuthUser, 'role'>, memberships: Membership[]): number {
  return isPlatformAdmin(user) || hasStaffRole(memberships) ? HIGH_PRIORITY : 0;
}

export type ReapDecision = 'requeue' | 'fail' | 'cancel' | 'done';

/**
 * Что делать с заданием, чей воркер перестал продлевать аренду. Симуляция уже
 * сохранена — результат есть, задание завершается успехом при любом числе попыток
 * и даже при просьбе об отмене: симуляция уже лежит в истории. Отмену человек
 * попросил — перезапускать нечего. Иначе одна повторная попытка.
 */
export function reapDecision(
  job: { attempts: number; cancelRequested: boolean; simulationId: string | null },
): ReapDecision {
  if (job.simulationId !== null) return 'done';
  if (job.cancelRequested) return 'cancel';
  return job.attempts < MAX_ATTEMPTS ? 'requeue' : 'fail';
}

/**
 * Нужно ли выполнять задание. Воркер записывает simulation_id сразу после сохранения,
 * поэтому повторная попытка после потери видит его и не создаёт вторую симуляцию.
 */
export function needsRun(job: { simulationId: string | null }): boolean {
  return job.simulationId === null;
}

/** Очередь стоит, а брать её некому, — это авария, даже если база отвечает. */
export function healthCode(stats: { queued: number; workersAlive: number }): 200 | 503 {
  return stats.queued > 0 && stats.workersAlive === 0 ? 503 : 200;
}
