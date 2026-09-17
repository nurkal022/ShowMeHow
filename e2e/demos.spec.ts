import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { signUp } from './auth';

test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
});

test('новый человек получает десять встроенных примеров', async ({ page }) => {
  await signUp(page, 'demos');
  await page.goto('/library');
  // Превью рендерятся на сервере при первом заходе — ждём с запасом.
  // Заглушки загрузки тоже носят класс sim-card, их не считаем.
  await expect(page.locator('.sim-card:not(.skeleton)')).toHaveCount(10, { timeout: 240_000 });
  await expect(page.getByText('Диффузия духов в комнате')).toBeVisible();
  await expect(page.getByText('Математический маятник')).toBeVisible();
  await expect(page.getByText('Осмос через полупроницаемую мембрану')).toBeVisible();
});
