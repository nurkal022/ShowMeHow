import { chromium, type Browser, type ConsoleMessage, type Page } from 'playwright';
import type { RenderReport } from './types';
import { allowedPrefixes } from './cdn';
import { runProbes, type ProbeReport } from './pipeline/probes';

export type RenderFn = (
  html: string,
  opts?: { timeoutMs?: number; shotTimes?: number[]; probes?: boolean },
) => Promise<RenderReport>;

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

type PageHook = (page: Page) => Promise<void>;
let pageHook: PageHook | null = null;

/**
 * Test-only hook: runs on the freshly created page right after the network
 * whitelist route is installed (so a route registered here takes precedence)
 * and before setContent. Used to simulate a CDN outage without touching the
 * network. Pass `null` to clear. No-op effect in production: never called.
 */
export function __setPageHookForTests(fn: PageHook | null): void {
  pageHook = fn;
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // `p` is the exact promise stored in the singleton for THIS launch.
    // Both cleanup paths below compare against it, so a stale event from an
    // old browser (e.g. `disconnected` firing late after closeBrowser()
    // already let a new launch populate the cache) can never evict a newer,
    // healthy browser.
    const p: Promise<Browser> = launcher()
      .then((browser) => {
        // Self-heal: if the browser process dies later (crash, OOM-killed,
        // manually closed), drop the cached promise so the next render
        // launches a fresh browser instead of reusing a dead one forever.
        browser.on('disconnected', () => {
          if (browserPromise === p) browserPromise = null;
        });
        return browser;
      })
      .catch((e) => {
        // Un-wedge the singleton: a failed launch must not permanently
        // poison future calls, so drop the cached rejected promise while
        // still propagating the failure to this caller.
        if (browserPromise === p) browserPromise = null;
        throw e;
      });
    browserPromise = p;
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

export interface RenderSession {
  shot(): Promise<Buffer>;
  /** Выражение исполняется в контексте страницы; результат должен быть сериализуем. */
  evaluate<T = unknown>(expression: string): Promise<T>;
  /** false, если элемент не найден или клик не удался. */
  click(selector: string): Promise<boolean>;
  wait(ms: number): Promise<void>;
  errors(): string[];
  blockedUrls(): string[];
  /** true, если начальный setContent() завершился без ошибки (страница загрузилась). */
  loaded(): boolean;
  close(): Promise<void>;
}

export interface SessionOpts {
  timeoutMs?: number;
  viewport?: { width: number; height: number };
}

export async function openSession(
  html: string,
  { timeoutMs = 15000, viewport = { width: 1280, height: 800 } }: SessionOpts = {},
): Promise<RenderSession> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  // Set сохраняет порядок первого появления и естественно схлопывает повторы:
  // страница с ретраями на запрещённый хост не должна раздувать errors().
  const blockedSet = new Set<string>();
  // Сеть вне whitelist режется на уровне браузера: regex-скан по исходнику
  // ловит не всё (например, URL, собранный из строк в рантайме).
  const prefixes = allowedPrefixes();

  // Chromium пишет неудавшуюся загрузку подресурса в консоль как error
  // («Failed to load resource: net::ERR_FAILED»). Для разрешённого CDN это не
  // ошибка кандидата: кит переживает недоступный KaTeX (js.onerror → текстовая
  // формула), а вот пайплайн раньше объявлял такого кандидата сломанным и гонял
  // фиксера за несуществующим багом при любом сбое jsdelivr. Запрещённые хосты
  // сюда не попадают — они отдельно и намеренно репортятся через blockedUrls().
  const isAllowedResourceFailure = (m: ConsoleMessage): boolean => {
    if (!/^Failed to load resource/i.test(m.text())) return false;
    const url = m.location()?.url ?? '';
    return prefixes.some((p) => url.startsWith(p));
  };

  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isAllowedResourceFailure(m)) errors.push(m.text());
  });

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!/^https?:\/\//i.test(url) || prefixes.some((p) => url.startsWith(p))) {
      route.continue().catch(() => {});
      return;
    }
    blockedSet.add(url);
    route.abort().catch(() => {});
  });
  if (pageHook) await pageHook(page);

  let loaded = true;
  try {
    await page.setContent(html, { timeout: timeoutMs, waitUntil: 'load' });
  } catch (e) {
    loaded = false;
    errors.push('render timeout/navigation: ' + String(e));
  }

  return {
    shot: () => page.screenshot({ timeout: timeoutMs }),
    evaluate: <T>(expression: string) => page.evaluate(expression) as Promise<T>,
    click: async (selector) => {
      try {
        await page.click(selector, { timeout: 2000 });
        return true;
      } catch {
        return false;
      }
    },
    wait: (ms) => page.waitForTimeout(ms),
    errors: () => errors,
    blockedUrls: () => [...blockedSet],
    loaded: () => loaded,
    close: async () => { await page.close().catch(() => {}); },
  };
}

export async function renderArtifact(
  html: string,
  { timeoutMs = 15000, shotTimes = [300, 1200, 3000], probes = false }:
    { timeoutMs?: number; shotTimes?: number[]; probes?: boolean } = {},
): Promise<RenderReport> {
  let session: RenderSession;
  try {
    session = await openSession(html, { timeoutMs });
  } catch (e) {
    return {
      ok: false,
      errors: ['browser launch/page failure: ' + String(e)],
      animated: false,
      screenshots: [],
    };
  }
  const screenshots: Buffer[] = [];
  // Если начальная загрузка не завершилась (setContent бросил/протух по
  // таймауту), скриншоты не снимаем: страница в неопределённом состоянии,
  // и любой «кадр» может ложно выглядеть анимированным.
  if (session.loaded()) {
    try {
      let prev = 0;
      for (const t of shotTimes) {
        await session.wait(t - prev);
        prev = t;
        screenshots.push(await session.shot());
      }
    } catch (e) {
      session.errors().push('screenshot failure: ' + String(e));
    }
  }
  // animated считаем по кадрам таймлапса: пробы ставят симуляцию на паузу и
  // двигают слайдер в крайнее положение, так что снятый ими кадр — не
  // «t≈3с работающей симуляции», а статичная картинка на паузе со сдвинутым
  // параметром.
  const animated = screenshots.length >= 2 &&
    !screenshots[0].equals(screenshots[screenshots.length - 1]);
  // Пробы гоняем только на реально загрузившейся странице: если setContent
  // бросил, страница в неопределённом состоянии — каждая проба провалится
  // по той же причине, что уже видна в errors(), и завалит фиксера кучей
  // вводящих в заблуждение фраз поверх настоящей ошибки загрузки.
  let probeReport: ProbeReport | undefined;
  if (probes && session.loaded()) {
    try {
      probeReport = await runProbes(session);
      // Кадры проб (пауза, слайдер в крайнем положении) НЕ подмешиваем в
      // screenshots: это артефакты измерения, а не кадры симуляции. Раньше их
      // видел критик — и сообщал «симуляция замерла» или «параметр вне
      // физичного диапазона» про сцену, которую сам же измерительный прогон и
      // сделал такой, после чего рефайнер правил рабочий код. Кому нужны эти
      // кадры — берёт их из report.probes.shots.
    } catch (e) {
      session.errors().push('probe failure: ' + String(e));
    }
  }
  const errors = [...session.errors()];
  for (const url of session.blockedUrls()) {
    errors.push('Заблокирован запрос вне whitelist: ' + url);
  }
  await session.close();
  return {
    ok: errors.length === 0 && screenshots.length > 0,
    errors, animated, screenshots, probes: probeReport,
  };
}
