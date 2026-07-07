import { describe, it, expect } from 'vitest';
import { extractHtml, extractJson, findForbiddenUrls, instrument } from '@/lib/artifact';
import { UIKIT_JS } from '@/lib/runtime';
import { CDN_WHITELIST } from '@/lib/pipeline/prompts';

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

describe('instrument', () => {
  it('injects runtime after <head> and is idempotent', () => {
    const html = '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>';
    const once = instrument(html);
    expect(once).toContain('showmehow-runtime');
    expect(once.indexOf('showmehow-runtime')).toBeLessThan(once.indexOf('<title>'));
    expect(instrument(once)).toBe(once);
  });
  it('prepends runtime when no head tag', () => {
    const out = instrument('<html><body>x</body></html>');
    expect(out).toContain('showmehow-runtime');
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

  it('blocks a three.js file outside the whitelisted build/ directory', () => {
    const html = '<script type="module">import { OrbitControls } from ' +
      "'https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/controls/OrbitControls.js';</script>";
    expect(findForbiddenUrls(html, allowed)).toEqual(
      ['https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/controls/OrbitControls.js'],
    );
  });

  it('allows katex fonts under the same directory as katex.min.css', () => {
    const fontUrl = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/fonts/KaTeX_Main-Regular.woff2';
    const html = `<style>@font-face{src:url('${fontUrl}');}</style><link href="${fontUrl}">`;
    // href= attribute form is what the scanner recognizes
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });
});
