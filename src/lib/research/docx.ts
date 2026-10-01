import {
  aiDisclosure, bibliography, citationOrder, figureOrder, figWord, formatCitation,
  type ArticleDoc, type ArticleLang,
} from './article';
// Word не понимает LaTeX: формулы переводим в Юникод, а точную вёрстку даёт экспорт в LaTeX.
import { plainText } from './article-render';
import { zip } from './zip';

/**
 * Статья → .docx (WordprocessingML) без библиотек: несколько XML-файлов в ZIP.
 * Журналы и научные руководители в Казахстане принимают рукопись в Word, поэтому
 * экспорт должен открываться в Word без «файл повреждён» и выглядеть по ГОСТу:
 * Times New Roman 12 pt, полуторный интервал, абзацный отступ, рисунки с подписями.
 *
 * Разбор разметки (блоки и строчные элементы) общий для Word и LaTeX — он здесь же.
 */

/* ------------------------------- разметка ------------------------------- */

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'math'; tex: string }
  | { t: 'fig'; id: string };

/** Текст раздела → блоки: абзацы через пустую строку, «## », «- », $$…$$, {{fig:ID}}. */
export function articleBlocks(body: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  let math: string[] | null = null;
  const flush = () => {
    if (para.length) out.push({ t: 'p', text: para.join(' ') });
    if (list) out.push({ t: 'list', items: list });
    para = [];
    list = null;
  };
  for (const raw of body.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    // Многострочная формула: $$ на отдельных строках.
    if (math) {
      if (line.endsWith('$$')) { math.push(line.slice(0, -2)); out.push({ t: 'math', tex: math.join(' ').trim() }); math = null; } else math.push(line);
      continue;
    }
    if (!line) { flush(); continue; }
    const fig = /^\{\{fig:([\w-]+)\}\}$/.exec(line);
    if (fig) { flush(); out.push({ t: 'fig', id: fig[1] }); continue; }
    if (line.startsWith('$$')) {
      flush();
      const rest = line.slice(2);
      if (rest.length >= 2 && rest.endsWith('$$')) out.push({ t: 'math', tex: rest.slice(0, -2).trim() });
      else math = [rest];
      continue;
    }
    if (line.startsWith('## ')) { flush(); out.push({ t: 'h2', text: line.slice(3).trim() }); continue; }
    if (/^[-•]\s+/.test(line)) {
      if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; }
      (list ??= []).push(line.replace(/^[-•]\s+/, ''));
      continue;
    }
    if (list) { out.push({ t: 'list', items: list }); list = null; }
    para.push(line);
  }
  if (math) out.push({ t: 'math', tex: math.join(' ').trim() });
  flush();
  return out;
}

export type Inline =
  | { t: 'text'; s: string; b: boolean; i: boolean }
  | { t: 'math'; s: string; b: boolean; i: boolean }
  | { t: 'figref'; id: string; b: boolean; i: boolean }
  | { t: 'cite'; keys: string[]; b: boolean; i: boolean };

const INLINE = /\$([^$\n]+?)\$|\[\[fig:([\w-]+)\]\]|\[(@[\w:.-]+(?:\s*;\s*@[\w:.-]+)*)\]|\*\*(?=\S)(.+?)\*\*|\*(?=[^\s*])(.+?)\*/g;

/**
 * Строка → куски с признаками жирный/курсив. Одинокая «*» (как в «a * b») остаётся текстом:
 * курсив — только парная звёздочка, прилегающая к слову.
 */
export function inlineTokens(s: string, b = false, i = false): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(new RegExp(INLINE.source, 'g'))) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: 'text', s: s.slice(last, at), b, i });
    if (m[1] !== undefined) out.push({ t: 'math', s: m[1], b, i });
    else if (m[2] !== undefined) out.push({ t: 'figref', id: m[2], b, i });
    else if (m[3] !== undefined) out.push({ t: 'cite', keys: m[3].split(';').map((k) => k.trim().slice(1)), b, i });
    else if (m[4] !== undefined) out.push(...inlineTokens(m[4], true, i));
    else if (m[5] !== undefined) out.push(...inlineTokens(m[5], b, true));
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', s: s.slice(last), b, i });
  return out;
}

/* ------------------------------ локализация ------------------------------ */

export const EXPORT_LABELS: Record<ArticleLang, {
  abstract: string; keywords: string; references: string; ai: string; corresponding: string; missingFigure: string;
}> = {
  ru: { abstract: 'Аннотация', keywords: 'Ключевые слова', references: 'Список литературы', ai: 'Заявление об использовании ИИ', corresponding: 'Автор для корреспонденции', missingFigure: 'рисунок недоступен' },
  kk: { abstract: 'Аңдатпа', keywords: 'Түйін сөздер', references: 'Әдебиеттер', ai: 'ЖИ қолдану туралы мәлімдеме', corresponding: 'Хат-хабар үшін автор', missingFigure: 'сурет қолжетімсіз' },
  en: { abstract: 'Abstract', keywords: 'Keywords', references: 'References', ai: 'Declaration of generative AI use', corresponding: 'Corresponding author', missingFigure: 'figure unavailable' },
};

/** Язык статьи первым, затем остальные, для которых есть аннотация. */
export function abstractLangs(doc: Pick<ArticleDoc, 'lang' | 'abstract'>): ArticleLang[] {
  return [doc.lang, ...(['ru', 'kk', 'en'] as ArticleLang[]).filter((l) => l !== doc.lang)].filter((l) => doc.abstract[l]?.trim());
}

/** Уникальные места работы в порядке появления — номера для верхних индексов у авторов. */
export function affiliations(doc: Pick<ArticleDoc, 'authors'>): string[] {
  const out: string[] = [];
  for (const a of doc.authors) { const aff = a.affiliation.trim(); if (aff && !out.includes(aff)) out.push(aff); }
  return out;
}

/* --------------------------------- Word --------------------------------- */

export interface DocxFigure { png: Uint8Array; widthPx: number; heightPx: number; title: string; caption: string }

export interface DocxInput { title: string; doc: ArticleDoc; figures: Record<string, DocxFigure> }

/** XML 1.0 не допускает управляющие символы — Word откажется открывать файл. */
export function xmlEscape(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const LANG_TAG: Record<ArticleLang, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' };
const EMU_PER_PX = 9525;
/** 16 см — ширина набора на A4 с полями 2,5/2 см: шире рисунок вылезет за поле. */
const MAX_EMU = 16 * 360000;

interface RunOpts { b?: boolean; i?: boolean; sup?: boolean }

function run(text: string, o: RunOpts = {}): string {
  if (!text) return '';
  const pr = `${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.sup ? '<w:vertAlign w:val="superscript"/>' : ''}`;
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function para(runs: string, o: { style?: string; jc?: 'center' | 'left' | 'both'; indent?: boolean; keepNext?: boolean } = {}): string {
  const pr = [
    o.style ? `<w:pStyle w:val="${o.style}"/>` : '',
    o.keepNext ? '<w:keepNext/>' : '',
    o.indent === false ? '<w:ind w:firstLine="0"/>' : '',
    o.jc ? `<w:jc w:val="${o.jc}"/>` : '',
  ].join('');
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${runs}</w:p>`;
}

export function buildDocx(input: DocxInput): Uint8Array {
  const { doc } = input;
  const lang = doc.lang;
  const L = EXPORT_LABELS[lang];
  const figOrder = figureOrder(doc.sections);
  const citeOrder = citationOrder(doc.sections, doc.references);
  const numeric = doc.citationStyle !== 'apa';
  const media: { name: string; data: Uint8Array; rid: string }[] = [];
  const body: string[] = [];

  /** Разметка строки → runs Word; ссылки на рисунки и цитаты разрешаются в номера. */
  const runs = (s: string, base: RunOpts = {}) => inlineTokens(s, !!base.b, !!base.i).map((tk) => {
    switch (tk.t) {
      case 'text': return run(tk.s, { b: tk.b, i: tk.i });
      // Формулы в Word — курсивом как есть: редактор формул Word их не поймёт, а текст не потеряется.
      case 'math': return run(plainText(tk.s), { b: tk.b, i: true });
      case 'figref': return run(`${figWord(lang)} ${figOrder.indexOf(tk.id) + 1}`, { b: tk.b, i: tk.i });
      case 'cite': return run(formatCitation(tk.keys, doc.references, citeOrder, doc.citationStyle), { b: tk.b, i: tk.i });
    }
  }).join('');

  const picture = (id: string, f: DocxFigure, n: number): string => {
    const rid = `rIdImg${n}`;
    const name = `fig${n}.png`;
    media.push({ name, data: f.png, rid });
    const w = Math.max(1, f.widthPx);
    const h = Math.max(1, f.heightPx);
    const cx = Math.round(Math.min(w * EMU_PER_PX, MAX_EMU));
    const cy = Math.round(cx * (h / w));
    const docPr = 100 + n;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`
      + `<wp:docPr id="${docPr}" name="${xmlEscape(`${figWord(lang, true)} ${n}`)}" descr="${xmlEscape(f.title || id)}"/>`
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
      + `<pic:nvPicPr><pic:cNvPr id="${docPr}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
      + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

  // Шапка: название, авторы с индексами мест работы, ORCID, почта для переписки.
  body.push(para(run(input.title.trim() || '—'), { style: 'Title' }));
  const affs = affiliations(doc);
  const authors = doc.authors.filter((a) => a.name.trim());
  if (authors.length) {
    body.push(para(authors.map((a, k) => {
      const idx = affs.indexOf(a.affiliation.trim());
      const sup = [affs.length > 1 && idx >= 0 ? String(idx + 1) : '', a.corresponding ? '*' : ''].filter(Boolean).join(',');
      return run(a.name.trim(), { b: true }) + run(sup, { b: true, sup: true }) + (k < authors.length - 1 ? run(', ', { b: true }) : '');
    }).join(''), { jc: 'center', indent: false }));
    affs.forEach((aff, k) => body.push(para((affs.length > 1 ? run(String(k + 1), { sup: true }) : '') + run(aff, { i: true }), { jc: 'center', indent: false })));
    const orcids = authors.filter((a) => a.orcid.trim());
    if (orcids.length) body.push(para(run(`ORCID: ${orcids.map((a) => `${a.name.trim()} — ${a.orcid.trim()}`).join('; ')}`), { jc: 'center', indent: false }));
    const corr = authors.find((a) => a.corresponding && a.email.trim());
    if (corr) body.push(para(run(`* ${L.corresponding}: `) + run(corr.email.trim(), { i: true }), { jc: 'center', indent: false }));
  }

  for (const l of abstractLangs(doc)) {
    const LL = EXPORT_LABELS[l];
    body.push(para(run(`${LL.abstract}. `, { b: true }) + runs(doc.abstract[l]!.trim()), { jc: 'both' }));
    const kw = doc.keywords[l]?.trim();
    if (kw) body.push(para(run(`${LL.keywords}: `, { b: true }) + runs(kw), { jc: 'both' }));
  }

  for (const s of doc.sections) {
    if (!s.body.trim()) continue;
    body.push(para(run(s.title), { style: 'Heading1' }));
    for (const b of articleBlocks(s.body)) {
      switch (b.t) {
        case 'p': body.push(para(runs(b.text))); break;
        case 'h2': body.push(para(runs(b.text), { style: 'Heading2' })); break;
        case 'list': b.items.forEach((it) => body.push(para(run('• ') + runs(it), { indent: false }))); break;
        case 'math': body.push(para(run(plainText(b.tex), { i: true }), { jc: 'center', indent: false })); break;
        case 'fig': {
          const n = figOrder.indexOf(b.id) + 1;
          const f = input.figures[b.id];
          if (f?.png?.length) body.push(para(picture(b.id, f, n), { jc: 'center', indent: false, keepNext: true }));
          const text = f ? (f.caption.trim() || f.title.trim()) : `[${L.missingFigure}]`;
          body.push(para(run(`${figWord(lang, true)} ${n}. `, { b: true }) + runs(text), { style: 'Caption' }));
          break;
        }
      }
    }
  }

  if (doc.references.length) {
    body.push(para(run(L.references), { style: 'Heading1' }));
    bibliography(doc).forEach((r, k) => {
      const num = numeric ? (doc.citationStyle === 'ieee' ? `[${k + 1}] ` : `${k + 1}. `) : '';
      body.push(para(run(num) + runs(r.text), { indent: false, jc: 'both' }));
    });
  }

  body.push(para(run(L.ai), { style: 'Heading1' }));
  body.push(para(runs(aiDisclosure(doc.aiLog, lang)), { jc: 'both' }));

  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<w:body>${body.join('')}`
    // A4, поля: левое 3 см, правое 1,5 см, верх/низ 2 см — типовые требования вузовских вестников.
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>';

  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')
    + '</Relationships>';

  return zip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: stylesXml(lang) },
    { name: 'word/_rels/document.xml.rels', data: rels },
    ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
    { name: 'docProps/core.xml', data: coreXml(input.title, authors.map((a) => a.name.trim()).join(', '), lang) },
  ]);
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Default Extension="png" ContentType="image/png"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
  + '</Types>';

const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  + '</Relationships>';

function stylesXml(lang: ArticleLang): string {
  const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
  const style = (id: string, name: string, ppr: string, rpr: string, extra = '') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="${LANG_TAG[lang]}"/></w:rPr></w:rPrDefault>`
    + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    // Normal: 1,25 см абзацный отступ и выравнивание по ширине — как требуют отечественные журналы.
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>'
    + `<w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="709"/><w:jc w:val="both"/></w:pPr><w:rPr>${font}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>`
    + style('Title', 'Title', '<w:spacing w:before="0" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="32"/><w:szCs w:val="32"/>')
    + style('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/>', '<w:b/><w:sz w:val="28"/><w:szCs w:val="28"/>')
    + style('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="180" w:after="60"/><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/>', '<w:b/><w:i/><w:sz w:val="24"/><w:szCs w:val="24"/>')
    + style('Caption', 'caption', '<w:spacing w:before="60" w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:sz w:val="22"/><w:szCs w:val="22"/>')
    + '</w:styles>';
}

function coreXml(title: string, creator: string, lang: ArticleLang): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"'
    + ' xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${xmlEscape(title)}</dc:title><dc:creator>${xmlEscape(creator)}</dc:creator><dc:language>${LANG_TAG[lang]}</dc:language>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`
    + '</cp:coreProperties>';
}
