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
