import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { signUp } from './auth';
import { startMockProvider } from './mock-provider';
import { startGeneration } from './workbench';

// Свой мок-провайдер на том же порту 3399, что и generate.spec.ts: playwright.config
// держит workers: 1, так что спек-файлы не пересекаются по времени.
let stop: () => Promise<void>;

test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
  // Генератор отвечает долго: отмена должна успеть дойти до воркера через сердцебиение.
  stop = await startMockProvider(3399, { generatorDelayMs: 20_000 });
});
test.afterAll(async () => { await stop(); });

test.beforeEach(async ({ page }) => { await signUp(page, 'reload'); });

const progress = (page: import('@playwright/test').Page) =>
  page.getByText('Планирование').or(page.getByText('Диффузия духов')).first();

test('cancel: отмена во время генерации не сохраняет симуляцию', async ({ page }) => {
  await startGeneration(page, 'диффузия духов в комнате');

  const cancelBtn = page.getByRole('button', { name: /Отменить/ });
  await expect(cancelBtn).toBeVisible({ timeout: 32_000 });
  await cancelBtn.click();

  await expect(page.getByText('Генерация отменена')).toBeVisible({ timeout: 45_000 });

  await page.goto('/library');
  // Примеры раскладываются при первом входе; своей симуляции среди них быть не должно.
  await expect(page.locator('.sim-card:not(.skeleton)')).toHaveCount(10, { timeout: 240_000 });
  await expect(page.getByText('Диффузия духов', { exact: true })).toHaveCount(0);
});

test('reload: генерация переживает перезагрузку страницы', async ({ page }) => {
  await startGeneration(page, 'диффузия духов в комнате');

  // Дожидаемся первого сигнала прогресса и сразу перезагружаем страницу: задание
  // должно пережить это благодаря localStorage и переподключению к потоку событий.
  await expect(progress(page)).toBeVisible({ timeout: 32_000 });
  await page.reload();

  // Прогресс восстановлен после реплея.
  await expect(progress(page)).toBeVisible({ timeout: 32_000 });

  // Превью появилось.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('canvas')).toBeVisible({ timeout: 120_000 });

  // Симуляция в библиотеке.
  await page.goto('/library');
  await expect(page.getByText('Диффузия духов', { exact: true })).toBeVisible({ timeout: 240_000 });
});
