import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:3300' },
  webServer: {
    command: 'npm run dev -- --port 3300',
    port: 3300,
    reuseExistingServer: false,
    env: { SHOWMEHOW_DATA_DIR: './e2e/.data' },
  },
});
