import { describe, it, expect, vi } from 'vitest';
import { plan, generateCandidate, verifyCandidate, type Ctx } from '@/lib/pipeline/stages';
import type { PlanSpec, RenderReport } from '@/lib/types';

const SPEC: PlanSpec = {
  title: 'Диффузия', subject: 'Физика', mode: '2d',
  learningGoals: ['понять диффузию'], physics: 'случайные блуждания',
  parameters: [{ name: 't', label: 'Температура', min: 0, max: 100, step: 1, value: 20, unit: '°C' }],
  visualPlan: 'частицы на canvas',
};
const HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas></body></html>';
const okRender: RenderReport = { ok: true, errors: [], animated: true, screenshots: [Buffer.from('a')] };
const badRender: RenderReport = { ok: false, errors: ['ReferenceError: x'], animated: false, screenshots: [] };

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    genChat: vi.fn(async () => '```html\n' + HTML + '\n```'),
    visionChat: vi.fn(async () => '{"physicsOk": true, "issues": []}'),
    render: vi.fn(async () => okRender),
    emit: vi.fn(),
    ...over,
  };
}

describe('plan', () => {
  it('parses spec json and passes image part', async () => {
    const genChat = vi.fn(async () => JSON.stringify(SPEC));
    const c = ctx({ genChat });
    const spec = await plan(c, 'диффузия', 'data:image/png;base64,xxx');
    expect(spec.title).toBe('Диффузия');
    const userMsg = genChat.mock.calls[0][0].at(-1);
    expect(JSON.stringify(userMsg.content)).toContain('data:image/png');
  });
});

describe('generateCandidate', () => {
  it('returns instrumented html', async () => {
    const html = await generateCandidate(ctx(), SPEC, 'стиль');
    expect(html).toContain('showmehow-runtime');
    expect(html).toContain('<canvas>');
  });
});

describe('verifyCandidate', () => {
  it('happy path: render ok, critic ok', async () => {
    const r = await verifyCandidate(ctx(), SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(r.critic?.physicsOk).toBe(true);
  });

  it('fixes broken candidate then succeeds', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce(badRender)
      .mockResolvedValueOnce(okRender);
    const c = ctx({ render });
    const r = await verifyCandidate(c, SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    expect(c.genChat).toHaveBeenCalledTimes(1); // один вызов фиксера
  });

  it('gives up after 2 fix attempts', async () => {
    const render = vi.fn(async () => badRender);
    const r = await verifyCandidate(ctx({ render }), SPEC, HTML, 0);
    expect(r.alive).toBe(false);
    expect(render).toHaveBeenCalledTimes(3); // исходный + 2 починки
  });

  it('skips critic when vision unavailable', async () => {
    const r = await verifyCandidate(ctx({ visionChat: null }), SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(r.critic).toBeNull();
  });
});
