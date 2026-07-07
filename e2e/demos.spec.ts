import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Самодостаточная спека: сама чистит и пересоздаёт ./e2e/.data, не полагаясь
// на порядок выполнения относительно generate.spec.ts (специи выполняются
// последовательно в одном воркере — см. playwright.config.ts: workers: 1).
test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
});

test('install 10 bundled demos from the empty library', async ({ page }) => {
  await page.goto('/library');

  const installButton = page.getByRole('button', { name: 'Установить 10 примеров' });
  await expect(installButton).toBeVisible();

  await installButton.click();

  // Рендер 10 thumbnails на сервере (headless Playwright) занимает время —
  // ждём появления карточек с щедрым таймаутом.
  await expect(page.getByText('Диффузия духов в комнате')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText('Математический маятник')).toBeVisible();
  await expect(page.getByText('Осмос через полупроницаемую мембрану')).toBeVisible();

  await expect(page.locator('.card')).toHaveCount(10);

  // Библиотека больше не пуста — блок с кнопкой установки должен исчезнуть.
  await expect(installButton).toHaveCount(0);
});
