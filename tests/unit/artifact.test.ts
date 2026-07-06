import { describe, it, expect } from 'vitest';
import { extractHtml, extractJson, instrument } from '@/lib/artifact';
import { UIKIT_JS } from '@/lib/runtime';

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
