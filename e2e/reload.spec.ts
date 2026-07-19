import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { startMockProvider } from './mock-provider';

// Собственный самодостаточный набор: своя очистка данных/настроек и свой инстанс
// мок-провайдера на том же порту 3399, что и generate.spec.ts — playwright.config
// держит workers:1, так что спек-файлы гарантированно не пересекаются по времени
// и делёж порта/./e2e/.data безопасен.
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

// Порядок важен: «cancel» идёт первым, пока библиотека пуста (её проверка требует
// нулевого числа симуляций); «reload» идёт вторым и добавляет одну симуляцию —
// после него на пустоту библиотеку уже не проверяем.

test('cancel: отмена во время генерации не сохраняет симуляцию', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Опишите симуляцию/).fill('диффузия духов в комнате');
  await page.getByLabel('Режим качества').selectOption('fast');
  await page.getByRole('button', { name: 'Создать' }).click();

  const cancelBtn = page.getByRole('button', { name: /Отменить/ });
  await expect(cancelBtn).toBeVisible({ timeout: 32_000 });
  await cancelBtn.click();

  await expect(page.getByText('Генерация отменена')).toBeVisible({ timeout: 10_000 });

  await page.goto('/library');
  await expect(page.getByText(/Пока пусто/)).toBeVisible();
});

test('reload: генерация переживает перезагрузку страницы', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Опишите симуляцию/).fill('диффузия духов в комнате');
  await page.getByLabel('Режим качества').selectOption('fast');
  await page.getByRole('button', { name: 'Создать' }).click();

  // Дожидаемся первого сигнала прогресса (чип таймлайна либо заголовок карточки плана)
  // и сразу перезагружаем страницу — job должен пережить это благодаря localStorage +
  // реконнекту к SSE-стриму с реплеем прошлых событий.
  await expect(page.getByText('Планирование').or(page.getByText('Диффузия духов')))
    .toBeVisible({ timeout: 32_000 });
  await page.reload();

  // Прогресс восстановлен после реплея.
  await expect(page.getByText('Планирование').or(page.getByText('Диффузия духов')))
    .toBeVisible({ timeout: 32_000 });

  // Превью появилось.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('canvas')).toBeVisible({ timeout: 92_000 });

  // Симуляция в библиотеке.
  await page.goto('/library');
  await expect(page.getByText('Диффузия духов')).toBeVisible();
});
