import { chromium, type Browser } from 'playwright';
import type { RenderReport } from './types';

export type RenderFn = (html: string) => Promise<RenderReport>;

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close();
  }
}

export async function renderArtifact(
  html: string,
  { timeoutMs = 15000, shotTimes = [300, 1200, 3000] }: { timeoutMs?: number; shotTimes?: number[] } = {},
): Promise<RenderReport> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  const screenshots: Buffer[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.setContent(html, { timeout: timeoutMs, waitUntil: 'load' });
    let prev = 0;
    for (const t of shotTimes) {
      await page.waitForTimeout(t - prev);
      prev = t;
      screenshots.push(await page.screenshot({ timeout: timeoutMs }));
    }
  } catch (e) {
    errors.push('render timeout/navigation: ' + String(e));
  } finally {
    await page.close().catch(() => {});
  }
  const animated = screenshots.length >= 2 &&
    !screenshots[0].equals(screenshots[screenshots.length - 1]);
  return { ok: errors.length === 0 && screenshots.length > 0, errors, animated, screenshots };
}
