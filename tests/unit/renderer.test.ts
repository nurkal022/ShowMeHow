import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderArtifact, closeBrowser, __setLauncherForTests, openSession } from '@/lib/renderer';

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
        route: async () => {},
        setContent: async () => {},
        waitForTimeout: async () => {},
        screenshot: async () => Buffer.from([launchCount]),
        click: async () => {},
        evaluate: async () => null,
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
        route: async () => {},
        setContent: async () => {},
        waitForTimeout: async () => {},
        screenshot: async () => Buffer.from([launchCount]),
        click: async () => {},
        evaluate: async () => null,
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

  it('пропускает скриншоты и не считает анимацией, если исходная загрузка упала (loaded()===false)', async () => {
    // Регрессия: до фикса session.loaded() не проверялась, и renderArtifact
    // всё равно снимал скриншоты даже после проваленного setContent — на
    // фейковом браузере screenshot() ничем не блокируется, так что это
    // ловится независимо от того, блокирует ли страница ещё и screenshot().
    let shotCalls = 0;

    function fakePage() {
      return {
        on: () => {},
        route: async () => {},
        setContent: async () => { throw new Error('boom: setContent failed'); },
        waitForTimeout: async () => {},
        screenshot: async () => { shotCalls++; return Buffer.from([shotCalls]); },
        click: async () => {},
        evaluate: async () => null,
        close: async () => {},
      };
    }
    function fakeBrowser() {
      return {
        on: () => {},
        newPage: async () => fakePage(),
        close: async () => {},
      };
    }

    await closeBrowser();
    __setLauncherForTests(async () => fakeBrowser() as never);
    try {
      const r = await renderArtifact('<html></html>', { shotTimes: [10, 20] });
      expect(r.ok).toBe(false);
      expect(r.screenshots).toEqual([]);
      expect(r.animated).toBe(false);
      expect(shotCalls).toBe(0);
    } finally {
      __setLauncherForTests(null);
      await closeBrowser();
    }
  });
});

describe('openSession', () => {
  afterAll(() => closeBrowser());

  it('даёт кадры, evaluate и клик по селектору', async () => {
    const s = await openSession(
      '<html><body><button id="b" onclick="window.__n=(window.__n||0)+1">x</button></body></html>',
    );
    try {
      expect((await s.shot()).length).toBeGreaterThan(0);
      expect(await s.click('#b')).toBe(true);
      expect(await s.evaluate<number>('window.__n')).toBe(1);
      expect(await s.click('#missing')).toBe(false);
      expect(s.errors()).toEqual([]);
    } finally {
      await s.close();
    }
  }, 30000);

  it('блокирует запрос вне whitelist и записывает его', async () => {
    const s = await openSession(
      '<html><body><img src="https://evil.example.com/x.png"></body></html>',
    );
    try {
      await s.wait(300);
      expect(s.blockedUrls()).toContain('https://evil.example.com/x.png');
    } finally {
      await s.close();
    }
  }, 30000);

  it('дедуплицирует повторные блокировки одного и того же URL', async () => {
    const s = await openSession(
      `<html><body><script>
        for (let i = 0; i < 3; i++) { fetch('https://evil.example.com/dup.png').catch(() => {}); }
      </script></body></html>`,
    );
    try {
      await s.wait(300);
      const dup = s.blockedUrls().filter((u) => u === 'https://evil.example.com/dup.png');
      expect(dup).toHaveLength(1);
    } finally {
      await s.close();
    }
  }, 30000);
});
