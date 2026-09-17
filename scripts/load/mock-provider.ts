import { startMockProvider } from '../../e2e/mock-provider';

// Мок модели для нагрузочного прогона: генератор отвечает медленно, чтобы генерации
// успели выстроиться в очередь и их можно было прервать посередине.
const port = Number(process.env.MOCK_PORT ?? 3399);
const delay = Number(process.env.MOCK_GENERATOR_DELAY_MS ?? 20000);
await startMockProvider(port, { generatorDelayMs: delay });
console.log(`Мок-провайдер слушает :${port}, задержка генератора ${delay} мс.`);
