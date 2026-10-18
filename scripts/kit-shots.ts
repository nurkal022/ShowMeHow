// Скриншоты демо с текущим китом (проверка изменений кита): npx tsx scripts/kit-shots.ts <outdir> [slug...] [--mobile]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { instrument, stripRuntime } from '../src/lib/artifact';

const out = process.argv[2];
const mobile = process.argv.includes('--mobile');
const slugsArg = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const files: [string, string][] = [];
for (const a of slugsArg.length ? slugsArg : fs.readdirSync('demos')) {
  const f = a.endsWith('.html') ? a : `demos/${a}/artifact.html`;
  if (fs.existsSync(f)) files.push([path.basename(a, '.html'), f]);
}
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
// Прогрев: первая страница в сессии заметно медленнее, и fps первой демки врал бы.
const warm = await browser.newPage();
// Заодно грузим KaTeX с CDN: иначе первая страница с формулой ждёт сеть во время замера.
await warm.setContent(instrument('<!DOCTYPE html><html><head></head><body><canvas id="scene"></canvas>' +
  '<script>SimUI.formula({tex: "E = mc^2"});</script></body></html>'));
await warm.waitForTimeout(3000);
await warm.close();
for (const [name, f] of files) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  const html = instrument(stripRuntime(fs.readFileSync(f, 'utf8')));
  await page.setContent(html, { waitUntil: 'load' }).catch((e) => errs.push(String(e)));
  await page.waitForTimeout(2500);
  // Строкой, а не функцией: tsx вставляет __name, которого нет в странице.
  const perf = await page.evaluate<number>(`new Promise(function (res) {
    var n = 0, t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }
    requestAnimationFrame(f);
  })`);
  await page.screenshot({ path: path.join(out, `${name}${mobile ? '-m' : ''}.png`) });
  console.log(name, 'fps', perf, errs.length ? errs.slice(0, 3).join(' | ') : 'ok');
  await page.close();
}
await browser.close();
