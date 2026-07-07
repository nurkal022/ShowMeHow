import { describe, it, expect, afterAll } from 'vitest';
import { listBundledDemos } from '@/lib/demos';
import { renderArtifact, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';

// Гейт качества демок: читает НАСТОЯЩУЮ папку demos/ (без переопределения
// SHOWMEHOW_DEMOS_DIR). Все 10 демок из спеки уже на месте (задачи 3-12) —
// гейт теперь обязан заваливать сборку, если демок стало меньше 10.
const demos = listBundledDemos();

describe('demos quality gate (real demos/ dir)', () => {
  afterAll(() => closeBrowser());

  it('has at least 10 bundled demos', () => {
    expect(demos.length).toBeGreaterThanOrEqual(10);
  });

  for (const demo of demos) {
    it(
      `demo "${demo.slug}" renders ok, animated, no errors`,
      async () => {
        expect(demo.title).toBeTruthy();
        expect(demo.prompt).toBeTruthy();
        expect(demo.subject).toBeTruthy();
        expect(Array.isArray(demo.tags)).toBe(true);
        expect(demo.tags.length).toBeGreaterThan(0);

        const report = await renderArtifact(instrument(demo.html), { shotTimes: [300, 1500] });
        expect(report.errors).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.animated).toBe(true);
      },
      60000,
    );
  }
});
