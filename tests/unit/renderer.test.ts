import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderArtifact, closeBrowser } from '@/lib/renderer';

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
});
