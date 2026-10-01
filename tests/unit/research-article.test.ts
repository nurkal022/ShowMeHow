import { describe, expect, it } from 'vitest';
import {
  aiDisclosure, bibliography, checkArticle, citationOrder, figureOrder, formatCitation, formatReference, fromCrossref,
  newArticleDoc, normalizeDoi, parseBibtex, referenceKey, stripUnknownCitations, toBibtex, unknownCitations, wordCount,
  type Reference,
} from '@/lib/research/article';
import { renderArticleHtml, renderGraphicalAbstract, wordDiff } from '@/lib/research/article-render';
import { sanitizeDraft } from '@/lib/research/writer';

const ref = (id: string, family: string, year: number, extra: Partial<Reference> = {}): Reference => ({
  id, type: 'article', authors: [{ family, given: 'Ivan Petrovich' }], title: `Paper by ${family}`, container: 'Phys. Rev. B',
  year, volume: '10', issue: '2', pages: '100–110', publisher: '', doi: `10.1000/${id}`, url: '', ...extra,
});

describe('нумерация рисунков и цитат', () => {
  const sections = [
    { body: 'Как видно на [[fig:b]], и ранее [@smith; @lee].\n\n{{fig:a}}' },
    { body: '{{fig:b}}\n\nСм. [@lee] и [@ghost].' },
  ];
  const refs = [ref('lee', 'Lee', 2020), ref('smith', 'Smith', 2019), ref('old', 'Old', 1990)];
  it('рисунки и источники — по первому появлению', () => {
    expect(figureOrder(sections)).toEqual(['b', 'a']);
    expect(citationOrder(sections, refs)).toEqual(['smith', 'lee']);
  });
  it('номера сворачиваются в диапазон, APA — автор и год', () => {
    const order = ['a', 'b', 'c', 'd'];
    const r4 = ['a', 'b', 'c', 'd'].map((k, i) => ref(k, `F${k}`, 2000 + i));
    expect(formatCitation(['a', 'b', 'c'], r4, order, 'ieee')).toBe('[1–3]');
    expect(formatCitation(['a', 'd'], r4, order, 'gost')).toBe('[1, 4]');
    expect(formatCitation(['smith'], refs, [], 'apa')).toBe('(Smith, 2019)');
  });
  it('выдуманные ключи ловятся и вычищаются', () => {
    expect(unknownCitations(sections[1].body, refs)).toEqual(['ghost']);
    expect(stripUnknownCitations('Известно [@ghost]. Также [@lee; @nope].', refs)).toBe('Известно. Также [@lee].');
  });
  it('черновик модели: чужие рисунки и ссылки вырезаются', () => {
    const out = sanitizeDraft('# Итог\n\n{{fig:zzz}}\n\nНа [[fig:zzz]] и [[fig:a]] видно [@fake].', refs, ['a']);
    expect(out).not.toContain('zzz');
    expect(out).toContain('[[fig:a]]');
    expect(out).toContain('[[TODO: рисунок]]');
    expect(out).toContain('## Итог');
    expect(out).not.toContain('@fake');
  });
});

describe('оформление литературы', () => {
  const r = ref('ivanov2021', 'Иванов', 2021, { authors: [{ family: 'Иванов', given: 'Андрей Борисович' }, { family: 'Петров', given: 'В.' }] });
  it('ГОСТ, APA, IEEE, Vancouver', () => {
    expect(formatReference(r, 'gost')).toContain('Иванов А. Б., Петров В.');
    expect(formatReference(r, 'gost')).toContain('// Phys. Rev. B. 2021. Т. 10, № 2. С. 100–110.');
    expect(formatReference(r, 'apa')).toMatch(/^Иванов, А\. Б\., & Петров, В\. \(2021\)/);
    expect(formatReference(r, 'ieee')).toContain('vol. 10, no. 2, pp. 100–110, 2021.');
    expect(formatReference(r, 'vancouver')).toContain('Иванов АБ, Петров В');
  });
  it('список — в порядке цитирования, непроцитированные в конце', () => {
    const doc = { ...newArticleDoc(), references: [ref('x', 'X', 2020), ref('y', 'Y', 2021)], sections: [{ id: '1', key: 'introduction' as const, title: 'I', body: '[@y]' }] };
    expect(bibliography(doc).map((b) => b.id)).toEqual(['y', 'x']);
  });
  it('BibTeX туда и обратно, ключи и DOI', () => {
    const bib = toBibtex([r]);
    const back = parseBibtex(bib);
    expect(back[0].id).toBe('ivanov2021');
    expect(back[0].authors[0]).toEqual({ family: 'Иванов', given: 'Андрей Борисович' });
    expect(back[0].pages).toBe('100–110');
    expect(referenceKey({ authors: [{ family: 'Lee', given: '' }], year: 2020, title: '' }, ['lee2020'])).toBe('lee2020a');
    expect(normalizeDoi('https://doi.org/10.1103/PhysRevLett.116.061102.')).toBe('10.1103/PhysRevLett.116.061102');
    expect(normalizeDoi('просто текст')).toBeNull();
  });
  it('разбирает ответ Crossref', () => {
    const r2 = fromCrossref({ type: 'journal-article', title: ['Observation of Gravitational Waves'], author: [{ family: 'Abbott', given: 'B. P.' }],
      'container-title': ['Physical Review Letters'], issued: { 'date-parts': [[2016, 2, 11]] }, volume: '116', issue: '6', DOI: '10.1103/PhysRevLett.116.061102', abstract: '<jats:p>On September 14…</jats:p>' });
    expect(r2.year).toBe(2016);
    expect(r2.container).toBe('Physical Review Letters');
    expect(r2.abstract).toBe('On September 14…');
  });
});

describe('проверки и заявление об ИИ', () => {
  it('находит пустые разделы, рисунок без ссылки и выдуманную цитату', () => {
    const doc = newArticleDoc();
    doc.sections[0].body = '{{fig:a}}\n\nТекст [@ghost].';
    const texts = checkArticle(doc, ['a']).map((i) => i.text).join('\n');
    expect(texts).toContain('Не указаны авторы');
    expect(texts).toContain('нет ссылки в тексте');
    expect(texts).toContain('ghost');
  });
  it('заявление перечисляет только принятое', () => {
    expect(aiDisclosure([], 'en')).toMatch(/No generative AI/);
    const text = aiDisclosure([
      { at: '', action: 'translate', sectionId: null, outcome: 'accepted', chars: 10 },
      { at: '', action: 'draft', sectionId: null, outcome: 'rejected', chars: 0 },
    ], 'ru');
    expect(text).toContain('перевод');
    expect(text).not.toContain('черновики');
  });
  it('счёт слов не считает разметку', () => {
    expect(wordCount('Два слова {{fig:a}} [@x] $E=mc^2$')).toBe(2);
  });
});

describe('предпросмотр и абстракт', () => {
  it('рисует рисунки, ссылки, цитаты и экранирует ввод', () => {
    const doc = newArticleDoc();
    doc.references = [ref('lee', 'Lee', 2020)];
    doc.sections[0].body = 'На [[fig:a]] <script>x</script> [@lee] [[TODO: число]]\n\n{{fig:a}}';
    const html = renderArticleHtml({ title: 'T', doc, figures: { a: { title: 'Рис', caption: 'Подпись', svg: '<svg></svg>' } } });
    expect(html).toContain('рис. 1');
    expect(html).toContain('[1]');
    expect(html).toContain('<b>Рис. 1.</b>');
    expect(html).toContain('ar-todo');
    expect(html).not.toContain('<script>');
  });
  it('сравнение по словам', () => {
    const d = wordDiff('быстрая рыжая лиса', 'быстрая серая лиса');
    expect(d.filter((p) => p.kind === 'del').map((p) => p.text.trim())).toEqual(['рыжая']);
    expect(d.filter((p) => p.kind === 'add').map((p) => p.text.trim())).toEqual(['серая']);
  });
  it('графический абстракт — SVG с шагами и вложенным рисунком', () => {
    const svg = renderGraphicalAbstract({ headline: 'H <b>', steps: [{ label: 'A', detail: 'd' }, { label: 'B', detail: 'e' }], takeaway: 'T', figureId: 'x' },
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>');
    expect(svg).toContain('H &lt;b&gt;');
    expect(svg).toContain('viewBox="0 0 10 10"');
  });
});

describe('подписи на картинке', () => {
  it('остатки LaTeX превращаются в Юникод', async () => {
    const { plainText } = await import('@/lib/research/article-render');
    expect(plainText('Получено $R^2 = 0.9999$, $a \\cdot \\exp(b x)$, $\\sigma$')).toBe('Получено R² = 0.9999, a · exp(b x), σ');
  });
});

describe('формулы для Word', () => {
  it('дроби, корни, индексы и греческие буквы', async () => {
    const { plainText } = await import('@/lib/research/article-render');
    expect(plainText('\\chi^2/\\nu = \\frac{1}{2}, \\sigma_U, x_{0}, \\sqrt{a}, b \\pm 0.1')).toBe('χ²/ν = 1/2, σ_U, x₀, √(a), b ± 0.1');
  });
});

describe('короткие ссылки на рисунки в редакторе', () => {
  it('туда и обратно, неоднозначный префикс не сокращается', async () => {
    const { shortFigIds, fullFigIds } = await import('@/lib/research/article');
    const a = 'eaa25eab-a04f-49c4-9ef9-bb0e62ea03d2';
    const b = '1234abcd-0000-4000-8000-000000000001';
    const c = '1234abcd-0000-4000-8000-000000000002';
    const text = `{{fig:${a}}} и [[fig:${a}]], [[fig:${b}]]`;
    const short = shortFigIds(text, [a, b, c]);
    expect(short).toBe(`{{fig:eaa25eab}} и [[fig:eaa25eab]], [[fig:${b}]]`);
    expect(fullFigIds(short, [a, b, c])).toBe(text);
    expect(fullFigIds('[[fig:deadbeef]]', [a])).toBe('[[fig:deadbeef]]');
  });
});
