import { describe, it, expect, afterAll } from 'vitest';
import { openSession, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';
import { runProbes } from '@/lib/pipeline/probes';

// Артефакт, использующий КАЖДЫЙ примитив SimUI 2.0. Дымовой тест кита:
// если примитив падает или ломает лейаут, это видно здесь, а не в генерации.
const KIT_DEMO = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>kit smoke</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas#c{position:fixed;top:0;left:0}</style>
</head><body><canvas id="c"></canvas><script>
(function () {
  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var st = { t: 0, x: 0, e: 0 }, amp = 50, running = true, last = null, shape = 'circle';
  function resetSim() { st = { t: 0, x: 0, e: 0 }; ch.clear(); }
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  SimUI.title('Дымовой тест кита');
  SimUI.goals(['проверить все примитивы кита']);
  var banner = SimUI.banner({ items: [
    { name: 'Фаза A', sub: 'первая половина', color: '#4f8ff7' },
    { name: 'Фаза B', sub: 'вторая половина', color: '#ff6a3d' }] });
  var rd = SimUI.readout({ label: 'Время', unit: 'с', digits: 1, corner: 'bl' });
  var rx = SimUI.readout({ label: 'Смещение', unit: 'px', digits: 1, corner: 'bl' });
  var fm = SimUI.formula({ title: 'Модель', tex: 'x = A\\\\sin(\\\\omega t)',
    vars: { A: { label: 'A', unit: 'px' }, t: { label: 't', unit: 'с' } }, corner: 'tl' });
  SimUI.legend({ items: [{ color: '#4f8ff7', label: 'синий' }, { color: '#ff6a3d', label: 'красный' }],
    corner: 'tl' });
  var ch = SimUI.chart({ title: 'x(t)', xLabel: 't, с', yLabel: 'x',
    series: [{ name: 'x', color: '#4f8ff7' }], corner: 'br' });
  SimUI.slider({ name: 'amp', label: 'Амплитуда', min: 10, max: 200, step: 5, value: amp,
    unit: 'px', onChange: function (v) { amp = v; } });
  SimUI.select({ name: 'shape', label: 'Форма', options: ['circle', 'square'], value: 'circle',
    onChange: function (v) { shape = v; } });
  SimUI.toggle({ name: 'grid', label: 'Сетка', value: false, onChange: function () {} });
  SimUI.button({ name: 'kick', label: 'Толчок', onClick: function () { st.x += 20; } });
  SimUI.presets({ items: [{ label: 'Слабо', values: { amp: 20 } }, { label: 'Сильно', values: { amp: 180 } }] });
  var sp = SimUI.speed({ values: [0.5, 1, 2], value: 1 });
  SimUI.playPause({ onPlay: function () { running = true; last = null; },
    onPause: function () { running = false; }, onReset: resetSim });
  SimUI.expose({ getState: function () { return { t: st.t, x: st.x, amp: amp }; }, reset: resetSim });
  function loop(now) {
    if (last == null) last = now;
    var dt = Math.min(0.05, (now - last) / 1000) * sp.get(); last = now;
    if (running) {
      st.t += dt;
      st.x = amp * Math.sin(st.t * 2);
      ch.push(st.t, [st.x]);
      rd.set(st.t); rx.set(st.x);
      fm.set({ A: amp, t: st.t });
      banner.set(Math.floor(st.t) % 2);
    }
    ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = shape === 'circle' ? '#4f8ff7' : '#ff6a3d';
    ctx.fillRect(cv.width / 2 + st.x, cv.height / 2, 30, 30);
    requestAnimationFrame(loop);
  }
  addEventListener('resize', resize); resize(); requestAnimationFrame(loop);
})();
</script></body></html>`;

describe('SimUI 2.0 kit smoke', () => {
  afterAll(() => closeBrowser());

  it('артефакт со всеми примитивами рендерится без ошибок и проходит пробы', async () => {
    const s = await openSession(instrument(KIT_DEMO));
    try {
      const report = await runProbes(s);
      expect(s.errors()).toEqual([]);
      expect(report.failures).toEqual([]);
    } finally {
      await s.close();
    }
  }, 90000);

  it('все примитивы реально создали свои узлы в DOM', async () => {
    const s = await openSession(instrument(KIT_DEMO));
    try {
      await s.wait(600);
      const counts = await s.evaluate<Record<string, number>>(`(function () {
        return {
          panel: document.querySelectorAll('.sim-panel').length,
          side: document.querySelectorAll('.sim-side-panel').length,
          banner: document.querySelectorAll('.sim-banner').length,
          chart: document.querySelectorAll('canvas.sim-chart').length,
          readout: document.querySelectorAll('.sim-readout').length,
          select: document.querySelectorAll('.sim-select').length,
          presets: document.querySelectorAll('.sim-presets button').length,
        };
      })()`);
      expect(counts.panel).toBe(1);
      expect(counts.banner).toBe(1);
      expect(counts.chart).toBe(1);
      expect(counts.readout).toBe(2);
      expect(counts.select).toBe(1);
      expect(counts.presets).toBe(2);
      expect(counts.side).toBeGreaterThanOrEqual(4);
    } finally {
      await s.close();
    }
  }, 60000);

  it('пресет двигает слайдер через реестр контролов', async () => {
    const s = await openSession(instrument(KIT_DEMO));
    try {
      await s.wait(400);
      await s.click('.sim-presets button:last-child');
      await s.wait(200);
      const amp = await s.evaluate<number>(
        "window.__smh.controls().filter(function(c){return c.name==='amp';})[0].value");
      expect(amp).toBe(180);
    } finally {
      await s.close();
    }
  }, 60000);
});
