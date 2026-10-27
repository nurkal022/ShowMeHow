import katex from 'katex';
import type { Locale } from '@/i18n/config';
import { formatDate, translator } from '@/i18n/core';
import { learn } from '@/i18n/messages/learn';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import { lms } from '@/i18n/messages/lms';
import { labsFor, labUrl } from '../labs';
import { calloutToneLabels, simulationIdsOf, type StudentBlockBody } from './block-schema';
import { escapeHtml, renderMarkup } from './markup';

/**
 * Урок одним HTML-файлом для школ со слабым интернетом: текст, формулы, картинки и
 * тренажёры внутри, без единого запроса в сеть. Ключей к заданиям здесь нет — блоки
 * приходят уже через toStudentBody; ответы студент отправляет на сайте.
 * Модуль чистый: тренажёры (с вшитыми библиотеками), картинки и стиль KaTeX собирает маршрут.
 */

export interface OfflineLesson {
  locale: Locale;
  courseTitle: string;
  topicTitle: string;
  /** Полный адрес урока на сайте — для ссылок «открыть онлайн». */
  siteHref: string;
  origin: string;
  blocks: StudentBlockBody[];
  /** id тренажёра → готовый HTML; нет в карте — тренажёр удалён. */
  sims: Map<string, string>;
  /** src картинки → data:-адрес. */
  images: Map<string, string>;
  katexCss: string;
  now?: Date;
}

const tex = (s: string, display: boolean) =>
  katex.renderToString(s, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' });
const md = (s: string) => `<div class="md">${renderMarkup(s, tex)}</div>`;
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function offlineFileName(topicTitle: string): string {
  return `${topicTitle.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'lesson'}.html`;
}

export function offlineLessonHtml(l: OfflineLesson): string {
  const t = translator(learnLesson, l.locale);
  const tl = translator(learn, l.locale);
  const tm = translator(lms, l.locale);
  const tones = calloutToneLabels(l.locale);
  const labs = labsFor(l.locale);

  const sim = (id: string, preset?: Record<string, number>, locked?: string[]) => {
    const html = l.sims.get(id);
    if (!html) return `<p class="muted">${escapeHtml(t('offlineSimMissing'))}</p>`;
    const p = preset && (Object.keys(preset).length || locked?.length) ? ` data-preset="${attr(JSON.stringify({ controls: preset, locked: locked ?? [] }))}"` : '';
    return `<div class="sim"><iframe sandbox="allow-scripts" srcdoc="${attr(html)}"${p} title="sim"></iframe></div>`;
  };
  const caption = (s: string) => (s ? `<figcaption>${escapeHtml(s)}</figcaption>` : '');
  const blank = '<span class="blank"></span>';

  const block = (b: StudentBlockBody): string => {
    switch (b.kind) {
      case 'text':
        if (!b.payload.title.trim() && !b.payload.body.trim()) return '';
        return `<section>${b.payload.title ? `<h2>${escapeHtml(b.payload.title)}</h2>` : ''}${md(b.payload.body)}</section>`;
      case 'callout':
        if (!b.payload.title.trim() && !b.payload.body.trim()) return '';
        return `<aside class="callout tone-${b.payload.tone}"><strong>${escapeHtml(b.payload.title || tones[b.payload.tone])}</strong>${b.payload.body ? md(b.payload.body) : ''}</aside>`;
      case 'formula':
        return b.payload.latex.trim() ? `<figure class="formula">${tex(b.payload.latex, true)}${caption(b.payload.caption)}</figure>` : '';
      case 'image': {
        const src = l.images.get(b.payload.src) ?? (/^https?:\/\//.test(b.payload.src) ? b.payload.src : '');
        return src ? `<figure><img src="${attr(src)}" alt="${attr(b.payload.alt)}">${caption(b.payload.caption)}</figure>` : '';
      }
      case 'video':
        return b.payload.url ? `<p class="note"><a href="${attr(b.payload.url)}">${escapeHtml(b.payload.caption || t('offlineVideo'))}</a> · ${escapeHtml(t('offlineVideo'))}</p>` : '';
      case 'spoiler':
        return b.payload.body.trim() ? `<details><summary>${escapeHtml(b.payload.title || tm('showSolution'))}</summary>${md(b.payload.body)}</details>` : '';
      case 'code':
        return b.payload.code.trim() ? `<figure>${caption(b.payload.language)}<pre><code>${escapeHtml(b.payload.code)}</code></pre></figure>` : '';
      case 'divider':
        return '<hr>';
      case 'simulation':
        return b.payload.simulationId ? `<figure>${sim(b.payload.simulationId, b.payload.preset, b.payload.locked)}${caption(b.payload.caption)}</figure>` : '';
      case 'lab': {
        const lab = labs.find((x) => x.slug === b.payload.slug);
        const title = lab?.title ?? b.payload.slug;
        return `<p class="note"><a href="${attr(l.origin + labUrl(b.payload.slug))}">${escapeHtml(t('offlineLab', { title }))}</a></p>`;
      }
      case 'assignment': {
        const p = b.payload;
        const s = p.spec;
        let body = '';
        if (s.type === 'choice') body = `<ul class="opts">${s.options.map((o) => `<li><span class="box${s.multiple ? '' : ' round'}"></span>${md(o.text)}</li>`).join('')}</ul>`;
        else if (s.type === 'gaps') body = `<p>${s.parts.map((x) => escapeHtml(x)).join(blank)}</p>`;
        else if (s.type === 'match') body = `<div class="match"><ol>${s.left.map((x) => `<li>${escapeHtml(x.text)}</li>`).join('')}</ol><ol type="A">${s.right.map((x) => `<li>${escapeHtml(x.text)}</li>`).join('')}</ol></div>`;
        else if (s.type === 'order') body = `<ul class="opts">${s.items.map((x) => `<li><span class="box"></span>${escapeHtml(x.text)}</li>`).join('')}</ul>`;
        else if (s.type === 'table') {
          const head = s.columns.map((c) => `<th>${escapeHtml(c.label)}${c.unit ? `, ${escapeHtml(c.unit)}` : ''}</th>`).join('');
          const row = `<tr>${s.columns.map(() => '<td></td>').join('')}</tr>`;
          body = `<table><thead><tr>${head}</tr></thead><tbody>${row.repeat(Math.max(3, s.minRows))}</tbody></table>`;
        } else if (s.type === 'number' || s.type === 'short') body = `<p>${escapeHtml(t('offlineAnswer'))}: ${blank} ${s.type === 'number' ? escapeHtml(s.unit) : ''}</p>`;
        const stand = s.type === 'sim_state' ? sim(s.simulationId)
          : p.stand?.kind === 'simulation' ? sim(p.stand.simulationId) : '';
        const lab = p.stand?.kind === 'lab' ? block({ kind: 'lab', payload: { slug: p.stand.slug, caption: '' } }) : '';
        return `<section class="task"><header><b>${escapeHtml(tl(`type_${s.type}`))}</b><span>${escapeHtml(tl('pointsN', { n: p.points }))}</span></header>`
          + `${md(p.prompt)}${stand}${lab}${body}<p class="note">${escapeHtml(t('offlineTask'))}</p></section>`;
      }
    }
  };

  const date = formatDate(l.now ?? new Date(), l.locale);
  const hasMath = l.blocks.some((b) => b.kind === 'formula') || l.blocks.some((b) => JSON.stringify(b).includes('$'));
  return `<!doctype html>
<html lang="${l.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(l.topicTitle)} · ${escapeHtml(l.courseTitle)}</title>
<style>${OFFLINE_CSS}</style>${hasMath ? `<style>${l.katexCss}</style>` : ''}
</head><body><main>
<p class="eyebrow">${escapeHtml(l.courseTitle)}</p>
<h1>${escapeHtml(l.topicTitle)}</h1>
<p class="note">${escapeHtml(t('offlineNote', { date }))} <a href="${attr(l.siteHref)}">${escapeHtml(t('offlineOpen'))}</a></p>
${l.blocks.map(block).filter(Boolean).join('\n')}
</main><script>${PRESET_JS}</script></body></html>`;
}

/** Стартовые значения преподавателя: тот же запрос sim-apply, что шлёт урок на сайте (src/lib/lms/sim-bridge.ts). */
const PRESET_JS = `(function () {
  document.querySelectorAll('iframe[data-preset]').forEach(function (f, i) {
    var preset = JSON.parse(f.getAttribute('data-preset')), done = false, tries = 0, id = 'off' + i;
    window.addEventListener('message', function (e) {
      if (e.source === f.contentWindow && e.data && e.data.type === 'sim-applied' && e.data.id === id && e.data.ok) done = true;
    });
    (function send() {
      if (done || tries++ > 20 || !f.contentWindow) return;
      f.contentWindow.postMessage({ type: 'sim-apply', id: id, controls: preset.controls, locked: preset.locked }, '*');
      setTimeout(send, 400);
    })();
  });
})();`;

const OFFLINE_CSS = `
:root { --bg: #f7f7f4; --card: #fff; --ink: #1d232b; --muted: #5d6673; --line: #dfe2e6; --accent: #2f6fdf; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #12151a; --card: #1b2028; --ink: #e8ebef; --muted: #9aa4b1; --line: #2c333d; --accent: #7aa7ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 30px; line-height: 1.2; margin: 4px 0 8px; }
h2 { font-size: 22px; margin: 0 0 8px; }
a { color: var(--accent); }
.eyebrow { margin: 0; color: var(--muted); font-size: 14px; text-transform: uppercase; letter-spacing: .06em; }
.note, .muted { color: var(--muted); font-size: 15px; }
section, aside, figure, details { margin: 20px 0; }
section, aside, details { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; }
figure { margin-left: 0; margin-right: 0; }
figcaption { color: var(--muted); font-size: 14px; margin-top: 6px; }
img { max-width: 100%; height: auto; border-radius: 10px; display: block; }
pre { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; font-size: 14px; }
.callout { border-left: 4px solid var(--accent); }
.callout.tone-warning { border-left-color: #d9822b; } .callout.tone-important { border-left-color: #c2410c; }
.callout.tone-definition { border-left-color: #7c3aed; } .callout.tone-example { border-left-color: #15803d; }
.formula { text-align: center; overflow-x: auto; }
summary { cursor: pointer; font-weight: 600; }
.sim { position: relative; width: 100%; aspect-ratio: 16 / 10; min-height: 360px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: #0b0e13; }
.sim iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.task header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.task header span { color: var(--muted); font-size: 14px; }
.opts { list-style: none; padding: 0; }
.opts li { display: flex; gap: 10px; align-items: baseline; margin: 6px 0; }
.opts .md p { margin: 0; }
.box { flex: none; width: 14px; height: 14px; border: 1.5px solid var(--muted); border-radius: 3px; display: inline-block; }
.box.round { border-radius: 50%; }
.blank { display: inline-block; min-width: 90px; border-bottom: 1.5px solid var(--muted); margin: 0 4px; }
.match { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid var(--line); padding: 6px 8px; height: 32px; text-align: left; font-size: 15px; }
@media print { body { background: #fff; } section, aside, details { break-inside: avoid; } .sim { display: none; } }
`;

/** Какие тренажёры и картинки нужны уроку — чтобы маршрут собрал только их. */
export function offlineNeeds(blocks: StudentBlockBody[]): { sims: string[]; images: string[] } {
  const sims = new Set(blocks.flatMap((b) => simulationIdsOf(b)));
  const images = new Set(blocks.flatMap((b) => (b.kind === 'image' && b.payload.src ? [b.payload.src] : [])));
  return { sims: [...sims], images: [...images] };
}
