import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../settings';
import type { PlanSpec } from '../types';

/**
 * Точки продолжения генерации. Воркер может пропасть посреди задания (рестарт при
 * выкладке, OOM), и повторная попытка раньше начинала с нуля — ещё раз план, ядро и
 * основа, то есть минуты работы модели. Теперь после каждого дорогого этапа результат
 * ложится сюда, и повтор продолжает с последнего сохранённого.
 *
 * Хранится рядом с данными, а не в базе: это временный файл одного задания, он
 * удаляется, как только задание получило исход.
 */

export interface Checkpoint {
  spec?: PlanSpec;
  core?: string;
  /** Рабочая основа со всеми слоями — дальше только суд и доводка. */
  built?: string;
}

function file(jobId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error('invalid job id');
  return path.join(dataDir(), 'checkpoints', `${jobId}.json`);
}

export function loadCheckpoint(jobId: string): Checkpoint | null {
  try {
    return JSON.parse(fs.readFileSync(file(jobId), 'utf8')) as Checkpoint;
  } catch {
    return null;
  }
}

/** Дописывает поля к уже сохранённым. Сбой записи не валит генерацию — это страховка. */
export function saveCheckpoint(jobId: string, patch: Checkpoint): void {
  try {
    const next = { ...(loadCheckpoint(jobId) ?? {}), ...patch };
    const f = file(jobId);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next));
    fs.renameSync(tmp, f);
  } catch { /* см. выше */ }
}

export function clearCheckpoint(jobId: string): void {
  try { fs.rmSync(file(jobId), { force: true }); } catch { /* нечего чистить */ }
}
