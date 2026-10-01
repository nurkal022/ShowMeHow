import { aiDisclosure, figureOrder, figWord, toBibtex, type ArticleDoc, type ArticleLang, type CitationStyle } from './article';
import { abstractLangs, affiliations, articleBlocks, EXPORT_LABELS, inlineTokens } from './docx';
import { zip } from './zip';

/**
 * Статья → LaTeX-проект (main.tex + refs.bib + figures/) для Overleaf.
 * Международные журналы (Elsevier, IEEE, MDPI) принимают исходники LaTeX, а класс
 * журнала задаёт вёрстку — наша задача дать чистый текст с верной структурой:
 * разделы, рисунки с \label, цитаты через \cite и BibTeX, а не набранный руками список.
 */

export type LatexTemplate = 'article' | 'elsarticle' | 'ieeetran' | 'mdpi-like';

export const LATEX_TEMPLATES: { key: LatexTemplate; label: string }[] = [
  { key: 'article', label: 'Обычная статья (article)' },
  { key: 'elsarticle', label: 'Elsevier (elsarticle)' },
  { key: 'ieeetran', label: 'IEEE конференция (IEEEtran)' },
  { key: 'mdpi-like', label: 'В духе MDPI (article + поля)' },
];

export interface LatexFigure { fileBase: string; title: string; caption: string }

export interface LatexInput { title: string; doc: ArticleDoc; figures: Record<string, LatexFigure> }

export interface LatexZipFigure extends LatexFigure { png: Uint8Array; svg?: string }

export interface LatexZipInput { title: string; doc: ArticleDoc; figures: Record<string, LatexZipFigure> }

/** Символы, которые LaTeX воспринимает как команды, и типичный Юникод, которого нет в pdfLaTeX. */
const UNICODE_TEXT: Record<string, string> = {
  '±': '$\\pm$', '×': '$\\times$', '·': '$\\cdot$', '≈': '$\\approx$', '≤': '$\\leq$', '≥': '$\\geq$', '≠': '$\\neq$',
  '→': '$\\rightarrow$', '−': '$-$', '°': '\\textdegree{}', '²': '\\textsuperscript{2}', '³': '\\textsuperscript{3}',
  '∞': '$\\infty$', 'µ': '$\\mu$', '′': '$\\prime$', '’': "'", '‘': '`',
};
const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa',
  λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'varphi', χ: 'chi',
  ψ: 'psi', ω: 'omega', Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
};

/** Экранирование обычного текста (не формул). */
export function latexEscape(s: string): string {
  return s
    .replace(/\\/g, '\u0000')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\u0000/g, '\\textbackslash{}')
    .replace(/[±×·≈≤≥≠→−°²³∞µ′’‘]/g, (c) => UNICODE_TEXT[c])
    .replace(/[α-ωΑ-Ω]/g, (c) => (GREEK[c] ? `$\\${GREEK[c]}$` : c));
}

/** Внутри формулы экранировать нечего, но греческие буквы Юникодом pdfLaTeX не понимает. */
function mathText(s: string): string {
  return s.replace(/[α-ωΑ-Ω]/g, (c) => (GREEK[c] ? `\\${GREEK[c]} ` : c)).replace(/[±×·≈≤≥≠→−∞]/g, (c) => UNICODE_TEXT[c].replace(/\$/g, '') + ' ');
}

function bibStyle(style: CitationStyle, template: LatexTemplate): string {
  if (template === 'ieeetran') return 'IEEEtran';
  if (style === 'apa') return template === 'elsarticle' ? 'elsarticle-harv' : 'apalike';
  return style === 'ieee' ? 'ieeetr' : 'unsrt';
}

const BABEL: Record<ArticleLang, string> = { ru: 'russian', kk: 'kazakh', en: 'english' };

export function buildLatex(input: LatexInput, template: LatexTemplate): { tex: string; bib: string } {
  const { doc } = input;
  const lang = doc.lang;
  const L = EXPORT_LABELS[lang];
  const figOrder = figureOrder(doc.sections);
  // Цитируем только то, что есть в refs.bib: иначе BibTeX поставит «?» в текст.
  const known = new Set(doc.references.map((r) => r.id));

  const inline = (s: string) => inlineTokens(s).map((tk) => {
    let out: string;
    switch (tk.t) {
      case 'text': out = latexEscape(tk.s); break;
      case 'math': out = `$${mathText(tk.s)}$`; break;
      case 'figref': out = `${figWord(lang)}~\\ref{fig:${tk.id}}`; break;
      case 'cite': {
        const keys = tk.keys.filter((k) => known.has(k));
        out = keys.length ? `~\\cite{${keys.join(',')}}` : '';
        break;
      }
    }
    if (tk.i && tk.t !== 'math') out = `\\emph{${out}}`;
    if (tk.b) out = `\\textbf{${out}}`;
    return out;
  }).join('').replace(/ ~\\cite/g, '~\\cite').replace(/^~\\cite/, '\\cite');

  const blocks = (body: string): string => articleBlocks(body).map((b) => {
    switch (b.t) {
      case 'p': return inline(b.text);
      case 'h2': return `\\subsection{${inline(b.text)}}`;
      case 'list': return `\\begin{itemize}\n${b.items.map((it) => `  \\item ${inline(it)}`).join('\n')}\n\\end{itemize}`;
      case 'math': return `\\begin{equation*}\n  ${mathText(b.tex)}\n\\end{equation*}`;
      case 'fig': {
        const f = input.figures[b.id];
        const n = figOrder.indexOf(b.id) + 1;
        const graphic = f
          ? `\\includegraphics[width=\\linewidth]{figures/${f.fileBase}.png}`
          : `\\fbox{\\parbox{0.9\\linewidth}{\\centering ${latexEscape(`${figWord(lang, true)} ${n}: ${L.missingFigure}`)}}}`;
        const caption = f ? inline(f.caption.trim() || f.title.trim()) : latexEscape(`[${L.missingFigure}]`);
        return `\\begin{figure}[htbp]\n  \\centering\n  ${graphic}\n  \\caption{${caption}}\n  \\label{fig:${b.id}}\n\\end{figure}`;
      }
    }
  }).join('\n\n');

  const authors = doc.authors.filter((a) => a.name.trim());
  const affs = affiliations(doc);
  const title = latexEscape(input.title.trim() || '—');
  const langs = abstractLangs(doc);
  const mainAbstract = doc.abstract[lang]?.trim() ?? '';
  const keywords = (l: ArticleLang) => (doc.keywords[l] ?? '').split(/[;,]/).map((k) => k.trim()).filter(Boolean);
  // Аннотации на других языках (ru/kk статьи требуют три языка) — отдельными абзацами после основной.
  const otherAbstracts = langs.filter((l) => l !== lang).map((l) => {
    const LL = EXPORT_LABELS[l];
    const kw = keywords(l);
    return `\\noindent\\textbf{${latexEscape(LL.abstract)}.} ${inline(doc.abstract[l]!.trim())}${kw.length ? `\n\n\\noindent\\textbf{${latexEscape(LL.keywords)}:} ${kw.map(latexEscape).join(', ')}` : ''}`;
  });

  // Основной язык babel — последний в списке; английский нужен всегда (источники, ключевые слова).
  const babel = [...new Set<ArticleLang>([...langs, 'en' as ArticleLang].filter((l) => l !== lang)), lang].map((l) => BABEL[l]).join(',');
  const common = [
    '\\usepackage[T2A,T1]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    `\\usepackage[${babel}]{babel}`,
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{graphicx}',
    '\\usepackage{textcomp}',
  ];

  const head: string[] = [];
  const front: string[] = [];
  const kwMain = keywords(lang);

  if (template === 'elsarticle') {
    head.push('\\documentclass[preprint,12pt]{elsarticle}', ...common, '\\usepackage{hyperref}', `\\journal{${latexEscape(doc.journal && doc.journal !== 'generic' ? doc.journal : 'Journal')}}`);
    front.push('\\begin{frontmatter}', `\\title{${title}}`);
    authors.forEach((a) => {
      const idx = affs.indexOf(a.affiliation.trim());
      front.push(`\\author${idx >= 0 ? `[a${idx + 1}]` : ''}{${latexEscape(a.name.trim())}${a.corresponding ? '\\corref{cor1}' : ''}}`);
      if (a.email.trim()) front.push(`\\ead{${latexEscape(a.email.trim())}}`);
    });
    if (authors.some((a) => a.corresponding)) front.push(`\\cortext[cor1]{${latexEscape(L.corresponding)}}`);
    affs.forEach((aff, k) => front.push(`\\address[a${k + 1}]{${latexEscape(aff)}}`));
    if (mainAbstract) front.push(`\\begin{abstract}\n${inline(mainAbstract)}\n\\end{abstract}`);
    if (kwMain.length) front.push(`\\begin{keyword}\n${kwMain.map(latexEscape).join(' \\sep ')}\n\\end{keyword}`);
    front.push('\\end{frontmatter}');
    front.push(...otherAbstracts);
  } else if (template === 'ieeetran') {
    head.push('\\documentclass[conference]{IEEEtran}', ...common, '\\usepackage{cite}');
    front.push(`\\title{${title}}`);
    if (authors.length) {
      front.push(`\\author{${authors.map((a) => `\\IEEEauthorblockN{${latexEscape(a.name.trim())}${a.corresponding ? '*' : ''}}\n\\IEEEauthorblockA{${[a.affiliation, a.email, a.orcid ? `ORCID: ${a.orcid}` : ''].map((x) => x.trim()).filter(Boolean).map(latexEscape).join(' \\\\\n')}}`).join('\n\\and\n')}}`);
    }
    front.push('\\maketitle');
    if (mainAbstract) front.push(`\\begin{abstract}\n${inline(mainAbstract)}\n\\end{abstract}`);
    if (kwMain.length) front.push(`\\begin{IEEEkeywords}\n${kwMain.map(latexEscape).join(', ')}\n\\end{IEEEkeywords}`);
    front.push(...otherAbstracts);
  } else {
    head.push(`\\documentclass[${template === 'mdpi-like' ? '10pt' : '12pt'},a4paper]{article}`, ...common);
    if (template === 'mdpi-like') head.push('\\usepackage[a4paper,left=2.5cm,right=2.5cm,top=2cm,bottom=2cm]{geometry}', '\\usepackage{lineno}', '\\linenumbers');
    else head.push('\\usepackage[a4paper,left=3cm,right=1.5cm,top=2cm,bottom=2cm]{geometry}', '\\linespread{1.5}');
    head.push('\\usepackage{hyperref}');
    front.push(`\\title{${title}}`);
    const authorLine = authors.map((a) => {
      const idx = affs.indexOf(a.affiliation.trim());
      const sup = [affs.length > 1 && idx >= 0 ? String(idx + 1) : '', a.corresponding ? '*' : ''].filter(Boolean).join(',');
      return `${latexEscape(a.name.trim())}${sup ? `\\textsuperscript{${sup}}` : ''}`;
    }).join(', ');
    const affLines = affs.map((aff, k) => `${affs.length > 1 ? `\\textsuperscript{${k + 1}}` : ''}${latexEscape(aff)}`);
    const corr = authors.find((a) => a.corresponding && a.email.trim());
    const orcids = authors.filter((a) => a.orcid.trim()).map((a) => `${latexEscape(a.name.trim())} --- ${latexEscape(a.orcid.trim())}`);
    front.push(`\\author{${[authorLine, ...affLines.map((l) => `\\small ${l}`), orcids.length ? `\\small ORCID: ${orcids.join('; ')}` : '', corr ? `\\small *${latexEscape(L.corresponding)}: ${latexEscape(corr.email.trim())}` : ''].filter(Boolean).join(' \\\\\n')}}`);
    front.push('\\date{}', '\\maketitle');
    if (mainAbstract) front.push(`\\begin{abstract}\n${inline(mainAbstract)}\n\\end{abstract}`);
    if (kwMain.length) front.push(`\\noindent\\textbf{${latexEscape(L.keywords)}:} ${kwMain.map(latexEscape).join(', ')}`);
    front.push(...otherAbstracts);
  }

  const main: string[] = [];
  const ack: string[] = [];
  for (const s of doc.sections) {
    if (!s.body.trim()) continue;
    // Благодарности — ненумерованный раздел в конце, как в шаблонах журналов.
    if (s.key === 'acknowledgements') ack.push(`\\section*{${latexEscape(s.title)}}\n${blocks(s.body)}`);
    else main.push(`\\section{${latexEscape(s.title)}}\n${blocks(s.body)}`);
  }

  const tail: string[] = [...ack];
  tail.push(`\\section*{${latexEscape(L.ai)}}\n${inline(aiDisclosure(doc.aiLog, lang))}`);
  if (doc.references.length) {
    // \nocite{*}: в список попадают и непроцитированные источники — как в выгрузке для Word.
    tail.push(`\\nocite{*}\n\\bibliographystyle{${bibStyle(doc.citationStyle, template)}}\n\\bibliography{refs}`);
  }

  const tex = [
    '% Экспортировано из Tesseract. Компилировать pdfLaTeX + BibTeX (в Overleaf — по умолчанию).',
    ...head,
    '',
    '\\begin{document}',
    '',
    ...front.flatMap((f) => [f, '']),
    ...main.flatMap((m) => [m, '']),
    ...tail.flatMap((t) => [t, '']),
    '\\end{document}',
    '',
  ].join('\n');

  return { tex, bib: toBibtex(doc.references) + (doc.references.length ? '\n' : '') };
}

const README = `LaTeX-проект статьи, экспортированный из Tesseract.

Как открыть в Overleaf:
1. overleaf.com → New Project → Upload Project → выберите этот ZIP целиком.
2. Главный файл — main.tex. Компилятор по умолчанию (pdfLaTeX) подходит;
   если в тексте есть редкие символы Юникода и сборка падает — Menu → Compiler → XeLaTeX
   и уберите строки \\usepackage[T2A,T1]{fontenc} и \\usepackage[utf8]{inputenc}.
3. Список литературы собирается из refs.bib автоматически (BibTeX).
4. Рисунки лежат в figures/: PNG вставлены в текст, SVG — исходники для правки в Inkscape.

Класс журнала (elsarticle, IEEEtran) в Overleaf уже установлен. Для MDPI скачайте
официальный шаблон с сайта журнала и перенесите в него разделы из main.tex.
`;

export function buildLatexZip(input: LatexZipInput, template: LatexTemplate): Uint8Array {
  const { tex, bib } = buildLatex(input, template);
  const figs = Object.values(input.figures);
  return zip([
    { name: 'main.tex', data: tex },
    { name: 'refs.bib', data: bib },
    ...figs.flatMap((f) => [
      { name: `figures/${f.fileBase}.png`, data: f.png },
      ...(f.svg ? [{ name: `figures/${f.fileBase}.svg`, data: f.svg }] : []),
    ]),
    { name: 'README.txt', data: README },
  ]);
}
