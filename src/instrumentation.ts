/**
 * Next вызывает register() один раз при старте сервера. Встроенный воркер нужен
 * только в dev (см. embeddedWorkerEnabled). Модуль воркера тянет пайплайн и Playwright,
 * поэтому решение принимается до его импорта: веб-процесс без воркера его не загружает.
 * Импорты стоят внутри условия на NEXT_RUNTIME именно блоком: так Next вырезает их
 * из Edge-сборки, и она не тянет pg и Playwright (ранний return этого не даёт).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { embeddedWorkerEnabled } = await import('./lib/worker/config');
    if (embeddedWorkerEnabled()) {
      const { startEmbeddedWorker } = await import('./lib/worker/embedded');
      startEmbeddedWorker();
    }
  }
}
