import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  // Одна демка/симуляция за раз рендерится сервером и делит один
  // SHOWMEHOW_DATA_DIR (./e2e/.data) между спеками — держим один воркер,
  // чтобы beforeAll-очистки данных из разных файлов не гонялись друг с другом.
  workers: 1,
  use: { baseURL: 'http://localhost:3300' },
  webServer: {
    command: 'npm run dev -- --port 3300',
    port: 3300,
    reuseExistingServer: false,
    env: { SHOWMEHOW_DATA_DIR: './e2e/.data' },
  },
});
