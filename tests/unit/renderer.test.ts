import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderArtifact, closeBrowser, __setLauncherForTests } from '@/lib/renderer';

const fx = (n: string) =>
  fs.readFileSync(path.join(process.cwd(), 'tests/fixtures', n), 'utf8');

describe('renderArtifact', () => {
  afterAll(() => closeBrowser());

  it('ok artifact: no errors, animated, screenshots taken', async () => {
    const r = await renderArtifact(fx('ok.html'), { shotTimes: [200, 700] });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.animated).toBe(true);
    expect(r.screenshots).toHaveLength(2);
  });

  it('broken artifact: reports js error', async () => {
    const r = await renderArtifact(fx('broken.html'), { shotTimes: [200] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/undefinedFunction/);
  });

  it('hanging artifact: times out and reports error', async () => {
    const r = await renderArtifact(fx('hang.html'), { timeoutMs: 3000, shotTimes: [200] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/timeout|Timeout/);
  }, 20000);

  it('closeBrowser is idempotent: calling it twice in a row resolves without error', async () => {
    await renderArtifact(fx('ok.html'), { shotTimes: [200] });
    await expect(closeBrowser()).resolves.toBeUndefined();
    await expect(closeBrowser()).resolves.toBeUndefined();
  });

  it('resolves ok:false (never rejects) when the browser fails to launch, and un-wedges the singleton for the next call', async () => {
    __setLauncherForTests(() => Promise.reject(new Error('simulated launch failure')));
    try {
      const r = await renderArtifact(fx('ok.html'), { shotTimes: [200] });
      expect(r.ok).toBe(false);
      expect(r.animated).toBe(false);
      expect(r.screenshots).toEqual([]);
      expect(r.errors.join(' ')).toMatch(/browser launch\/page failure/);
      expect(r.errors.join(' ')).toMatch(/simulated launch failure/);
    } finally {
      __setLauncherForTests(null);
    }

    // Singleton must not be permanently wedged: a subsequent call with
    // the real launcher restored should succeed.
    const r2 = await renderArtifact(fx('ok.html'), { shotTimes: [200] });
    expect(r2.ok).toBe(true);
  }, 30000);

  it('self-heals when the cached browser disconnects: next renderArtifact re-launches', async () => {
    let launchCount = 0;
    let disconnectedCb: (() => void) | undefined;

    function fakePage() {
      return {
        on: () => {},
        setContent: async () => {},
        waitForTimeout: async () => {},
        screenshot: async () => Buffer.from([launchCount]),
        close: async () => {},
      };
    }
    function fakeBrowser() {
      return {
        on: (event: string, cb: () => void) => {
          if (event === 'disconnected') disconnectedCb = cb;
        },
        newPage: async () => fakePage(),
        close: async () => {},
      };
    }

    // Drop any browser cached by earlier tests so the fake launcher below
    // is actually exercised on the next getBrowser() call.
    await closeBrowser();
    __setLauncherForTests(async () => {
      launchCount++;
      return fakeBrowser() as never;
    });
    try {
      const r1 = await renderArtifact('<html></html>', { shotTimes: [10] });
      expect(r1.ok).toBe(true);
      expect(launchCount).toBe(1);

      // A second render before any disconnect must reuse the cached browser.
      await renderArtifact('<html></html>', { shotTimes: [10] });
      expect(launchCount).toBe(1);

      // Simulate the browser process dying.
      expect(disconnectedCb).toBeTypeOf('function');
      disconnectedCb!();

      // Next render must self-heal by launching a fresh browser.
      const r3 = await renderArtifact('<html></html>', { shotTimes: [10] });
      expect(r3.ok).toBe(true);
      expect(launchCount).toBe(2);
    } finally {
      __setLauncherForTests(null);
      await closeBrowser();
    }
  });

  it('ignores a stale disconnected handler: browser A\'s late event must not evict cached browser B', async () => {
    let launchCount = 0;
    const disconnectedCbs: Array<() => void> = [];

    function fakePage() {
      return {
        on: () => {},
        setContent: async () => {},
        waitForTimeout: async () => {},
        screenshot: async () => Buffer.from([launchCount]),
        close: async () => {},
      };
    }
    function fakeBrowser() {
      return {
        on: (event: string, cb: () => void) => {
          if (event === 'disconnected') disconnectedCbs.push(cb);
        },
        newPage: async () => fakePage(),
        close: async () => {},
      };
    }

    await closeBrowser();
    __setLauncherForTests(async () => {
      launchCount++;
      return fakeBrowser() as never;
    });
    try {
      // Launch browser A.
      await renderArtifact('<html></html>', { shotTimes: [10] });
      expect(launchCount).toBe(1);
      expect(disconnectedCbs).toHaveLength(1);
      const cbA = disconnectedCbs[0];

      // closeBrowser() nulls the cache; the next render launches browser B.
      await closeBrowser();
      await renderArtifact('<html></html>', { shotTimes: [10] });
      expect(launchCount).toBe(2);

      // A real chromium would now fire A's 'disconnected' (close() -> event,
      // possibly delayed). That stale handler must NOT evict the cache entry
      // that already points at B.
      cbA();

      const r = await renderArtifact('<html></html>', { shotTimes: [10] });
      expect(r.ok).toBe(true);
      expect(launchCount).toBe(2); // still B — no spurious relaunch

      // Sanity: B's own handler still self-heals.
      expect(disconnectedCbs).toHaveLength(2);
      disconnectedCbs[1]();
      await renderArtifact('<html></html>', { shotTimes: [10] });
      expect(launchCount).toBe(3);
    } finally {
      __setLauncherForTests(null);
      await closeBrowser();
    }
  });
});
