import { getJobStore } from '../jobs/current';
import { purgeOldAttempts } from '../auth/rate-limit';
import { closeBrowser } from '../renderer';
import { createWorker, type Worker } from './worker';
import { executeJob } from './execute';
import { drainSeconds, workerConcurrency } from './config';

export function bootWorker(env: NodeJS.ProcessEnv = process.env): Worker {
  const concurrency = workerConcurrency(env);
  const worker = createWorker({
    store: getJobStore(),
    execute: executeJob,
    concurrency,
    drainMs: drainSeconds(env) * 1000,
    // Уборщик воркера заодно чистит старые попытки входа: отдельного планировщика нет.
    onReap: async () => { await purgeOldAttempts(); },
  });
  worker.start();
  console.log(`Воркер ${worker.id} запущен, слотов: ${concurrency}.`);
  return worker;
}

export async function shutdownWorker(worker: Worker): Promise<void> {
  const { drained } = await worker.stop();
  console.log(drained
    ? `Воркер ${worker.id} остановлен: все задания доделаны.`
    : `Воркер ${worker.id} остановлен по таймауту: недоделанные задания подберёт уборщик.`);
  await closeBrowser();
}
