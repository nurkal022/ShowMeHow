import { chromium } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3012/login', { waitUntil: 'networkidle' });
await p.fill('input[type=email]', 'ui-check-12002@example.com');
await p.fill('input[type=password]', 'проверка123');
await p.click('button[type=submit]');
await p.waitForURL('http://localhost:3012/', { timeout: 25000 });
await p.waitForSelector('.stand');

await p.click('.chip-wrap .chip-action:text-is("Математика")');
await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(() => {
  const svg = document.querySelector('.stage-art');
  const box = svg.getBoundingClientRect();
  const core = svg.querySelector('.mot-core');
  const paths = [...svg.querySelectorAll('path')].map((el) => ({
    stroke: el.getAttribute('stroke'),
    d: (el.getAttribute('d') || '').slice(0, 46),
  }));
  return {
    view: svg.getAttribute('viewBox'),
    box: [Math.round(box.width), Math.round(box.height)],
    coreTransform: core ? core.getAttribute('style') : 'нет ядра',
    texts: [...svg.querySelectorAll('text')].map((t) => t.textContent),
    paths: paths.slice(0, 8),
  };
}), null, 1));
await b.close();
