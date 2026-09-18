import { describe, it, expect } from 'vitest';
import { renderMarkup, escapeHtml } from '@/lib/lms/markup';

describe('разметка урока', () => {
  it('абзацы, переносы строк, жирный и курсив', () => {
    expect(renderMarkup('Первый **важный** абзац\nс *переносом*.\n\nВторой.')).toBe(
      '<p>Первый <strong>важный</strong> абзац<br>с <em>переносом</em>.</p>\n<p>Второй.</p>');
  });
  it('заголовок и список', () => {
    expect(renderMarkup('## Период\n- длина нити\n- ускорение *g*\nИтог')).toBe(
      '<h3>Период</h3>\n<ul><li>длина нити</li><li>ускорение <em>g</em></li></ul>\n<p>Итог</p>');
  });
  it('ссылки: http(s) и путь сайта, всегда в новой вкладке', () => {
    expect(renderMarkup('[Учебник](https://example.com/a?b=1&c=2)')).toBe(
      '<p><a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">Учебник</a></p>');
    expect(renderMarkup('[Лаборатория](/lab/physics)')).toContain('href="/lab/physics"');
  });
  it('пустой ввод — пустая строка', () => {
    expect(renderMarkup('')).toBe('');
    expect(renderMarkup('\n\n  \n')).toBe('');
  });
});

describe('разметка не пропускает XSS', () => {
  const cases = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '**<svg onload=alert(1)>**',
    '## <iframe src="javascript:alert(1)">',
    '- <a href="javascript:alert(1)">x</a>',
  ];
  for (const input of cases) {
    it(`экранирует ${input}`, () => {
      const html = renderMarkup(input);
      expect(html).not.toMatch(/<(script|img|svg|iframe)\b/i);
      expect(html).not.toMatch(/<a\s+href="javascript/i);
    });
  }
  it('ссылки с опасной схемой остаются текстом', () => {
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example']) {
      expect(renderMarkup(`[жми](${url})`)).not.toContain('<a ');
    }
  });
  it('кавычка в адресе не выходит из атрибута', () => {
    const html = renderMarkup('[x](https://a.example/"onmouseover="alert(1))');
    expect(html).not.toMatch(/"\s*onmouseover=/i);
    expect(html).toContain('&quot;');
  });
  it('escapeHtml экранирует пять символов', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});
