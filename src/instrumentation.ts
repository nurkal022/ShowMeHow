/**
 * Next вызывает register() один раз при старте сервера. Встроенный воркер нужен
 * только в dev (см. embeddedWorkerEnabled); импорт внутри условия не даёт
 * Edge-сборке тянуть pg и Playwright.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmbeddedWorker } = await import('./lib/worker/embedded');
    startEmbeddedWorker();
  }
}
