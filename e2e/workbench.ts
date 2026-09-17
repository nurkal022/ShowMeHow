import type { Page } from '@playwright/test';

/**
 * Запускает генерацию с главной: страница открывается на стенде-конструкторе,
 * поэтому сначала переходим к полю текста, затем выбираем режим «Быстро».
 */
export async function startGeneration(page: Page, prompt: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть как текст' }).click();
  await page.getByLabel('Описание симуляции').fill(prompt);
  await page.getByRole('button', { name: 'Настройки генерации' }).click();
  const settings = page.getByRole('dialog', { name: 'Настройки генерации' });
  await settings.getByRole('button', { name: 'Быстро' }).click();
  await settings.getByRole('button', { name: 'Готово' }).click();
  await page.getByRole('button', { name: 'Отправить' }).click();
}
