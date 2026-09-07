import { test, expect } from '@playwright/test';

// Сцены лабораторий открыты без входа: их открывают в VR-очках, где пароль вводить
// мучительно. Проверяем, что каждая страница рисует canvas и не падает.
const STATIONS: Record<string, number> = { biology: 2, physics: 2, chemistry: 2, informatics: 3 };
for (const [slug, stations] of Object.entries(STATIONS)) {
  test(`лаборатория ${slug} открывается без входа и рисует сцену`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/lab/${slug}`);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.hud-title')).toBeVisible();
    await expect(page.locator('.hud-stations button')).toHaveCount(stations);
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
}

test('список лабораторий закрыт для гостя', async ({ page }) => {
  await page.goto('/labs');
  await expect(page).toHaveURL(/\/login/);
});

test('в разделе четыре карточки, а «Создать лабораторию» отвечает «Скоро»', async ({ page }) => {
  await page.request.post('/api/auth/register',
    { data: { email: `labs-${Date.now()}@example.com`, password: 'labs-demo-pass-123' } });
  await page.goto('/labs');
  await expect(page.locator('.lab-card')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Внутри клетки' })).toBeVisible();

  await page.getByRole('button', { name: 'Создать лабораторию' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Скоро');
  await expect(dialog).toContainText('в работе');
  await dialog.getByRole('button', { name: 'Понятно' }).click();
  await expect(dialog).toHaveCount(0);
});
