// Профиль кадра тренажёра (где уходит время): npx tsx scripts/kit-profile.ts <file.html> [--mobile]
import fs from 'node:fs';
import { chromium } from 'playwright';
import { instrument, stripRuntime } from '../src/lib/artifact';

const file = process.argv[2];
const mobile = process.argv.includes('--mobile');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 760 } });
await page.setContent(instrument(stripRuntime(fs.readFileSync(file, 'utf8'))), { waitUntil: 'load' });
await page.waitForTimeout(1500);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');
await page.waitForTimeout(3000);
const { profile } = await cdp.send('Profiler.stop') as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }[]; samples: number[]; timeDeltas: number[] } };
// Собственное время по функциям.
const self = new Map<string, number>();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i])!;
  const key = `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
}
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [k, ms] of top) console.log(ms.toFixed(0).padStart(6), 'ms', k);
await browser.close();
