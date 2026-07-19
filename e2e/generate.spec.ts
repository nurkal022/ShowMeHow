import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { startMockProvider } from './mock-provider';

let stop: () => Promise<void>;

test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
  fs.writeFileSync('./e2e/.data/settings.json', JSON.stringify({
    activeProviderId: 'mock',
    qualityMode: 'fast',
    providers: [{ id: 'mock', name: 'mock', baseURL: 'http://localhost:3399/v1',
      apiKey: 'test', generationModel: 'mock-gen', visionModel: 'mock-vision' }],
  }));
  stop = await startMockProvider(3399);
});
test.afterAll(async () => { await stop(); });

test('generate simulation end-to-end', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Опишите симуляцию/).fill('диффузия духов в комнате');
  await page.getByLabel('Режим качества').selectOption('fast');
  await page.getByRole('button', { name: 'Создать' }).click();
  // прогресс виден: чип таймлайна «Планирование» либо заголовок карточки плана
  await expect(page.getByText('Планирование').or(page.getByText('Диффузия духов')))
    .toBeVisible({ timeout: 32_000 });
  // превью появилось
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('canvas')).toBeVisible({ timeout: 92_000 });
  // симуляция в библиотеке
  await page.goto('/library');
  await expect(page.getByText('Диффузия духов')).toBeVisible();
});
