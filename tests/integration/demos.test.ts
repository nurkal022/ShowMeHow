import { describe, it, expect, afterAll } from 'vitest';
import { listBundledDemos } from '@/lib/demos';
import { renderArtifact, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';

// Гейт качества демок: читает НАСТОЯЩУЮ папку demos/ (без переопределения
// SHOWMEHOW_DEMOS_DIR) — демки добавляются постепенно задачами 3-12. Пока
// демок нет, тест пропускается; ложное срабатывание "нет демок" не должно
// заваливать сборку до того, как демки появятся.
const demos = listBundledDemos();

describe('demos quality gate (real demos/ dir)', () => {
  afterAll(() => closeBrowser());

  if (demos.length === 0) {
    it.skip('no bundled demos yet — skipping quality gate', () => {});
    return;
  }

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
