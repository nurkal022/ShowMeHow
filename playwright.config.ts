import { defineConfig } from '@playwright/test';

// Отдельная база для e2e: спеки регистрируют людей и ставят задания в очередь,
// поэтому рабочую базу из .env.local сюда не подставляем никогда.
const E2E_DATABASE_URL = process.env.SHOWMEHOW_E2E_DATABASE_URL
  ?? 'postgres://showmehow:showmehow@localhost:5434/tesseract_e2e';

// Провайдер задаётся окружением: оно сильнее .env.local, и e2e никогда не ходит
// в настоящую модель. Адрес — мок из e2e/mock-provider.ts.
const MOCK_PROVIDER = {
  SHOWMEHOW_API_KEY: 'test',
  SHOWMEHOW_MODEL: 'mock-gen',
  SHOWMEHOW_VISION_MODEL: 'mock-vision',
  SHOWMEHOW_BASE_URL: 'http://localhost:3399/v1',
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  // Один воркер Playwright: спеки делят SHOWMEHOW_DATA_DIR и порт мок-провайдера.
  workers: 1,
  use: { baseURL: 'http://localhost:3300' },
  webServer: {
    // Сначала база: создать при отсутствии и накатить миграции, потом сервер.
    command: 'npx tsx e2e/prepare-db.ts && npm run dev -- --port 3300',
    port: 3300,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      SHOWMEHOW_DATA_DIR: './e2e/.data',
      SHOWMEHOW_EMBEDDED_WORKER: '1',
      ...MOCK_PROVIDER,
    },
  },
});
