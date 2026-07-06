import { describe, it, expect } from 'vitest';
import { extractHtml, extractJson, instrument } from '@/lib/artifact';

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
