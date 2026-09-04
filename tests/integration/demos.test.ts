import { describe, it, expect, afterAll } from 'vitest';
import { listBundledDemos } from '@/lib/demos';
import { openSession, renderArtifact, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';
import { runProbes } from '@/lib/pipeline/probes';

// Гейт качества демок: читает НАСТОЯЩУЮ папку demos/ (без переопределения
// SHOWMEHOW_DEMOS_DIR). Все 10 демок из спеки уже на месте (задачи 3-12) —
// гейт теперь обязан заваливать сборку, если демок стало меньше 10, если какая-то
// демка проваливает поведенческую пробу или если эталон рисует свои панели.
const demos = listBundledDemos();

/** Селекторы правил с position:fixed — по ним отличаем панель от полотна сцены. */
function fixedSelectors(html: string): string[] {
  return (html.match(/[^{}]+\{[^}]*position:\s*fixed[^}]*\}/g) ?? [])
    .map((rule) => rule.slice(0, rule.indexOf('{')).trim());
}

describe('demos quality gate (real demos/ dir)', () => {
  afterAll(() => closeBrowser());

  it('has at least 10 bundled demos', () => {
    expect(demos.length).toBeGreaterThanOrEqual(10);
  });

  it('есть хотя бы две эталонные демки на SimUI 2.0', () => {
    expect(demos.filter((d) => d.exemplar).length).toBeGreaterThanOrEqual(2);
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

    it(
      `demo "${demo.slug}" проходит поведенческие пробы без провалов`,
      async () => {
        const s = await openSession(instrument(demo.html));
        try {
          const probes = await runProbes(s);
          expect(probes.failures).toEqual([]);
        } finally {
          await s.close();
        }
      },
      90000,
    );
  }

  for (const demo of demos.filter((d) => d.exemplar)) {
    it(`эталон "${demo.slug}" не рисует своих fixed-панелей и реализует expose`, () => {
      // Кит сам расставляет панели по углам; рукописные position:fixed панели в
      // эталоне означают, что промпт учит модель плохому примеру. Полотно сцены —
      // законное исключение: оно обязано быть fixed и во всё окно.
      const nonScene = fixedSelectors(demo.html)
        .filter((sel) => !/^(canvas|canvas\.scene|#scene|#bg|#fx)$/.test(sel));
      expect(nonScene).toEqual([]);
      expect(demo.html).toContain('SimUI.expose');
    });
  }
});
