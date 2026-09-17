import fs from 'node:fs';

/**
 * Точка входа службы teseract-worker. Запуск: `npm run worker` локально,
 * `node --import tsx scripts/worker.ts` в systemd и Docker — так SIGTERM приходит
 * прямо в этот процесс.
 */
async function main(): Promise<void> {
  // Служба получает переменные из EnvironmentFile; локально удобнее прочитать .env.local.
  if (fs.existsSync('.env.local') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env.local');
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан: воркеру нужна база данных.');
    process.exit(1);
  }
  const { bootWorker, shutdownWorker } = await import('../src/lib/worker/boot');
  const { closeListener } = await import('../src/lib/jobs/listener');
  const { closeDb } = await import('../src/lib/db/client');

  const worker = bootWorker();
  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(`Получен ${signal}: новые задания не берём, доделываем текущие.`);
    shutdownWorker(worker)
      .then(() => Promise.all([closeListener(), closeDb()]))
      .then(() => process.exit(0), (e) => {
        console.error('Воркер остановился с ошибкой:', e);
        process.exit(1);
      });
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

main().catch((e) => {
  console.error('Воркер не запустился:', e);
  process.exit(1);
});
