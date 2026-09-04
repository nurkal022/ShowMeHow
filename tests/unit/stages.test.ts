import { describe, it, expect, vi } from 'vitest';
import { plan, generateCandidate, verifyCandidate, type Ctx } from '@/lib/pipeline/stages';
import type { PlanSpec, RenderReport, Role } from '@/lib/types';
import type { ChatMessage } from '@/lib/provider';
import type { ProbeReport } from '@/lib/pipeline/probes';

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
    chat: vi.fn(async (role: Role) =>
      role === 'critic' || role === 'judge'
        ? '{"physicsOk": true, "issues": []}'
        : '```html\n' + HTML + '\n```'),
    hasVision: true,
    render: vi.fn(async () => okRender),
    emit: vi.fn(),
    ...over,
  };
}

/** Заменяет только генераторские роли (planner/generator/fixer/refiner), критик/судья — дефолт. */
function genOnly(impl: (messages: ChatMessage[]) => Promise<string>) {
  return vi.fn(async (role: Role, messages: ChatMessage[]) =>
    role === 'critic' || role === 'judge'
      ? '{"physicsOk": true, "issues": []}'
      : impl(messages));
}

/** Заменяет только критика/судью, остальные роли — дефолтный HTML. */
function visionOnly(impl: (messages: ChatMessage[]) => Promise<string>) {
  return vi.fn(async (role: Role, messages: ChatMessage[]) =>
    role === 'critic' || role === 'judge' ? impl(messages) : '```html\n' + HTML + '\n```');
}

describe('plan', () => {
  it('parses spec json and passes image part', async () => {
    const chat = vi.fn(async (_role: Role, _messages: ChatMessage[]) => JSON.stringify(SPEC));
    const c = ctx({ chat });
    const spec = await plan(c, 'диффузия', 'data:image/png;base64,xxx');
    expect(spec.title).toBe('Диффузия');
    expect(chat.mock.calls[0]![0]).toBe('planner');
    const userMsg = chat.mock.calls[0]![1].at(-1)!;
    expect(JSON.stringify(userMsg.content)).toContain('data:image/png');
  });
});

describe('generateCandidate', () => {
  it('returns instrumented html', async () => {
    const html = await generateCandidate(ctx(), SPEC, 'стиль');
    expect(html).toContain('showmehow-runtime');
    expect(html).toContain('<canvas>');
  });

  it('передаёт эталон в системный промпт генератора', async () => {
    const c = ctx();
    await generateCandidate(c, SPEC, 'стиль', '<html>ЭТАЛОН_МАРКЕР</html>');
    const sys = String((c.chat as ReturnType<typeof vi.fn>).mock.calls[0][1][0].content);
    expect(sys).toContain('ЭТАЛОН_МАРКЕР');
  });
});

describe('verifyCandidate', () => {
  it('happy path: render ok, critic ok', async () => {
    const r = await verifyCandidate(ctx(), SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(true);
    expect(r.critic?.physicsOk).toBe(true);
  });

  it('fixes broken candidate then succeeds', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce(badRender)
      .mockResolvedValueOnce(okRender);
    const c = ctx({ render });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    const calls = (c.chat as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.filter((call) => call[0] === 'fixer')).toHaveLength(1); // один вызов фиксера
  });

  it('gives up after 2 fix attempts', async () => {
    const render = vi.fn(async () => badRender);
    const r = await verifyCandidate(ctx({ render }), SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(false);
    expect(render).toHaveBeenCalledTimes(3); // исходный + 2 починки
  });

  it('skips critic when vision unavailable', async () => {
    const r = await verifyCandidate(ctx({ hasVision: false }), SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(true);
    expect(r.critic).toBeNull();
  });

  it('stamps styleName into every candidate event', async () => {
    const c = ctx();
    await verifyCandidate(c, SPEC, HTML, 2, 'Схема');
    const candEvents = (c.emit as ReturnType<typeof vi.fn>).mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'candidate');
    expect(candEvents.length).toBeGreaterThan(0);
    for (const e of candEvents) {
      expect(e.index).toBe(2);
      expect(e.styleHint).toBe('Схема');
    }
  });

  it('emits critic-verdict after a live critic runs', async () => {
    const visionChat = vi.fn(async () =>
      '{"physicsOk": false, "issues": ["стрелка направлена не туда"]}');
    const c = ctx({ chat: visionOnly(visionChat) });
    await verifyCandidate(c, SPEC, HTML, 1, 'Наглядность');
    const verdictEvents = (c.emit as ReturnType<typeof vi.fn>).mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'critic-verdict');
    expect(verdictEvents).toEqual([
      { type: 'critic-verdict', index: 1, physicsOk: false, issues: ['стрелка направлена не туда'] },
    ]);
  });

  it('no critic-verdict emitted when vision is unavailable', async () => {
    const c = ctx({ hasVision: false });
    await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    const verdictEvents = (c.emit as ReturnType<typeof vi.fn>).mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === 'critic-verdict');
    expect(verdictEvents).toHaveLength(0);
  });

  it('static animation is treated as fixable: retries until animated', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce(staticRender)
      .mockResolvedValueOnce(staticRender)
      .mockResolvedValueOnce(okRender);
    const genChat = vi.fn(async (_messages: ChatMessage[]) => '```html\n' + HTML + '\n```');
    const c = ctx({ render, chat: genOnly(genChat) });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
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
    const c = ctx({ render, chat: visionOnly(visionChat) });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
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
    const chat = vi.fn(async (role: Role, messages: ChatMessage[]) =>
      role === 'critic' || role === 'judge' ? visionChat(messages) : genChat(messages));
    const c = ctx({ render, chat });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
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
    const c = ctx({ render, chat: genOnly(genChat) });
    const r = await verifyCandidate(c, SPEC, htmlWithForbidden, 0, 'Реализм');
    expect(r.alive).toBe(true);
    expect(genChat).toHaveBeenCalledTimes(1); // один вызов фиксера
    const fixerCall = genChat.mock.calls[0]![0];
    expect(JSON.stringify(fixerCall)).toContain('Запрещённые внешние ресурсы');
    expect(JSON.stringify(fixerCall)).toContain('evil.example.com');
    // фикс вернул чистый HTML (без запрещённых ссылок) -> ещё один рендер, но не более
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('tainted (forbidden-url) candidate never wins best-so-far, even if it rendered best', async () => {
    // исходник — ok+animated, НО с запрещённым CDN; починки убирают URL, но ломают рендер.
    // best-so-far НЕ должен вернуть заражённую версию с alive:true — whitelist важнее ранга.
    const htmlWithForbidden = HTML.replace(
      '<canvas>',
      '<script src="https://evil.example.com/x.js"></script><canvas>',
    );
    const render = vi.fn()
      .mockResolvedValueOnce(okRender)   // заражённый, но красивый
      .mockResolvedValueOnce(badRender)  // фикс 1: чистый, но сломан
      .mockResolvedValueOnce(badRender); // фикс 2: чистый, но сломан
    const genChat = vi.fn(async (_messages: ChatMessage[]) => '```html\n' + HTML + '\n```');
    const c = ctx({ render, chat: genOnly(genChat) });
    const r = await verifyCandidate(c, SPEC, htmlWithForbidden, 0, 'Реализм');
    expect(r.alive).toBe(false);
    expect(r.html).not.toContain('evil.example.com');
  });

  it('tainted candidate with no clean alternative (fixer dies) fails, not alive', async () => {
    const htmlWithForbidden = HTML.replace(
      '<canvas>',
      '<script src="https://evil.example.com/x.js"></script><canvas>',
    );
    const render = vi.fn(async () => okRender); // рендер «успешен», но HTML заражён
    const chat = vi.fn(async () => { throw new Error('provider down'); });
    const c = ctx({ render, chat });
    const r = await verifyCandidate(c, SPEC, htmlWithForbidden, 0, 'Реализм');
    expect(r.alive).toBe(false); // whitelist-нарушение не может уйти в библиотеку
  });
});

const probesOk: ProbeReport = {
  results: [{ id: 'pause', label: 'Пауза', status: 'pass', detail: '' }],
  passRate: 1, failures: [], shots: [],
};
const probesBad: ProbeReport = {
  results: [{ id: 'pause', label: 'Пауза останавливает анимацию', status: 'fail',
    detail: 'кадры продолжают меняться' }],
  passRate: 0, failures: ['Пауза останавливает анимацию: кадры продолжают меняться'], shots: [],
};

describe('пробы в verifyCandidate', () => {
  it('провал пробы отправляет кандидата в фиксер и попадает в текст ошибок', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce({ ...okRender, probes: probesBad })
      .mockResolvedValueOnce({ ...okRender, probes: probesOk });
    const c = ctx({ render });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(true);
    const fixerCalls = (c.chat as ReturnType<typeof vi.fn>).mock.calls
      .filter((call) => call[0] === 'fixer');
    expect(fixerCalls).toHaveLength(1);
    expect(JSON.stringify(fixerCalls[0][1])).toContain('Пауза останавливает анимацию');
  });

  it('эмитит probe-report с долей пройденных проб', async () => {
    const c = ctx({ render: vi.fn(async () => ({ ...okRender, probes: probesOk })) });
    await verifyCandidate(c, SPEC, HTML, 1, 'Данные');
    const ev = (c.emit as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0]).find((e) => e.type === 'probe-report');
    expect(ev).toMatchObject({ index: 1, passRate: 1 });
  });
});

describe('целевая починка по замечаниям критика', () => {
  it('блокер от критика запускает один раунд правки и переpроверку', async () => {
    const chat = vi.fn(async (role: string, _messages: ChatMessage[]) => {
      if (role === 'critic') {
        return JSON.stringify({ physicsOk: false, issues: [
          { severity: 'blocker', text: 'частицы вылетают за стенки сосуда' }] });
      }
      return '```html\n' + HTML + '\n```';
    });
    const render = vi.fn(async () => ({ ...okRender, probes: probesOk }));
    const c = ctx({ chat, render });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(true);
    const refinerCalls = chat.mock.calls.filter((call) => call[0] === 'refiner');
    expect(refinerCalls).toHaveLength(1);
    expect(JSON.stringify(refinerCalls[0][1])).toContain('вылетают за стенки');
    const ev = (c.emit as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0]).find((e) => e.type === 'targeted-fix');
    expect(ev).toMatchObject({ index: 0 });
  });

  it('только minor-замечания целевую починку не запускают', async () => {
    const chat = vi.fn(async (role: string) => {
      if (role === 'critic') {
        return JSON.stringify({ physicsOk: true, issues: [
          { severity: 'minor', text: 'подписи мелковаты' }] });
      }
      return '```html\n' + HTML + '\n```';
    });
    const c = ctx({ chat, render: vi.fn(async () => ({ ...okRender, probes: probesOk })) });
    await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    expect(chat.mock.calls.filter((call) => call[0] === 'refiner')).toHaveLength(0);
  });
});
