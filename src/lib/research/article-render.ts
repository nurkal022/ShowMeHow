import { escapeHtml, type MathRenderer } from '../lms/markup';
import {
  bibliography, citationOrder, figureOrder, figWord, formatCitation, type ArticleDoc, type GraphicalAbstract,
} from './article';

/**
 * Статья → HTML для предпросмотра «как в журнале». Чистая функция: экранирует весь
 * ввод, потом раскрывает разрешённую разметку. Рисунки приходят снаружи готовым SVG
 * (или картинкой симуляции) — модуль не знает про базу.
 */

export interface FigureView { title: string; caption: string; svg: string | null; image?: string | null }

const TODO_RE = /\[\[TODO:([^\]]*)\]\]/g;

export function renderArticleHtml(input: {
  title: string; doc: ArticleDoc; figures: Record<string, FigureView>; math?: MathRenderer;
  /** Только один раздел — для живого предпросмотра рядом с редактором; нумерация остаётся сквозной. */
  onlySection?: string;
}): string {
  const { doc, figures, math } = input;
  const figs = figureOrder(doc.sections);
  const cites = citationOrder(doc.sections, doc.references);
  const figNo = (id: string) => figs.indexOf(id) + 1;

  const inline = (raw: string): string => {
    const found: string[] = [];
    let s = math ? raw.replace(/\$(\S(?:[^$\n]*\S)?)\$/g, (_, tex: string) => `\u0000${found.push(tex) - 1}\u0000`) : raw;
    s = escapeHtml(s)
      .replace(/\[\[fig:([\w-]+)\]\]/g, (_, id: string) => `<a class="ar-figref" href="#fig-${id}">${figWord(doc.lang)} ${figNo(id) || '?'}</a>`)
      .replace(/\[(@[\w:.-]+(?:\s*;\s*@[\w:.-]+)*)\]/g, (_, inner: string) => {
        const keys = inner.split(';').map((k) => k.trim().slice(1));
        return `<span class="ar-cite" title="${escapeHtml(keys.join(', '))}">${escapeHtml(formatCitation(keys, doc.references, cites, doc.citationStyle))}</span>`;
      })
      .replace(TODO_RE, (_, t: string) => `<mark class="ar-todo">TODO:${t}</mark>`)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => math!(found[Number(i)], false));
  };

  const figureHtml = (id: string) => {
    const f = figures[id];
    const n = figNo(id);
    const body = f?.svg ? f.svg : f?.image ? `<img src="${escapeHtml(f.image)}" alt="">` : '<div class="ar-fig-missing">Рисунок не найден</div>';
    const cap = f ? (f.caption || f.title) : '';
    return `<figure class="ar-figure" id="fig-${id}"><div class="ar-fig-body">${body}</div><figcaption><b>${figWord(doc.lang, true)} ${n}.</b> ${inline(cap)}</figcaption></figure>`;
  };

  const block = (src: string): string => {
    const out: string[] = [];
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.map(inline).join(' ')}</p>`);
      if (list.length) out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
      para = []; list = [];
    };
    for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
      const line = raw.trim();
      const fig = /^\{\{fig:([\w-]+)\}\}$/.exec(line);
      const display = /^\$\$(.+)\$\$$/.exec(line);
      const heading = /^##\s+(.+)$/.exec(line);
      const item = /^[-•]\s+(.+)$/.exec(line);
      if (!line) { flush(); continue; }
      if (fig) { flush(); out.push(figureHtml(fig[1])); continue; }
      if (display) { flush(); out.push(`<div class="ar-math">${math ? math(display[1].trim(), true) : escapeHtml(display[1])}</div>`); continue; }
      if (heading) { flush(); out.push(`<h3>${inline(heading[1])}</h3>`); continue; }
      if (item) { if (para.length) { out.push(`<p>${para.map(inline).join(' ')}</p>`); para = []; } list.push(item[1]); continue; }
      if (list.length) flush();
      para.push(line);
    }
    flush();
    return out.join('');
  };

  const L = {
    abstract: { ru: 'Аннотация', kk: 'Аңдатпа', en: 'Abstract' },
    keywords: { ru: 'Ключевые слова', kk: 'Түйін сөздер', en: 'Keywords' },
    refs: { ru: 'Список литературы', kk: 'Әдебиеттер тізімі', en: 'References' },
  };
  const authors = doc.authors.filter((a) => a.name.trim());
  const affs = [...new Set(authors.map((a) => a.affiliation.trim()).filter(Boolean))];
  const parts: string[] = [];
  if (input.onlySection) {
    const s = doc.sections.find((x) => x.id === input.onlySection);
    return s ? `<section class="ar-section"><h2>${escapeHtml(s.title)}</h2>${block(s.body)}</section>` : '';
  }
  parts.push(`<h1 class="ar-title">${inline(input.title)}</h1>`);
  if (authors.length) {
    parts.push(`<p class="ar-authors">${authors.map((a) => {
      const idx = affs.indexOf(a.affiliation.trim()) + 1;
      return `${escapeHtml(a.name)}${idx ? `<sup>${idx}</sup>` : ''}${a.corresponding ? '<sup>*</sup>' : ''}`;
    }).join(', ')}</p>`);
    if (affs.length) parts.push(`<p class="ar-affs">${affs.map((a, i) => `<sup>${i + 1}</sup>${escapeHtml(a)}`).join('<br>')}</p>`);
    const corr = authors.find((a) => a.corresponding && a.email);
    if (corr) parts.push(`<p class="ar-affs">* ${escapeHtml(corr.email)}</p>`);
  }
  for (const lang of [doc.lang, ...(['ru', 'kk', 'en'] as const).filter((l) => l !== doc.lang)]) {
    const a = doc.abstract[lang]?.trim();
    if (!a) continue;
    parts.push(`<section class="ar-abstract"><h4>${L.abstract[lang]}</h4><p>${inline(a)}</p>${doc.keywords[lang]?.trim() ? `<p><b>${L.keywords[lang]}:</b> ${escapeHtml(doc.keywords[lang]!)}</p>` : ''}</section>`);
  }
  doc.sections.forEach((s, i) => {
    if (!s.body.trim()) return;
    parts.push(`<section class="ar-section"><h2>${s.key === 'acknowledgements' ? '' : `${i + 1}. `}${escapeHtml(s.title)}</h2>${block(s.body)}</section>`);
  });
  const bib = bibliography(doc);
  if (bib.length) {
    const numeric = doc.citationStyle !== 'apa';
    parts.push(`<section class="ar-refs"><h2>${L.refs[doc.lang]}</h2><ol class="${numeric ? '' : 'ar-refs-apa'}">${bib.map((b) => `<li>${inline(b.text)}</li>`).join('')}</ol></section>`);
  }
  return parts.join('');
}

/* ------------------------------ сравнение правки ------------------------------ */

export type DiffPart = { kind: 'same' | 'add' | 'del'; text: string };

/** Сравнение по словам (LCS) — чтобы автор видел, что именно поменял помощник. */
export function wordDiff(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  // На очень длинных фрагментах LCS дорог — показываем «было/стало» целиком.
  if (A.length * B.length > 4_000_000) return [{ kind: 'del', text: a }, { kind: 'add', text: b }];
  const dp: Uint32Array[] = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) {
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text; else out.push({ kind, text });
  };
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A[i++]);
    else push('add', B[j++]);
  }
  while (i < A.length) push('del', A[i++]);
  while (j < B.length) push('add', B[j++]);
  return out;
}

/* ---------------------------- графический абстракт ---------------------------- */

/** Подписи на картинке — обычный текст: остатки LaTeX от модели или автора превращаем в Юникод. */
export function plainText(s: string): string {
  const sup: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  const subs: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', i: 'ᵢ', j: 'ⱼ', n: 'ₙ', x: 'ₓ', e: 'ₑ', a: 'ₐ', o: 'ₒ', k: 'ₖ', m: 'ₘ', t: 'ₜ', '+': '₊', '-': '₋' };
  const subscript = (d: string) => ([...d].every((ch) => subs[ch]) ? [...d].map((ch) => subs[ch]).join('') : `_${d}`);
  return s
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${a.length > 1 ? `(${a})` : a}/${b.length > 1 ? `(${b})` : b}`)
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\(left|right)/g, '')
    .replace(/\\(cdot|times)/g, (_, c: string) => (c === 'cdot' ? '·' : '×'))
    .replace(/\\(pm|approx|leq|geq|neq|infty|sigma|mu|chi|alpha|beta|gamma|tau|omega|Delta|pi)(?![A-Za-z])/g, (_, c: string) => ({ pm: '±', approx: '≈', leq: '≤', geq: '≥', sigma: 'σ', mu: 'μ', chi: 'χ', alpha: 'α', beta: 'β', gamma: 'γ', tau: 'τ', omega: 'ω', Delta: 'Δ', pi: 'π', neq: '≠', infty: '∞' })[c] ?? c)
    .replace(/\^\{?(-?\d+)\}?/g, (_, d: string) => [...d].map((ch) => sup[ch] ?? ch).join(''))
    .replace(/_\{([^{}]+)\}|_([A-Za-z0-9])/g, (_, a: string | undefined, b: string | undefined) => subscript(a ?? b ?? ''))
    .replace(/\\(exp|ln|sin|cos|tan|log|nu|lambda|rho|theta|phi|epsilon|kappa)(?![A-Za-z])/g, (_, c: string) => ({ nu: 'ν', lambda: 'λ', rho: 'ρ', theta: 'θ', phi: 'φ', epsilon: 'ε', kappa: 'κ' })[c] ?? c)
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[${}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const escSvg = (s: string) => plainText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

/**
 * Графический абстракт — схема, нарисованная кодом, а не нейросетевая картинка:
 * журналы ограничивают AI-generated изображения, а схема из текста и рисунка
 * автора — это оформление его собственных результатов. 1200×600, как просят Elsevier/MDPI.
 */
export function renderGraphicalAbstract(ga: GraphicalAbstract, figureSvg: string | null, palette = ['#0072B2', '#009E73', '#D55E00', '#CC79A7']): string {
  const W = 1200, H = 600;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<rect x="0" y="0" width="${W}" height="84" fill="#f4f6fb"/>`);
  const head = plainText(ga.headline);
  const headSize = Math.max(20, Math.min(32, Math.floor((W - 80) / Math.max(head.length * 0.56, 1))));
  out.push(`<text x="${W / 2}" y="${42 + headSize * 0.35}" text-anchor="middle" font-size="${headSize}" font-weight="700" fill="#1a1a1e">${escSvg(head)}</text>`);
  const steps = ga.steps.slice(0, 4);
  const hasFig = !!figureSvg;
  const colW = hasFig ? 560 : W - 80;
  const n = Math.max(steps.length, 1);
  const boxH = Math.min(96, (H - 84 - 110 - (n - 1) * 26) / n);
  steps.forEach((s, i) => {
    const y = 110 + i * (boxH + 26);
    const color = palette[i % palette.length];
    out.push(`<rect x="40" y="${y}" width="${colW}" height="${boxH}" rx="16" fill="${color}" fill-opacity="0.09" stroke="${color}" stroke-width="2"/>`);
    out.push(`<circle cx="84" cy="${y + boxH / 2}" r="22" fill="${color}"/><text x="84" y="${y + boxH / 2 + 8}" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">${i + 1}</text>`);
    out.push(`<text x="122" y="${y + 36}" font-size="24" font-weight="700" fill="${color}">${escSvg(s.label)}</text>`);
    wrap(s.detail, hasFig ? 40 : 80).slice(0, 2).forEach((line, k) => out.push(`<text x="122" y="${y + 64 + k * 24}" font-size="19" fill="#333">${escSvg(line)}</text>`));
    if (i < steps.length - 1) out.push(`<path d="M${40 + colW / 2} ${y + boxH + 4}v18m-8 -8 8 8 8-8" stroke="#999" stroke-width="2.5" fill="none"/>`);
  });
  if (hasFig) {
    // Рисунок автора вкладывается как есть: вложенный <svg> сохраняет его пропорции.
    const inner = figureSvg!.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const vb = /viewBox="([^"]+)"/.exec(figureSvg!)?.[1] ?? '0 0 720 460';
    out.push(`<rect x="630" y="104" width="530" height="370" rx="16" fill="#fff" stroke="#ddd" stroke-width="2"/>`);
    out.push(`<svg x="640" y="114" width="510" height="350" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
  }
  // Длинный вывод не должен вылезать за плашку: кегль подбирается по длине, дальше — две строки.
  const take = plainText(ga.takeaway);
  const size = Math.max(16, Math.min(24, Math.floor(2000 / Math.max(take.length, 1))));
  const lines = take.length * size * 0.52 > W - 140 ? wrap(take, Math.floor((W - 140) / (size * 0.52))).slice(0, 2) : [take];
  const pillH = lines.length > 1 ? 84 : 64;
  out.push(`<rect x="40" y="${H - 32 - pillH}" width="${W - 80}" height="${pillH}" rx="${pillH / 2}" fill="#1a1a1e"/>`);
  lines.forEach((l, k) => out.push(`<text x="${W / 2}" y="${H - 32 - pillH / 2 + size * 0.35 + (k - (lines.length - 1) / 2) * size * 1.2}" text-anchor="middle" font-size="${size}" font-weight="600" fill="#fff">${escSvg(l)}</text>`));
  out.push('</svg>');
  return out.join('');
}
