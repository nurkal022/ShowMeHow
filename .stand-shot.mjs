import { chromium } from 'playwright';

const OUT = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));

await p.goto('http://localhost:3012/login', { waitUntil: 'networkidle' });
await p.fill('input[type=email]', 'ui-check-12002@example.com');
await p.fill('input[type=password]', 'проверка123');
await p.click('button[type=submit]');
await p.waitForURL('http://localhost:3012/', { timeout: 25000 });
await p.waitForSelector('.stand');

// Полный экран стенда с выбранным явлением и своими словами
await p.click('.chip-wrap .chip-action:text-is("Химия")');
await p.click('.chip-wrap .chip-action:text-is("титрование")');
await p.fill('.stand-block:has-text("Что ещё важно") textarea', 'показывать pH цветом');
await p.waitForTimeout(1600);
await p.screenshot({ path: `${OUT}/y1-full.png` });

// Собранный запрос целиком
await p.click('.stand-prompt summary');
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/y2-prompt.png` });

// Узкий экран
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto('http://localhost:3012/', { waitUntil: 'networkidle' });
await m.waitForSelector('.stand');
await m.click('.chip-wrap .chip-action:text-is("Астрономия")');
await m.waitForTimeout(1800);
await m.screenshot({ path: `${OUT}/y3-mobile.png` });

console.log(errs.length ? 'ОШИБКИ: ' + errs.slice(0, 5).join(' | ') : 'консоль чистая');
await b.close();
