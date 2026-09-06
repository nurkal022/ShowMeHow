import { chromium } from 'playwright';

const OUT = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));

// Генерация подменяется: проверяем передачу управления, а не работу модели.
let sentPrompt = null;
await p.route('**/api/generate', async (route) => {
  sentPrompt = JSON.parse(route.request().postData()).prompt;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobId: 'test-job' }) });
});
await p.route('**/api/jobs/test-job/stream', (route) => route.fulfill({
  status: 200,
  contentType: 'text/event-stream',
  body: 'data: {"type":"queued","position":0}\n\n'
    + 'data: {"type":"stage","stage":"planning","status":"start","at":1}\n\n',
}));

await p.goto('http://localhost:3012/login', { waitUntil: 'networkidle' });
await p.fill('input[type=email]', 'ui-check-12002@example.com');
await p.fill('input[type=password]', 'проверка123');
await p.click('button[type=submit]');
await p.waitForURL('http://localhost:3012/', { timeout: 25000 });
await p.waitForSelector('.stand');

// 1. «Открыть как текст» переносит собранный запрос в поле
await p.click('.chip-wrap .chip-action:text-is("Оптика")');
await p.click('.chip-wrap .chip-action:text-is("дисперсия в призме")');
await p.click('.stand-bar .link-btn');
await p.waitForSelector('.composer-box textarea');
const inField = await p.inputValue('.composer-box textarea');
console.log('в поле попал запрос:', inField.includes('дисперсия в призме'));

// 2. Кнопка-палочка возвращает на стенд
await p.click('button[aria-label="Собрать в конструкторе"]');
await p.waitForSelector('.stand');
console.log('возврат на стенд: да');

// 3. «Создать» передаёт управление мастерской
await p.click('.chip-wrap .chip-action:text-is("Механика")');
await p.click('.chip-wrap .chip-action:text-is("свободное падение")');
await p.click('.stand-bar .btn-primary');
await p.waitForSelector('.workbench', { timeout: 15000 });
await p.waitForTimeout(1200);
console.log('запрос ушёл в генерацию:', sentPrompt ? sentPrompt.slice(0, 58) + '…' : 'НЕТ');
console.log('прогресс виден:', await p.locator('.progress-view').count() > 0);
await p.screenshot({ path: `${OUT}/z1-переход.png` });

console.log(errs.length ? 'ОШИБКИ: ' + errs.slice(0, 4).join(' | ') : 'консоль чистая');
await b.close();
