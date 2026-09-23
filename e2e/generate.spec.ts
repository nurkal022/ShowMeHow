import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { signUp } from './auth';
import { startMockProvider } from './mock-provider';
import { startGeneration } from './workbench';

let stop: () => Promise<void>;

test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
  stop = await startMockProvider(3399);
});
test.afterAll(async () => { await stop(); });

test('generate simulation end-to-end', async ({ page }) => {
  await signUp(page, 'gen');
  await startGeneration(page, 'диффузия духов в комнате');
  // прогресс виден: чип таймлайна «Планирование» либо заголовок карточки плана
  await expect(page.getByText('Планирование').or(page.getByText('Диффузия духов')).first())
    .toBeVisible({ timeout: 32_000 });
  // превью появилось
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('canvas')).toBeVisible({ timeout: 92_000 });
  // Холст виден уже на первом черновике — задание ещё идёт. В библиотеку — только после «Готово».
  await expect(page.getByText(/Готово\. Симуляция справа/)).toBeVisible({ timeout: 92_000 });
  // симуляция в библиотеке; встроенный пример называется «Диффузия духов в комнате»,
  // поэтому своё название ищем точным совпадением
  await page.goto('/library');
  await expect(page.getByText('Диффузия духов', { exact: true })).toBeVisible({ timeout: 240_000 });
});
