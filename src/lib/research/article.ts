/**
 * Статья исследователя: разделы, рисунки из проекта, литература, авторы и журнал ИИ-правок.
 * Модуль чистый (без базы и DOM): его зовут редактор, предпросмотр, экспорт в Word/LaTeX,
 * серверные роуты и тесты.
 *
 * Разметка текста раздела:
 * - абзацы через пустую строку, **жирный**, *курсив*, «## » подзаголовок, «- » список;
 * - формулы $…$ в строке и $$…$$ отдельной строкой;
 * - рисунок отдельной строкой: {{fig:ID}} — ID материала из research_items;
 * - ссылка на рисунок в тексте: [[fig:ID]] → «рис. 2»;
 * - цитата: [@refId] или [@a; @b] → «[3]» или «(Иванов, 2021)» по стилю.
 * Нумерация рисунков и источников — по первому появлению, как требуют журналы.
 */

export type ArticleLang = 'ru' | 'kk' | 'en';
export type ArticleKind = 'experimental' | 'modeling' | 'review' | 'thesis';
export type CitationStyle = 'gost' | 'apa' | 'ieee' | 'vancouver';

export interface ArticleSection {
  id: string;
  /** Смысл раздела — от него зависят подсказки, чек-лист и черновики ИИ. */
  key: 'introduction' | 'methods' | 'results' | 'discussion' | 'conclusion' | 'acknowledgements' | 'custom';
  title: string;
  body: string;
}

export interface Author {
  name: string;
  affiliation: string;
  orcid: string;
  email: string;
  corresponding: boolean;
}

/** Источник в духе CSL: ровно то, что нужно для оформления списка литературы. */
export interface Reference {
  id: string;
  type: 'article' | 'book' | 'chapter' | 'conference' | 'thesis' | 'web' | 'dataset' | 'other';
  authors: { family: string; given: string }[];
  title: string;
  container: string;
  year: number | null;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  doi: string;
  url: string;
  /** Аннотация из Crossref — ИИ опирается на неё во введении, а не на свою память. */
  abstract?: string;
}

export interface AiLogEntry {
  at: string;
  action: string;
  sectionId: string | null;
  /** accepted — правку приняли в текст; rejected — отклонили; generated — черновик вставлен. */
  outcome: 'accepted' | 'rejected' | 'generated';
  chars: number;
}

export interface ReviewerComment {
  id: string;
  reviewer: string;
  comment: string;
  response: string;
  change: string;
}

export interface GraphicalAbstract {
  headline: string;
  steps: { label: string; detail: string }[];
  takeaway: string;
  /** Рисунок проекта в центре абстракта. */
  figureId: string | null;
}

export interface ArticleDoc {
  lang: ArticleLang;
  kind: ArticleKind;
  journal: string;
  citationStyle: CitationStyle;
  authors: Author[];
  abstract: Partial<Record<ArticleLang, string>>;
  keywords: Partial<Record<ArticleLang, string>>;
  sections: ArticleSection[];
  references: Reference[];
  aiLog: AiLogEntry[];
  reviewer: ReviewerComment[];
  coverLetter: string;
  graphicalAbstract: GraphicalAbstract | null;
  /** Заметки автора к разделу: из них ИИ пишет введение и обсуждение. */
  notes: Record<string, string>;
}

/* --------------------------------- шаблоны --------------------------------- */

const SECTION_TITLES: Record<ArticleLang, Record<Exclude<ArticleSection['key'], 'custom'>, string>> = {
  ru: { introduction: 'Введение', methods: 'Материалы и методы', results: 'Результаты', discussion: 'Обсуждение', conclusion: 'Заключение', acknowledgements: 'Благодарности' },
  kk: { introduction: 'Кіріспе', methods: 'Материалдар мен әдістер', results: 'Нәтижелер', discussion: 'Талқылау', conclusion: 'Қорытынды', acknowledgements: 'Алғыс' },
  en: { introduction: 'Introduction', methods: 'Materials and Methods', results: 'Results', discussion: 'Discussion', conclusion: 'Conclusions', acknowledgements: 'Acknowledgements' },
};

export const KIND_LABELS: Record<ArticleKind, string> = {
  experimental: 'Экспериментальная статья',
  modeling: 'Моделирование',
  review: 'Обзор',
  thesis: 'Тезисы конференции',
};

const KIND_SECTIONS: Record<ArticleKind, ArticleSection['key'][]> = {
  experimental: ['introduction', 'methods', 'results', 'discussion', 'conclusion', 'acknowledgements'],
  modeling: ['introduction', 'methods', 'results', 'discussion', 'conclusion', 'acknowledgements'],
  review: ['introduction', 'custom', 'discussion', 'conclusion'],
  thesis: ['introduction', 'methods', 'results', 'conclusion'],
};

/** Что должно быть в разделе — подсказка под заголовком и пункты чек-листа. */
export const SECTION_GUIDE: Record<ArticleSection['key'], { hint: string; checklist: string[] }> = {
  introduction: {
    hint: 'Контекст → что известно (со ссылками) → чего не хватает → цель и вклад этой работы.',
    checklist: ['Есть ссылки на свежие работы', 'Явно назван пробел в знаниях', 'Цель работы в последнем абзаце'],
  },
  methods: {
    hint: 'Чтобы другой мог повторить: установка, образцы, условия, модель, обработка данных и погрешности.',
    checklist: ['Указаны приборы и их точность', 'Описана модель и допущения', 'Описан метод обработки и погрешности'],
  },
  results: {
    hint: 'Что получено — числа с погрешностями и рисунки. Без интерпретации: она в обсуждении.',
    checklist: ['На каждый рисунок есть ссылка в тексте', 'Числа с погрешностями и единицами', 'Нет интерпретаций вместо фактов'],
  },
  discussion: {
    hint: 'Что значат результаты, сравнение с литературой, ограничения работы.',
    checklist: ['Сравнение с другими работами', 'Названы ограничения', 'Не повторяет раздел «Результаты»'],
  },
  conclusion: {
    hint: 'Главные выводы коротко и что дальше.',
    checklist: ['Выводы следуют из результатов', 'Нет новых фактов'],
  },
  acknowledgements: {
    hint: 'Грант (номер ИРН), организации и люди, которые помогли.',
    checklist: ['Указан номер гранта'],
  },
  custom: { hint: 'Свой раздел.', checklist: [] },
};

let seq = 0;
export function uid(prefix = 's'): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newArticleDoc(kind: ArticleKind = 'experimental', lang: ArticleLang = 'ru'): ArticleDoc {
  return {
    lang, kind, journal: 'generic', citationStyle: lang === 'en' ? 'ieee' : 'gost',
    authors: [{ name: '', affiliation: '', orcid: '', email: '', corresponding: true }],
    abstract: {}, keywords: {},
    sections: KIND_SECTIONS[kind].map((key) => ({
      id: uid(), key, title: key === 'custom' ? (lang === 'en' ? 'Main part' : lang === 'kk' ? 'Негізгі бөлім' : 'Основная часть') : SECTION_TITLES[lang][key], body: '',
    })),
    references: [], aiLog: [], reviewer: [], coverLetter: '', graphicalAbstract: null, notes: {},
  };
}

export function sectionTitle(key: Exclude<ArticleSection['key'], 'custom'>, lang: ArticleLang): string {
  return SECTION_TITLES[lang][key];
}

/* ------------------------------- нумерация ------------------------------- */

const FIG_BLOCK = /^\{\{fig:([\w-]+)\}\}$/;
const FIG_REF = /\[\[fig:([\w-]+)\]\]/g;
const CITE = /\[(@[\w:.-]+(?:\s*;\s*@[\w:.-]+)*)\]/g;

/** Порядок рисунков: по первому появлению — блоком или ссылкой в тексте. */
export function figureOrder(sections: Pick<ArticleSection, 'body'>[]): string[] {
  const order: string[] = [];
  const add = (id: string) => { if (!order.includes(id)) order.push(id); };
  for (const s of sections) {
    for (const line of s.body.split('\n')) {
      const block = FIG_BLOCK.exec(line.trim());
      if (block) { add(block[1]); continue; }
      for (const m of line.matchAll(FIG_REF)) add(m[1]);
    }
  }
  return order;
}

/** Порядок источников: по первой цитате в тексте, затем непроцитированные — для стилей с номерами. */
export function citationOrder(sections: Pick<ArticleSection, 'body'>[], refs: Reference[]): string[] {
  const known = new Set(refs.map((r) => r.id));
  const order: string[] = [];
  for (const s of sections) {
    for (const m of s.body.matchAll(CITE)) {
      for (const key of m[1].split(';').map((k) => k.trim().slice(1))) if (known.has(key) && !order.includes(key)) order.push(key);
    }
  }
  return order;
}

/** Процитированные ключи, которых нет в списке литературы: ИИ не должен их выдумывать. */
export function unknownCitations(text: string, refs: Reference[]): string[] {
  const known = new Set(refs.map((r) => r.id));
  const out: string[] = [];
  for (const m of text.matchAll(CITE)) {
    for (const key of m[1].split(';').map((k) => k.trim().slice(1))) if (!known.has(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Убрать выдуманные цитаты из текста модели, оставив настоящие. */
export function stripUnknownCitations(text: string, refs: Reference[]): string {
  const known = new Set(refs.map((r) => r.id));
  return text.replace(CITE, (_, inner: string) => {
    const keep = inner.split(';').map((k) => k.trim()).filter((k) => known.has(k.slice(1)));
    return keep.length ? `[${keep.join('; ')}]` : '';
  }).replace(/ +([.,;])/g, '$1');
}

/* ------------------------------- оформление ------------------------------- */

const FIG_WORD: Record<ArticleLang, [string, string]> = { ru: ['рис.', 'Рис.'], kk: ['сурет', 'Сурет'], en: ['Fig.', 'Figure'] };

export function figWord(lang: ArticleLang, capital = false): string {
  return FIG_WORD[lang][capital ? 1 : 0];
}

function initials(given: string): string {
  return given.split(/[\s-]+/).filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).join(' ');
}

function authorList(r: Reference, style: CitationStyle): string {
  const a = r.authors;
  if (a.length === 0) return '';
  switch (style) {
    case 'gost': {
      const names = a.slice(0, 3).map((p) => `${p.family} ${initials(p.given)}`.trim());
      return names.join(', ') + (a.length > 3 ? ' [и др.]' : '');
    }
    case 'apa': {
      const names = a.slice(0, 20).map((p) => `${p.family}, ${initials(p.given)}`.trim());
      if (names.length === 1) return names[0];
      return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
    }
    case 'ieee': {
      const names = a.slice(0, 6).map((p) => `${initials(p.given)} ${p.family}`.trim());
      if (a.length > 6) return `${names[0]} et al.`;
      return names.length > 1 ? `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}` : names[0];
    }
    case 'vancouver': {
      const names = a.slice(0, 6).map((p) => `${p.family} ${initials(p.given).replace(/[.\s]/g, '')}`.trim());
      return names.join(', ') + (a.length > 6 ? ', et al' : '');
    }
  }
}

/** Одна запись списка литературы как текст (с *курсивом* в нашей разметке). */
export function formatReference(r: Reference, style: CitationStyle): string {
  const authors = authorList(r, style);
  const year = r.year ?? 'n.d.';
  const doi = r.doi ? (style === 'gost' ? ` DOI: ${r.doi}.` : ` https://doi.org/${r.doi}`) : r.url ? ` ${r.url}` : '';
  const vol = r.volume ? (style === 'gost' ? ` Т. ${r.volume}` : r.volume) : '';
  const iss = r.issue ? (style === 'gost' ? `, № ${r.issue}` : `(${r.issue})`) : '';
  const pages = r.pages ? (style === 'gost' ? `. С. ${r.pages}` : r.pages) : '';
  switch (style) {
    case 'gost':
      if (r.type === 'book') return `${authors} ${r.title}. ${r.publisher ? `${r.publisher}, ` : ''}${year}.${pages ? pages + '.' : ''}${doi}`.trim();
      return `${authors} ${r.title} // ${r.container}. ${year}.${vol}${iss}${pages}.${doi}`.replace(/\.\./g, '.').trim();
    case 'apa':
      if (r.type === 'book') return `${authors} (${year}). *${r.title}*. ${r.publisher}.${doi}`.trim();
      return `${authors} (${year}). ${r.title}. *${r.container}*${vol ? `, *${vol}*` : ''}${iss}${pages ? `, ${pages}` : ''}.${doi}`.trim();
    case 'ieee':
      if (r.type === 'book') return `${authors}, *${r.title}*. ${r.publisher}, ${year}.${doi}`.trim();
      return `${authors}, "${r.title}," *${r.container}*${vol ? `, vol. ${r.volume}` : ''}${r.issue ? `, no. ${r.issue}` : ''}${r.pages ? `, pp. ${r.pages}` : ''}, ${year}.${doi}`.trim();
    case 'vancouver':
      return `${authors}. ${r.title}. ${r.container}. ${year}${r.volume ? `;${r.volume}` : ''}${iss}${r.pages ? `:${r.pages}` : ''}.${doi}`.trim();
  }
}

/** Как цитата выглядит в тексте. */
export function formatCitation(keys: string[], refs: Reference[], order: string[], style: CitationStyle): string {
  const found = keys.map((k) => refs.find((r) => r.id === k)).filter((r): r is Reference => !!r);
  if (found.length === 0) return '[?]';
  if (style === 'apa') {
    return `(${found.map((r) => {
      const a = r.authors;
      const who = a.length === 0 ? r.title.slice(0, 30) : a.length === 1 ? a[0].family : a.length === 2 ? `${a[0].family} & ${a[1].family}` : `${a[0].family} et al.`;
      return `${who}, ${r.year ?? 'n.d.'}`;
    }).join('; ')})`;
  }
  const nums = found.map((r) => order.indexOf(r.id) + 1).filter((n) => n > 0).sort((a, b) => a - b);
  // Подряд идущие номера сворачиваются: [1–3, 5].
  const parts: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j - i >= 2 ? `${nums[i]}–${nums[j]}` : j > i ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`);
    i = j;
  }
  return `[${parts.join(', ')}]`;
}

/** Список литературы в нужном порядке: по цитированию (номера) или по алфавиту (APA). */
export function bibliography(doc: Pick<ArticleDoc, 'sections' | 'references' | 'citationStyle'>): { id: string; text: string }[] {
  const order = citationOrder(doc.sections, doc.references);
  const rest = doc.references.filter((r) => !order.includes(r.id)).map((r) => r.id);
  let ids = [...order, ...rest];
  if (doc.citationStyle === 'apa') {
    ids = [...doc.references].sort((a, b) => (a.authors[0]?.family ?? a.title).localeCompare(b.authors[0]?.family ?? b.title)).map((r) => r.id);
  }
  return ids.map((id) => ({ id, text: formatReference(doc.references.find((r) => r.id === id)!, doc.citationStyle) }));
}

/* ---------------------------- разбор источников ---------------------------- */

/** Ключ источника из автора и года: ivanov2021, ivanov2021a… */
export function referenceKey(r: Pick<Reference, 'authors' | 'year' | 'title'>, taken: string[]): string {
  const base = ((r.authors[0]?.family || r.title.split(/\s+/)[0] || 'ref').toLowerCase()
    .replace(/[^a-zа-яёәғқңөұүһі0-9]/gi, '') || 'ref') + (r.year ?? '');
  let key = base;
  for (let i = 0; taken.includes(key); i++) key = base + String.fromCharCode(97 + i);
  return key;
}

export function emptyReference(): Reference {
  return { id: '', type: 'article', authors: [], title: '', container: '', year: null, volume: '', issue: '', pages: '', publisher: '', doi: '', url: '' };
}

/** DOI из строки: «https://doi.org/10.1000/x», «doi:10.1000/x» или сам DOI. */
export function normalizeDoi(input: string): string | null {
  const m = /(10\.\d{4,9}\/[^\s"<>]+)/i.exec(input.trim());
  return m ? m[1].replace(/[.,;]+$/, '') : null;
}

/** Ответ Crossref /works/{doi} → Reference. */
export function fromCrossref(msg: Record<string, unknown>): Reference {
  const str = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');
  const typeMap: Record<string, Reference['type']> = {
    'journal-article': 'article', 'book': 'book', 'monograph': 'book', 'book-chapter': 'chapter',
    'proceedings-article': 'conference', 'dissertation': 'thesis', 'dataset': 'dataset', 'posted-content': 'other',
  };
  const issued = (msg.issued ?? msg['published-print'] ?? msg['published-online']) as { 'date-parts'?: number[][] } | undefined;
  const authors = Array.isArray(msg.author)
    ? (msg.author as { family?: string; given?: string; name?: string }[]).map((a) => ({ family: a.family ?? a.name ?? '', given: a.given ?? '' }))
    : [];
  const abstract = typeof msg.abstract === 'string' ? msg.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined;
  return {
    id: '', type: typeMap[String(msg.type)] ?? 'other', authors,
    title: str(msg.title).replace(/\s+/g, ' ').trim(),
    container: str(msg['container-title']),
    year: issued?.['date-parts']?.[0]?.[0] ?? null,
    volume: str(msg.volume), issue: str(msg.issue), pages: str(msg.page), publisher: str(msg.publisher),
    doi: str(msg.DOI), url: str(msg.URL), abstract: abstract ? abstract.slice(0, 3000) : undefined,
  };
}

/** Простой разбор BibTeX: хватает для экспорта из Zotero, Mendeley и Google Scholar. */
export function parseBibtex(src: string): Reference[] {
  const out: Reference[] = [];
  const entryRe = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\s*\}/g;
  for (const m of src.matchAll(entryRe)) {
    const fields: Record<string, string> = {};
    const body = m[3];
    const fieldRe = /(\w+)\s*=\s*(\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|(\d+))/g;
    for (const f of body.matchAll(fieldRe)) fields[f[1].toLowerCase()] = (f[3] ?? f[4] ?? f[5] ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    const type = m[1].toLowerCase();
    out.push({
      id: m[2],
      type: type === 'book' ? 'book' : type === 'inproceedings' || type === 'conference' ? 'conference' : type === 'incollection' || type === 'inbook' ? 'chapter'
        : type === 'phdthesis' || type === 'mastersthesis' ? 'thesis' : type === 'misc' || type === 'online' ? 'web' : 'article',
      authors: (fields.author ?? '').split(/\s+and\s+/i).filter(Boolean).map((a) => {
        if (a.includes(',')) { const [family, given] = a.split(',').map((s) => s.trim()); return { family, given }; }
        const parts = a.trim().split(/\s+/);
        return { family: parts.pop() ?? '', given: parts.join(' ') };
      }),
      title: fields.title ?? '', container: fields.journal ?? fields.booktitle ?? '',
      year: fields.year ? Number(fields.year) || null : null,
      volume: fields.volume ?? '', issue: fields.number ?? '', pages: (fields.pages ?? '').replace(/--/g, '–'),
      publisher: fields.publisher ?? '', doi: fields.doi ?? '', url: fields.url ?? '',
    });
  }
  return out;
}

export function toBibtex(refs: Reference[]): string {
  const esc = (s: string) => s.replace(/[{}]/g, '');
  return refs.map((r) => {
    const type = r.type === 'book' ? 'book' : r.type === 'conference' ? 'inproceedings' : r.type === 'chapter' ? 'incollection' : r.type === 'thesis' ? 'phdthesis' : r.type === 'article' ? 'article' : 'misc';
    const f: [string, string][] = [
      ['author', r.authors.map((a) => `${a.family}, ${a.given}`).join(' and ')], ['title', r.title],
      [r.type === 'conference' || r.type === 'chapter' ? 'booktitle' : 'journal', r.container], ['year', r.year ? String(r.year) : ''],
      ['volume', r.volume], ['number', r.issue], ['pages', r.pages.replace(/–/g, '--')], ['publisher', r.publisher], ['doi', r.doi], ['url', r.url],
    ];
    return `@${type}{${r.id},\n${f.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${esc(v)}}`).join(',\n')}\n}`;
  }).join('\n\n');
}

/* ------------------------------ счёт и проверки ------------------------------ */

export function wordCount(text: string): number {
  return text.replace(/\{\{fig:[^}]+\}\}|\[\[fig:[^\]]+\]\]|\[@[^\]]+\]|\$[^$]*\$/g, ' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

export interface ArticleIssue { level: 'warn' | 'info'; text: string; sectionId?: string }

/** Проверки, которые не требуют ИИ: пустые разделы, рисунки без ссылок, лишние источники. */
export function checkArticle(doc: ArticleDoc, figureIds: string[]): ArticleIssue[] {
  const issues: ArticleIssue[] = [];
  const order = figureOrder(doc.sections);
  if (!doc.authors.some((a) => a.name.trim())) issues.push({ level: 'warn', text: 'Не указаны авторы.' });
  if (!doc.abstract[doc.lang]?.trim()) issues.push({ level: 'warn', text: 'Нет аннотации на языке статьи.' });
  for (const s of doc.sections) {
    if (s.key !== 'acknowledgements' && !s.body.trim()) issues.push({ level: 'warn', text: `Раздел «${s.title}» пуст.`, sectionId: s.id });
  }
  const allText = doc.sections.map((s) => s.body).join('\n');
  for (const id of order) {
    if (!figureIds.includes(id)) issues.push({ level: 'warn', text: 'В тексте есть рисунок, которого больше нет в проекте.' });
    else if (!new RegExp(`\\[\\[fig:${id}\\]\\]`).test(allText)) {
      issues.push({ level: 'info', text: `На ${figWord(doc.lang)} ${order.indexOf(id) + 1} нет ссылки в тексте.` });
    }
  }
  const cited = citationOrder(doc.sections, doc.references);
  const uncited = doc.references.filter((r) => !cited.includes(r.id));
  if (uncited.length) issues.push({ level: 'info', text: `Не процитировано источников: ${uncited.length}.` });
  const unknown = unknownCitations(allText, doc.references);
  if (unknown.length) issues.push({ level: 'warn', text: `Цитаты без источника в списке: ${unknown.join(', ')}.` });
  if (!doc.references.some((r) => r.year && r.year >= new Date().getFullYear() - 5)) {
    issues.push({ level: 'info', text: 'Нет источников за последние 5 лет — рецензенты это отмечают.' });
  }
  return issues;
}

/* ---------------------------- заявление об ИИ ---------------------------- */

const ACTION_NAMES: Record<string, Record<ArticleLang, string>> = {
  translate: { ru: 'перевод', kk: 'аударма', en: 'translation' },
  rewrite: { ru: 'стилистическая правка', kk: 'стилистикалық түзету', en: 'language editing' },
  grammar: { ru: 'проверка грамматики', kk: 'грамматиканы тексеру', en: 'grammar checking' },
  draft: { ru: 'черновики разделов по данным авторов', kk: 'авторлар деректері бойынша бөлім жобалары', en: 'drafting sections from the authors’ own data' },
  abstract: { ru: 'подготовка аннотации и ключевых слов', kk: 'аңдатпа мен түйін сөздерді дайындау', en: 'drafting the abstract and keywords' },
  review: { ru: 'проверка логики изложения', kk: 'баяндау логикасын тексеру', en: 'checking the logic of the text' },
  caption: { ru: 'подписи к рисункам', kk: 'суреттерге жазулар', en: 'figure captions' },
  reviewer: { ru: 'черновики ответов рецензентам', kk: 'рецензенттерге жауап жобалары', en: 'drafting responses to reviewers' },
  letter: { ru: 'сопроводительное письмо', kk: 'ілеспе хат', en: 'cover letter' },
  figure: { ru: 'графический абстракт', kk: 'графикалық аңдатпа', en: 'graphical abstract' },
};

/**
 * Заявление об использовании ИИ — из журнала реальных действий, а не по памяти.
 * Журналы (Elsevier, Springer Nature, MDPI) требуют его при подаче.
 */
export function aiDisclosure(log: AiLogEntry[], lang: ArticleLang): string {
  const used = [...new Set(log.filter((e) => e.outcome !== 'rejected').map((e) => e.action))].filter((a) => ACTION_NAMES[a]);
  if (used.length === 0) {
    return { ru: 'Генеративный ИИ при подготовке рукописи не использовался.', kk: 'Қолжазбаны дайындау кезінде генеративті ЖИ қолданылған жоқ.', en: 'No generative AI tools were used in the preparation of this manuscript.' }[lang];
  }
  const list = used.map((a) => ACTION_NAMES[a][lang]).join(', ');
  return {
    ru: `При подготовке рукописи авторы использовали ИИ-помощника Tesseract для следующих задач: ${list}. Все данные, расчёты, рисунки и выводы получены авторами; предложенный текст был проверен и отредактирован авторами, которые несут полную ответственность за содержание публикации.`,
    kk: `Қолжазбаны дайындау кезінде авторлар Tesseract ЖИ-көмекшісін келесі мақсаттарда қолданды: ${list}. Барлық деректер, есептеулер, суреттер мен қорытындылар авторлардікі; ұсынылған мәтінді авторлар тексеріп, өңдеді және жарияланым мазмұнына толық жауап береді.`,
    en: `During the preparation of this work the authors used the Tesseract AI assistant for: ${list}. All data, calculations, figures and conclusions are the authors’ own; the suggested text was reviewed and edited by the authors, who take full responsibility for the content of the publication.`,
  }[lang];
}

/** Документ из базы может быть старым или битым — достраиваем недостающие поля. */
export function normalizeArticleDoc(raw: unknown): ArticleDoc {
  const base = newArticleDoc();
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<ArticleDoc>;
  return {
    ...base, ...d,
    authors: Array.isArray(d.authors) ? d.authors : base.authors,
    abstract: d.abstract && typeof d.abstract === 'object' ? d.abstract : {},
    keywords: d.keywords && typeof d.keywords === 'object' ? d.keywords : {},
    sections: Array.isArray(d.sections) ? d.sections : base.sections,
    references: Array.isArray(d.references) ? d.references : [],
    aiLog: Array.isArray(d.aiLog) ? d.aiLog : [],
    reviewer: Array.isArray(d.reviewer) ? d.reviewer : [],
    notes: d.notes && typeof d.notes === 'object' ? d.notes : {},
    coverLetter: typeof d.coverLetter === 'string' ? d.coverLetter : '',
    graphicalAbstract: d.graphicalAbstract ?? null,
  };
}

/** Абстракт без содержания (ни одного шага и вывода) не показываем — пустая схема хуже никакой. */
export function hasGraphicalContent(ga: GraphicalAbstract | null | undefined): boolean {
  return !!ga && (ga.steps.some((s) => s.label.trim() || s.detail.trim()) || !!ga.takeaway.trim());
}

/* ------------------------- короткие ссылки на рисунки ------------------------- */

const SHORT = 8;

/**
 * В редакторе ссылки на рисунки показываются коротко — {{fig:eaa25eab}} вместо полного UUID,
 * а в документе хранятся полные: экспорт, нумерация и проверки работают по ним.
 * Короткий вид — только если префикс однозначен среди рисунков проекта.
 */
export function shortFigIds(text: string, ids: string[]): string {
  return text.replace(/(\{\{|\[\[)fig:([0-9a-f]{8})-[0-9a-f-]{27}(\}\}|\]\])/g, (whole, open: string, head: string, close: string) => {
    const full = whole.slice(open.length + 4, whole.length - close.length);
    return ids.filter((id) => id.startsWith(head)).length === 1 && ids.includes(full) ? `${open}fig:${head}${close}` : whole;
  });
}

export function fullFigIds(text: string, ids: string[]): string {
  return text.replace(/(\{\{|\[\[)fig:([0-9a-f]{8})(\}\}|\]\])/g, (whole, open: string, head: string, close: string) => {
    const hits = ids.filter((id) => id.startsWith(head));
    return hits.length === 1 && head.length === SHORT ? `${open}fig:${hits[0]}${close}` : whole;
  });
}
