import { describe, expect, it } from 'vitest';
import { crc32, zip } from '@/lib/research/zip';
import { articleBlocks, buildDocx, inlineTokens } from '@/lib/research/docx';
import { buildLatex, buildLatexZip, latexEscape } from '@/lib/research/latex';
import { modelNotebook, plotNotebook, toNumpy } from '@/lib/research/notebook';
import { figureSize, figureWarnings, JOURNAL_FIGURES } from '@/lib/research/journals';
import { newArticleDoc, type ArticleDoc, type Reference } from '@/lib/research/article';
import { buildPlot, newModelDoc, newPlotDoc } from '@/lib/research/doc';

/** Разбор своего же ZIP (метод STORE): центральный каталог → имена и содержимое. */
function unzip(buf: Uint8Array): { entries: Map<string, Uint8Array>; crcs: Map<string, number> } {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  expect(v.getUint32(eocd, true)).toBe(0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries = new Map<string, Uint8Array>();
  const crcs = new Map<string, number>();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    expect(v.getUint16(p + 8, true) & 0x0800).toBe(0x0800);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const off = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    expect(v.getUint32(off, true)).toBe(0x04034b50);
    const localName = v.getUint16(off + 26, true);
    const extra = v.getUint16(off + 28, true);
    const data = buf.subarray(off + 30 + localName + extra, off + 30 + localName + extra + size);
    expect(crc32(data)).toBe(crc);
    entries.set(name, data);
    crcs.set(name, crc);
    p += 46 + nameLen;
  }
  return { entries, crcs };
}

const text = (u: Uint8Array | undefined) => new TextDecoder().decode(u);

const ref = (id: string, family: string, year: number): Reference => ({
  id, type: 'article', authors: [{ family, given: 'Ivan' }], title: `Paper of ${family}`, container: 'Phys. Rev.',
  year, volume: '1', issue: '2', pages: '3–4', publisher: '', doi: '', url: '',
});

function article(): ArticleDoc {
  const doc = newArticleDoc('experimental', 'ru');
  doc.authors = [{ name: 'Иванов И. И.', affiliation: 'КазНУ', orcid: '0000-0001-2345-6789', email: 'ivanov@kaznu.kz', corresponding: true }];
  doc.abstract = { ru: 'Измерена ёмкость & сопротивление <R>.', en: 'Capacitance was measured.' };
  doc.keywords = { ru: 'конденсатор, RC-цепь' };
  doc.references = [ref('b', 'Brown', 2022), ref('a', 'Adams', 2021), ref('c', 'Clark', 2020)];
  doc.sections[0].body = 'Известно [@a; @b], что **напряжение** падает *экспоненциально*, $U = U_0 e^{-t/\\tau}$, 50% & A_1.\n\n## Подраздел\n\n- первый пункт\n- второй';
  doc.sections[1].body = 'Схема на [[fig:f2]].\n\n{{fig:f1}}\n\n{{fig:f2}}\n\n$$E = mc^2$$\n\nСм. [@c].';
  return doc;
}

describe('ZIP', () => {
  it('CRC32 совпадает с эталоном', () => {
    expect(crc32('hello')).toBe(0x3610a686);
  });
  it('пишет локальные заголовки и центральный каталог, которые читаются обратно', () => {
    const out = zip([{ name: 'a.txt', data: 'hello' }, { name: 'папка/рис.png', data: new Uint8Array([1, 2, 3]) }]);
    expect(new DataView(out.buffer).getUint32(0, true)).toBe(0x04034b50);
    const { entries, crcs } = unzip(out);
    expect([...entries.keys()]).toEqual(['a.txt', 'папка/рис.png']);
    expect(text(entries.get('a.txt'))).toBe('hello');
    expect(crcs.get('a.txt')).toBe(0x3610a686);
    expect([...entries.get('папка/рис.png')!]).toEqual([1, 2, 3]);
  });
});

describe('разметка статьи', () => {
  it('делит текст на блоки', () => {
    const b = articleBlocks('Абзац\nпродолжение\n\n## Под\n- a\n- b\n{{fig:x}}\n$$a+b$$');
    expect(b.map((x) => x.t)).toEqual(['p', 'h2', 'list', 'fig', 'math']);
    expect(b[0]).toEqual({ t: 'p', text: 'Абзац продолжение' });
  });
  it('находит жирный, курсив, формулы и цитаты, не путая одинокую звёздочку', () => {
    const t = inlineTokens('**Ж** и *к* и $x*y$ и a * b [@k1; @k2] [[fig:f]]');
    expect(t.filter((x) => x.t === 'text' && x.b).map((x) => (x as { s: string }).s)).toEqual(['Ж']);
    expect(t.find((x) => x.t === 'math')).toMatchObject({ s: 'x*y' });
    expect(t.find((x) => x.t === 'cite')).toMatchObject({ keys: ['k1', 'k2'] });
    expect(t.find((x) => x.t === 'figref')).toMatchObject({ id: 'f' });
    expect(t.some((x) => x.t === 'text' && x.s.includes('a * b'))).toBe(true);
  });
});

describe('Word', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const out = buildDocx({
    title: 'RC & цепь', doc: article(),
    figures: { f2: { png, widthPx: 760, heightPx: 480, title: 'Схема', caption: 'Схема установки' } },
  });
  const { entries } = unzip(out);
  const xml = text(entries.get('word/document.xml'));

  it('содержит все части пакета', () => {
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml', 'word/media/fig1.png']) {
      expect(entries.has(n), n).toBe(true);
    }
    expect(text(entries.get('word/styles.xml'))).toContain('Times New Roman');
  });
  it('экранирует XML', () => {
    expect(xml).toContain('RC &amp; цепь');
    expect(xml).toContain('&lt;R&gt;');
    expect(xml).not.toMatch(/<R>/);
  });
  it('нумерует рисунки по первому появлению и подписывает их', () => {
    // f2 упомянут раньше, чем f1 вставлен, — значит он «Рис. 1».
    expect(xml).toContain('рис. 1');
    expect(xml).toContain('Рис. 1. ');
    expect(xml).toContain('Схема установки');
    expect(xml).toContain('Рис. 2. ');
    expect(xml).toContain('[рисунок недоступен]');
    expect(xml).toContain('r:embed="rIdImg1"');
    // 760 px шире 16 см — сжато до 16 см по ширине с сохранением пропорций.
    expect(xml).toContain('cx="5760000" cy="3637895"');
  });
  it('оформляет цитаты и список литературы', () => {
    expect(xml).toContain('[1, 2]');
    expect(xml).toContain('[3]');
    expect(xml).toContain('Список литературы');
    expect(xml).toContain('Заявление об использовании ИИ');
    expect(xml).toContain('<w:t xml:space="preserve">напряжение</w:t>');
  });
});

describe('LaTeX', () => {
  it('экранирует текст, но не формулы', () => {
    expect(latexEscape('50% & A_1 #')).toBe('50\\% \\& A\\_1 \\#');
    const { tex, bib } = buildLatex({ title: 'RC_цепь', doc: article(), figures: { f1: { fileBase: 'fig-1', title: 'Разряд', caption: '' } } }, 'article');
    expect(tex).toContain('50\\% \\& A\\_1');
    expect(tex).toContain('$U = U_0 e^{-t/\\tau}$');
    expect(tex).toContain('\\title{RC\\_цепь}');
    expect(tex).toContain('\\textbf{напряжение}');
    expect(tex).toContain('\\emph{экспоненциально}');
    expect(tex).toContain('\\subsection{Подраздел}');
    expect(tex).toContain('\\begin{itemize}');
    expect(tex).toContain('\\begin{equation*}');
    expect(tex).toContain('~\\cite{a,b}');
    expect(tex).toContain('рис.~\\ref{fig:f2}');
    expect(tex).toMatch(/\\begin\{figure\}[\s\S]*\\includegraphics\[width=\\linewidth\]\{figures\/fig-1\.png\}[\s\S]*\\caption\{Разряд\}[\s\S]*\\label\{fig:f1\}/);
    expect(tex).toContain('\\bibliographystyle{unsrt}');
    expect(tex).toContain('[english,russian]{babel}');
    expect(bib).toContain('@article{a,');
  });
  it('собирает шаблоны журналов', () => {
    const doc = article();
    expect(buildLatex({ title: 'T', doc, figures: {} }, 'elsarticle').tex).toMatch(/\\begin\{frontmatter\}[\s\S]*\\address\[a1\]\{КазНУ\}[\s\S]*\\begin\{keyword\}/);
    expect(buildLatex({ title: 'T', doc, figures: {} }, 'ieeetran').tex).toContain('\\documentclass[conference]{IEEEtran}');
    expect(buildLatex({ title: 'T', doc, figures: {} }, 'mdpi-like').tex).toContain('{geometry}');
  });
  it('упаковывает проект для Overleaf', () => {
    const { entries } = unzip(buildLatexZip({ title: 'T', doc: article(), figures: { f1: { fileBase: 'fig-1', title: 'a', caption: 'b', png: new Uint8Array([1]), svg: '<svg/>' } } }, 'article'));
    expect([...entries.keys()].sort()).toEqual(['README.txt', 'figures/fig-1.png', 'figures/fig-1.svg', 'main.tex', 'refs.bib']);
  });
});

describe('Jupyter', () => {
  it('переводит формулы в numpy', () => {
    expect(toNumpy('a*exp(-b*x) + c')).toBe('a * np.exp(-b * x) + c');
    expect(toNumpy('x^2')).toBe('x**2');
    expect(toNumpy('-x^2')).toBe('-x**2');
    expect(toNumpy('(-x)^2')).toBe('(-x)**2');
    expect(toNumpy('2^3^2')).toBe('2**3**2');
    expect(toNumpy('(a^b)^c')).toBe('(a**b)**c');
    expect(toNumpy('a - (b - c)')).toBe('a - (b - c)');
    expect(toNumpy('a/(b*c)')).toBe('a / (b * c)');
    expect(toNumpy('ln(x) + log10(x) + sqrt(pi)')).toBe('np.log(x) + np.log10(x) + np.sqrt(np.pi)');
    expect(toNumpy('step(t) * asin(x)')).toBe('np.heaviside(t, 1.0) * np.arcsin(x)');
    expect(toNumpy('lambda*x')).toBe('lambda_ * x');
  });
  it('даёт валидный блокнот nbformat 4 для графика', () => {
    const nb = JSON.parse(plotNotebook(newPlotDoc(), 'Разряд'));
    expect(nb.nbformat).toBe(4);
    const code = nb.cells.map((c: { source: string[] }) => c.source.join('')).join('\n');
    expect(code).toContain('curve_fit(model1');
    expect(code).toContain('return a * np.exp(b * x)');
    expect(code).toContain('absolute_sigma=True');
    expect(code).toContain('"t, с"');
  });
  it('даёт блокноты для моделей: формула и ОДУ', () => {
    const fn = JSON.parse(modelNotebook(newModelDoc('function'), 'Колебания'));
    const fnCode = fn.cells.map((c: { source: string[] }) => c.source.join('')).join('\n');
    expect(fnCode).toContain('interact(draw');
    expect(fnCode).toContain('t = np.linspace(0, 10, 600)');
    expect(fnCode).toContain('A * np.exp(-g * t) * np.cos(w * t)');
    const ode = JSON.parse(modelNotebook(newModelDoc('ode'), 'ЛВ'));
    const odeCode = ode.cells.map((c: { source: string[] }) => c.source.join('')).join('\n');
    expect(ode.nbformat).toBe(4);
    expect(odeCode).toContain('solve_ivp(rhs, (0, 50), [10, 10]');
    expect(odeCode).toContain('return [a * x - b * x * y, -c * y + d * x * y]');
  });
});

describe('размеры рисунков для журналов', () => {
  const elsevier = JOURNAL_FIGURES.find((p) => p.key === 'elsevier')!;
  it('считает пиксели и масштаб PNG', () => {
    expect(figureSize(elsevier, 'single')).toEqual({ widthPx: 340, heightPx: 211, scale: 6.25 });
    expect(figureSize(elsevier, 'double').widthPx).toBe(718);
    const slide = JOURNAL_FIGURES.find((p) => p.key === 'slide')!;
    expect(figureSize(slide, 'single', 0.5625)).toEqual({ widthPx: 1280, heightPx: 720, scale: 2 });
  });
  it('предупреждает о цвете и названии внутри рисунка', () => {
    const spec = buildPlot(newPlotDoc()).spec;
    const w = figureWarnings({ ...spec, curves: [...(spec.curves ?? []), { label: 'b', points: [] }] }, elsevier);
    expect(w.some((s) => s.includes('цветом'))).toBe(true);
    expect(w.some((s) => s.includes('Название'))).toBe(true);
    expect(figureWarnings({ ...spec, title: '', style: 'paper' }, elsevier)).toEqual([]);
  });
});
