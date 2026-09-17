import { embeddedWorkerEnabled } from './config';
import { bootWorker } from './boot';
import type { Worker } from './worker';

// next dev может загрузить модуль несколько раз; воркер на процесс нужен один.
const KEY = Symbol.for('tesseract.embeddedWorker');

function slot(): Record<symbol, Worker | undefined> {
  return globalThis as unknown as Record<symbol, Worker | undefined>;
}

export function startEmbeddedWorker(env: NodeJS.ProcessEnv = process.env): Worker | null {
  if (!embeddedWorkerEnabled(env)) return null;
  const g = slot();
  g[KEY] ??= bootWorker(env);
  return g[KEY]!;
}

export function __resetEmbeddedForTests(): void {
  delete slot()[KEY];
}
