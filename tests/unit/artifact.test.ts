import { describe, it, expect, afterAll } from 'vitest';
import { extractHtml, extractJson, findForbiddenUrls, instrument, stripRuntime, reinstrument } from '@/lib/artifact';
import { UIKIT_JS, UIKIT_CSS, UIKIT_DOC } from '@/lib/runtime';
import { CDN_WHITELIST } from '@/lib/pipeline/prompts';
import { openSession, closeBrowser } from '@/lib/renderer';

describe('extractHtml', () => {
  it('extracts fenced html block', () => {
    const out = 'Вот код:\n```html\n<!DOCTYPE html><html><body>hi</body></html>\n```\nГотово.';
    expect(extractHtml(out)).toBe('<!DOCTYPE html><html><body>hi</body></html>');
  });
  it('extracts bare html document', () => {
    const doc = '<!DOCTYPE html>\n<html><head></head><body>x</body></html>';
    expect(extractHtml('пояснение\n' + doc + '\nконец')).toBe(doc);
  });
  it('throws when no html found', () => {
    expect(() => extractHtml('просто текст')).toThrow(/html/i);
  });
  it('extracts html with uppercase closing tag', () => {
    const doc = '<!DOCTYPE HTML><HTML><body>x</body></HTML>';
    expect(extractHtml(doc)).toBe(doc);
  });
});

describe('extractJson', () => {
  it('parses fenced json', () => {
    expect(extractJson<{ a: number }>('```json\n{"a": 1}\n```').a).toBe(1);
  });
  it('parses json with surrounding prose', () => {
    expect(extractJson<{ a: string }>('Ответ: {"a": "б"} — готово').a).toBe('б');
  });
  it('throws on garbage', () => {
    expect(() => extractJson('нет json')).toThrow();
  });
  it('parses json with a closing brace inside a string value', () => {
    const out = extractJson<{ text: string }>('{"text": "closing brace: } end"}');
    expect(out.text).toBe('closing brace: } end');
  });
  it('parses json with nested brace-like text inside a string value', () => {
    const out = extractJson<{ a: string }>('{"a": "{nested} {braces}"}');
    expect(out.a).toBe('{nested} {braces}');
  });
});

describe('UIKIT_JS SimUI.title()', () => {
  it('is syntactically valid JS (parses without executing DOM code)', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
  it('makes title() order-independent by inserting/updating an <h1> on the existing panel', () => {
    expect(UIKIT_JS).toContain('insertBefore');
  });
});

describe('collapse layer', () => {
  it('UIKIT_JS still parses as valid JS after adding the collapse module', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
  it('exposes __smhMakeCollapsible and scans on load', () => {
    expect(UIKIT_JS).toContain('__smhMakeCollapsible');
    expect(UIKIT_JS).toContain('MutationObserver');
  });
  it('UIKIT_CSS defines collapse styles', () => {
    expect(UIKIT_CSS).toContain('.smh-collapse-btn');
    expect(UIKIT_CSS).toContain('.smh-collapsed');
  });
});

describe('instrument', () => {
  it('injects runtime after <head> and is idempotent', () => {
    const html = '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>';
    const once = instrument(html);
    expect(once).toContain('showmehow-runtime');
    expect(once.indexOf('showmehow-runtime')).toBeLessThan(once.indexOf('<title>'));
    expect(instrument(once)).toBe(once);
  });
  it('injects after <html...> when there is no <head>', () => {
    const out = instrument('<!DOCTYPE html><html lang="ru"><body>x</body></html>');
    expect(out).toContain('showmehow-runtime');
    // после открывающего <html...>, перед остальным содержимым
    expect(out.indexOf('showmehow-runtime')).toBeGreaterThan(out.indexOf('<html'));
    expect(out.indexOf('showmehow-runtime')).toBeLessThan(out.indexOf('<body>'));
  });
  it('injects after doctype when there is neither <head> nor <html>', () => {
    const out = instrument('<!DOCTYPE html>\n<body>x</body>');
    expect(out).toContain('showmehow-runtime');
    expect(out.indexOf('<!DOCTYPE')).toBe(0);
    expect(out.indexOf('showmehow-runtime')).toBeGreaterThan(out.indexOf('<!DOCTYPE html>'));
    expect(out.indexOf('showmehow-runtime')).toBeLessThan(out.indexOf('<body>'));
  });
  it('prepends runtime when there is no doctype, no html, no head', () => {
    const out = instrument('<body>x</body>');
    expect(out).toContain('showmehow-runtime');
    // рантайм-маркер начинается с <!--, поэтому сам HTML-комментарий стоит на позиции 0
    expect(out.indexOf('<!--showmehow-runtime-->')).toBe(0);
    expect(out.indexOf('<body>')).toBeGreaterThan(out.indexOf('showmehow-runtime'));
  });
  it('never places the runtime before the doctype', () => {
    const out = instrument('<!DOCTYPE html><body>x</body>');
    expect(out.indexOf('<!DOCTYPE')).toBe(0);
    expect(out.indexOf('showmehow-runtime')).toBeGreaterThan(0);
  });
});

describe('importmap для three', () => {
  it('instrument вставляет importmap с three и three/addons/', () => {
    const out = instrument('<!DOCTYPE html><html><head></head><body></body></html>');
    expect(out).toContain('type="importmap"');
    expect(out).toContain('"three/addons/"');
    expect(out).toContain(CDN_WHITELIST.three);
    // importmap обязан идти до любого модульного скрипта артефакта
    expect(out.indexOf('type="importmap"')).toBeLessThan(out.indexOf('</head>'));
  });

  it('не вставляет второй importmap, если артефакт объявил свой', () => {
    const own = '<!DOCTYPE html><html><head><script type="importmap">{"imports":{}}</script>' +
      '</head><body></body></html>';
    const out = instrument(own);
    expect(out.split('type="importmap"').length - 1).toBe(1);
  });

  it('bare-спецификаторы three/addons не считаются запрещёнными URL', () => {
    const html = `<script type="module">import { OrbitControls } from 'three/addons/controls/OrbitControls.js';</script>`;
    expect(findForbiddenUrls(html, Object.values(CDN_WHITELIST))).toEqual([]);
  });
});

describe('findForbiddenUrls', () => {
  const allowed = Object.values(CDN_WHITELIST);

  it('clean html with no external resources -> []', () => {
    const html = '<!DOCTYPE html><html><head></head><body><canvas></canvas></body></html>';
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });

  it('finds a forbidden CDN url in src/href attributes', () => {
    const html = '<script src="https://evil.example.com/x.js"></script>';
    expect(findForbiddenUrls(html, allowed)).toEqual(['https://evil.example.com/x.js']);
  });

  it('whitelisted url is not flagged', () => {
    const html = `<script src="${CDN_WHITELIST.p5}"></script>`;
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });

  it('ignores relative paths and data: urls', () => {
    const html = '<img src="/local.png"><img src="data:image/png;base64,AAAA">';
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });

  it('catches ES-module static import of a forbidden url', () => {
    const html = `<script type="module">import * as X from 'https://evil.example.com/x.js';</script>`;
    expect(findForbiddenUrls(html, allowed)).toEqual(['https://evil.example.com/x.js']);
  });

  it('allows ES-module import of the whitelisted three.js module build', () => {
    const html = `<script type="module">import * as THREE from '${CDN_WHITELIST.three}';</script>`;
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });

  it('catches dynamic import() of a forbidden url', () => {
    const html = `<script>import("https://evil.example.com/mod.js").then(()=>{});</script>`;
    expect(findForbiddenUrls(html, allowed)).toEqual(['https://evil.example.com/mod.js']);
  });

  it('разрешает three.js addons из examples/jsm/', () => {
    const html = '<script type="module">import { OrbitControls } from ' +
      "'https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/controls/OrbitControls.js';</script>";
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });

  it('блокирует файл three.js вне build/ и examples/jsm/', () => {
    const url = 'https://cdn.jsdelivr.net/npm/three@0.164.0/src/Three.js';
    expect(findForbiddenUrls(`<script src="${url}"></script>`, allowed)).toEqual([url]);
  });

  it('allows katex fonts under the same directory as katex.min.css', () => {
    const fontUrl = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/fonts/KaTeX_Main-Regular.woff2';
    const html = `<style>@font-face{src:url('${fontUrl}');}</style><link href="${fontUrl}">`;
    // href= attribute form is what the scanner recognizes
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });
});

describe('stripRuntime + reinstrument', () => {
  const RAW = '<!DOCTYPE html><html><head><title>t</title></head><body>x</body></html>';

  it('stripRuntime removes a freshly instrumented block, leaving no marker', () => {
    const stripped = stripRuntime(instrument(RAW));
    expect(stripped).not.toContain('showmehow-runtime');
    expect(stripped).toContain('<title>t</title>');
    expect(stripped).toContain('<body>x</body>');
  });

  it('stripRuntime removes a LEGACY block (start marker, no closing marker)', () => {
    // легаси-форма: маркер + наши три тега без закрывающего маркера
    const legacy = '<!DOCTYPE html><html><head>' +
      '<!--showmehow-runtime--><script>/*h*/</script><style>.a{}</style><script>/*u*/</script>' +
      '<title>t</title></head><body>x</body></html>';
    const stripped = stripRuntime(legacy);
    expect(stripped).not.toContain('showmehow-runtime');
    expect(stripped).toContain('<title>t</title>');
  });

  it('stripRuntime keeps the artifact own external scripts', () => {
    const withCdn = '<!DOCTYPE html><html><head>' +
      '<script src="https://cdn.jsdelivr.net/npm/katex/katex.min.js"></script>' +
      '<title>t</title></head><body></body></html>';
    expect(stripRuntime(instrument(withCdn))).toContain('katex.min.js');
  });

  it('reinstrument is idempotent and yields exactly one current runtime block', () => {
    const once = reinstrument(RAW);
    expect(reinstrument(once)).toBe(once);
    // ровно один открывающий маркер
    expect(once.split('<!--showmehow-runtime-->').length - 1).toBe(1);
  });

  it('reinstrument upgrades a legacy-instrumented file to a single current block', () => {
    const legacy = '<!DOCTYPE html><html><head>' +
      '<!--showmehow-runtime--><script>/*old*/</script><style>.old{}</style><script>/*old*/</script>' +
      '<title>t</title></head><body></body></html>';
    const out = reinstrument(legacy);
    expect(out).not.toContain('/*old*/');
    expect(out.split('<!--showmehow-runtime-->').length - 1).toBe(1);
    expect(out).toContain('<!--/showmehow-runtime-->');
  });
});

describe('SimUI.panel', () => {
  it('UIKIT_JS defines a panel method and returns it from the factory', () => {
    expect(UIKIT_JS).toContain('function panel(');
    expect(UIKIT_JS).toContain('panel: panel');
  });
  it('UIKIT_DOC documents SimUI.panel and forbids hand-rolled panels', () => {
    expect(UIKIT_DOC).toContain('SimUI.panel');
    expect(UIKIT_DOC).toContain('position:fixed');
  });
  it('UIKIT_JS still parses after adding panel()', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
});

describe('SimUI.chart', () => {
  it('KIT_CHART_JS входит в UIKIT_JS и определяет chart', async () => {
    const { KIT_CHART_JS } = await import('@/lib/runtime/kit-chart');
    expect(UIKIT_JS).toContain(KIT_CHART_JS);
    expect(KIT_CHART_JS).toContain('K.chart = chart');
  });
  it('UIKIT_JS остаётся валидным JS', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
  it('UIKIT_CSS содержит стили графика', async () => {
    const { UIKIT_CSS } = await import('@/lib/runtime');
    expect(UIKIT_CSS).toContain('.sim-chart');
  });

  it('bounds() всегда конечен: сразу после создания, при равных y, и после clear()', async () => {
    const html = instrument(
      '<!DOCTYPE html><html><head></head><body><script>' +
        "var c = SimUI.chart({ title: 'т', mode: 'time', xRange: [0, 720] });" +
        'window.__b1 = c.__bounds();' +
        'c.push(1, 5); c.push(2, 5); c.push(3, 5);' +
        'window.__b2 = c.__bounds();' +
        'c.clear();' +
        'c.push(10, 20);' +
        'c.clear();' +
        'window.__b3 = c.__bounds();' +
        '</script></body></html>',
    );
    const session = await openSession(html);
    try {
      expect(session.loaded()).toBe(true);
      for (const name of ['__b1', '__b2', '__b3']) {
        const b = await session.evaluate<{ xmin: number; xmax: number; ymin: number; ymax: number }>(
          `window.${name}`,
        );
        expect(Number.isFinite(b.xmin)).toBe(true);
        expect(Number.isFinite(b.xmax)).toBe(true);
        expect(Number.isFinite(b.ymin)).toBe(true);
        expect(Number.isFinite(b.ymax)).toBe(true);
        expect(b.xmin).toBeLessThan(b.xmax);
        expect(b.ymin).toBeLessThan(b.ymax);
      }
      expect(session.errors()).toEqual([]);
    } finally {
      await session.close();
    }
  }, 20000);
});

describe('мост интроспекции __smh', () => {
  it('KIT_EXPOSE_JS входит в UIKIT_JS и определяет window.__smh', async () => {
    const { KIT_EXPOSE_JS } = await import('@/lib/runtime/kit-expose');
    expect(UIKIT_JS).toContain(KIT_EXPOSE_JS);
    expect(KIT_EXPOSE_JS).toContain('window.__smh');
    expect(KIT_EXPOSE_JS).toContain('SimUI.expose');
  });
  it('ядро кита ведёт реестр контролов и помечает кнопки паузы/сброса', async () => {
    const { KIT_CORE_JS } = await import('@/lib/runtime/kit-core');
    expect(KIT_CORE_JS).toContain('__register');
    expect(KIT_CORE_JS).toContain('__controls');
    expect(KIT_CORE_JS).toContain("data-smh-btn', 'playpause'");
    expect(KIT_CORE_JS).toContain("data-smh-btn', 'reset'");
  });
  it('весь UIKIT_JS остаётся валидным JS', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
  it('UIKIT_DOC требует SimUI.expose', async () => {
    const { UIKIT_DOC } = await import('@/lib/runtime');
    expect(UIKIT_DOC).toContain('SimUI.expose');
  });
});

describe('runtime module layout', () => {
  it('UIKIT_JS собирается из чанков и включает ядро кита', async () => {
    const { KIT_CORE_JS } = await import('@/lib/runtime/kit-core');
    expect(UIKIT_JS).toContain(KIT_CORE_JS);
  });
  it('HARNESS_JS живёт в отдельном модуле', async () => {
    const { HARNESS_JS } = await import('@/lib/runtime/harness');
    expect(HARNESS_JS).toContain('sim-error');
  });
  it('UIKIT_CSS живёт в отдельном модуле', async () => {
    const mod = await import('@/lib/runtime/kit-css');
    expect(mod.UIKIT_CSS).toContain('.sim-panel');
  });
});

afterAll(() => closeBrowser());
