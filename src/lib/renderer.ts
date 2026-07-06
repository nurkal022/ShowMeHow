import { chromium, type Browser } from 'playwright';
import type { RenderReport } from './types';

export type RenderFn = (html: string) => Promise<RenderReport>;

type Launcher = () => Promise<Browser>;

const defaultLauncher: Launcher = () => chromium.launch();
let launcher: Launcher = defaultLauncher;

/**
 * Test-only hook to inject a custom browser launcher (e.g. one that
 * rejects, to simulate a launch failure). Pass `null` to restore the
 * real `chromium.launch()`. No-op effect in production: never called.
 */
export function __setLauncherForTests(fn: Launcher | null): void {
  launcher = fn ?? defaultLauncher;
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launcher().catch((e) => {
      // Un-wedge the singleton: a failed launch must not permanently
      // poison future calls, so drop the cached rejected promise while
      // still propagating the failure to this caller.
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const b = await pending;
    await b.close();
  } catch {
    // Closing a browser that never launched (or is already broken)
    // should never throw.
  }
}

export async function renderArtifact(
  html: string,
  { timeoutMs = 15000, shotTimes = [300, 1200, 3000] }: { timeoutMs?: number; shotTimes?: number[] } = {},
): Promise<RenderReport> {
  let browser: Browser;
  let page: Awaited<ReturnType<Browser['newPage']>>;
  try {
    browser = await getBrowser();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  } catch (e) {
    return {
      ok: false,
      errors: ['browser launch/page failure: ' + String(e)],
      animated: false,
      screenshots: [],
    };
  }
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
