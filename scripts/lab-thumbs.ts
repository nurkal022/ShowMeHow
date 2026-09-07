import path from 'node:path';
import { chromium } from 'playwright';
import { LABS } from '../src/lib/labs';

/**
 * Снимает превью четырёх лабораторий для карточек раздела: public/labs/<slug>.png.
 * Нужен запущенный сервер (по умолчанию http://localhost:3000, иначе LABS_BASE_URL).
 * Запускать после правки сцен: npm run labs:thumbs
 */
async function main(): Promise<void> {
  const base = process.env.LABS_BASE_URL ?? 'http://localhost:3000';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const lab of LABS) {
      const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
      await page.goto(`${base}/lab/${lab.slug}`, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '.hud{display:none}' });
      await page.waitForTimeout(2500);
      const file = path.join(process.cwd(), 'public', 'labs', `${lab.slug}.png`);
      await page.screenshot({ path: file });
      console.log(`${lab.slug}: ${file}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
