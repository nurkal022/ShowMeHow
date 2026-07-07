import { describe, it, expect, vi } from 'vitest';
import { plan, generateCandidate, verifyCandidate, type Ctx } from '@/lib/pipeline/stages';
import type { PlanSpec, RenderReport } from '@/lib/types';
import type { ChatMessage } from '@/lib/provider';

const SPEC: PlanSpec = {
  title: 'Диффузия', subject: 'Физика', mode: '2d',
  learningGoals: ['понять диффузию'], physics: 'случайные блуждания',
  parameters: [{ name: 't', label: 'Температура', min: 0, max: 100, step: 1, value: 20, unit: '°C' }],
  visualPlan: 'частицы на canvas',
};
const HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas></body></html>';
const okRender: RenderReport = { ok: true, errors: [], animated: true, screenshots: [Buffer.from('a')] };
const badRender: RenderReport = { ok: false, errors: ['ReferenceError: x'], animated: false, screenshots: [] };
const staticRender: RenderReport = { ok: true, errors: [], animated: false, screenshots: [Buffer.from('a')] };

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
    const genChat = vi.fn(async (_messages: ChatMessage[]) => JSON.stringify(SPEC));
    const c = ctx({ genChat });
    const spec = await plan(c, 'диффузия', 'data:image/png;base64,xxx');
    expect(spec.title).toBe('Диффузия');
    const userMsg = genChat.mock.calls[0]![0].at(-1)!;
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

  it('static animation is treated as fixable: retries until animated', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce(staticRender)
      .mockResolvedValueOnce(staticRender)
      .mockResolvedValueOnce(okRender);
    const genChat = vi.fn(async (_messages: ChatMessage[]) => '```html\n' + HTML + '\n```');
    const c = ctx({ render, genChat });
    const r = await verifyCandidate(c, SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(r.render.animated).toBe(true);
    expect(render).toHaveBeenCalledTimes(3);
    expect(genChat).toHaveBeenCalledTimes(2); // два вызова фиксера
    // фиксеру передали причину — статичную анимацию
    const fixerCall = genChat.mock.calls[0]![0];
    expect(JSON.stringify(fixerCall)).toContain('Анимация не идёт');
  });

  it('ok but persistently not animated after 2 fix attempts: stays alive, critic notified', async () => {
    const render = vi.fn(async () => staticRender);
    const visionChat = vi.fn(async (_messages: ChatMessage[]) => '{"physicsOk": true, "issues": []}');
    const c = ctx({ render, visionChat });
    const r = await verifyCandidate(c, SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(r.render.animated).toBe(false);
    expect(render).toHaveBeenCalledTimes(3); // исходный + 2 починки
    expect(visionChat).toHaveBeenCalledTimes(1);
    const criticCall = visionChat.mock.calls[0]![0];
    expect(JSON.stringify(criticCall)).toMatch(/анимация не идёт/i);
  });

  it('best-so-far: fixes that make things worse are discarded, best (pre-fix) version wins', async () => {
    // исходный рендер — ok+статика (ранг 1); обе попытки починки ломают кандидата (ранг 0).
    const render = vi.fn()
      .mockResolvedValueOnce(staticRender)
      .mockResolvedValueOnce(badRender)
      .mockResolvedValueOnce(badRender);
    const visionChat = vi.fn(async (_messages: ChatMessage[]) => '{"physicsOk": true, "issues": []}');
    const genChat = vi.fn(async (_messages: ChatMessage[]) => '```html\n' + HTML + '\n```');
    const c = ctx({ render, visionChat, genChat });
    const r = await verifyCandidate(c, SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(r.html).toBe(HTML); // версия до фиксов, а не последняя (сломанная) попытка
    expect(r.render.ok).toBe(true);
    expect(r.render.animated).toBe(false);
    expect(render).toHaveBeenCalledTimes(3);
    expect(genChat).toHaveBeenCalledTimes(2); // обе попытки починки выполнены
    // критик уведомлён о статичности победившей (best-so-far) версии
    expect(visionChat).toHaveBeenCalledTimes(1);
    const criticCall = visionChat.mock.calls[0]![0];
    expect(JSON.stringify(criticCall)).toMatch(/анимация не идёт/i);
  });

  it('CDN violation triggers the fixer with a "Запрещённые внешние ресурсы" message', async () => {
    const htmlWithForbidden = HTML.replace(
      '<canvas>',
      '<script src="https://evil.example.com/x.js"></script><canvas>',
    );
    const render = vi.fn(async () => okRender);
    const genChat = vi.fn(async (_messages: ChatMessage[]) => '```html\n' + HTML + '\n```');
    const c = ctx({ render, genChat });
    const r = await verifyCandidate(c, SPEC, htmlWithForbidden, 0);
    expect(r.alive).toBe(true);
    expect(genChat).toHaveBeenCalledTimes(1); // один вызов фиксера
    const fixerCall = genChat.mock.calls[0]![0];
    expect(JSON.stringify(fixerCall)).toContain('Запрещённые внешние ресурсы');
    expect(JSON.stringify(fixerCall)).toContain('evil.example.com');
    // фикс вернул чистый HTML (без запрещённых ссылок) -> ещё один рендер, но не более
    expect(render).toHaveBeenCalledTimes(2);
  });
});
