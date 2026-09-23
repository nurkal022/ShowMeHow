import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { signUp } from './auth';
import { startMockProvider } from './mock-provider';

let stop: () => Promise<void>;

test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
  stop = await startMockProvider(3399);
});
test.afterAll(async () => { await stop(); });

/**
 * «Стандарт»: сначала карточка плана. Человек правит её до генерации, а собранный
 * тренажёр получает план целиком — с ядром физики и проверками, как в воркере.
 */
test('план перед генерацией: карточка, правка, сборка', async ({ page }) => {
  await signUp(page, 'plan');
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть как текст' }).click();
  await page.getByLabel('Описание симуляции').fill('диффузия духов в комнате');
  await page.getByRole('button', { name: 'Отправить' }).click();

  const card = page.locator('.plan-editor');
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByLabel('Название')).toHaveValue('Диффузия духов');
  // Правка руками: название и уровень.
  await card.getByLabel('Название').fill('Диффузия: опыт');
  await card.getByRole('radio', { name: /Демонстрация/ }).click();
  await card.getByRole('button', { name: 'Собрать тренажёр' }).click();

  await expect(card).toHaveCount(0);
  await expect(page.getByText('Ядро физики').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Готово\. Симуляция справа/)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole('button', { name: /Проверка/ })).toBeVisible();

  await page.goto('/library');
  await expect(page.getByText('Диффузия: опыт', { exact: true })).toBeVisible({ timeout: 60_000 });
});
