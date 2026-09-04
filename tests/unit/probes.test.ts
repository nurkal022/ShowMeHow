import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openSession, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';
import { runProbes, type ProbeReport } from '@/lib/pipeline/probes';

const fx = (n: string) =>
  instrument(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures', n), 'utf8'));

async function probe(name: string): Promise<ProbeReport> {
  const s = await openSession(fx(name));
  try {
    return await runProbes(s);
  } finally {
    await s.close();
  }
}

function status(r: ProbeReport, id: string): string {
  return r.results.find((x) => x.id === id)?.status ?? 'missing';
}

describe('runProbes', () => {
  afterAll(() => closeBrowser());

  it('здоровый артефакт: ни одного провала', async () => {
    const r = await probe('probe-ok.html');
    expect(r.failures).toEqual([]);
    expect(status(r, 'animates')).toBe('pass');
    expect(status(r, 'pause')).toBe('pass');
    expect(status(r, 'reset')).toBe('pass');
    expect(status(r, 'nan')).toBe('pass');
    expect(status(r, 'cdn')).toBe('pass');
    expect(r.passRate).toBe(1);
  }, 60000);

  it('здоровый слайдер, влияющий только на темп, проходит пробу', async () => {
    const r = await probe('probe-ok.html');
    expect(status(r, 'sliders')).toBe('pass');
  }, 60000);

  it('ловит слайдер, который ни на что не влияет', async () => {
    // Значение слайдера видно в getState, но физика и картинка его не читают:
    // проба обязана отличить это от «эффект просто не наблюдаем».
    const r = await probe('probe-dead-slider.html');
    expect(status(r, 'sliders')).toBe('fail');
    expect(r.failures.join(' ')).toContain('Температура');
  }, 60000);

  it('ловит неработающую паузу', async () => {
    const r = await probe('probe-dead-pause.html');
    expect(status(r, 'pause')).toBe('fail');
  }, 60000);

  it('ловит неработающий сброс', async () => {
    const r = await probe('probe-dead-reset.html');
    expect(status(r, 'reset')).toBe('fail');
  }, 60000);

  it('ловит NaN в состоянии', async () => {
    const r = await probe('probe-nan.html');
    expect(status(r, 'nan')).toBe('fail');
  }, 60000);

  it('ловит отсутствие анимации', async () => {
    const r = await probe('probe-static.html');
    expect(status(r, 'animates')).toBe('fail');
  }, 60000);
});
