/**
 * Составной рисунок: несколько рисунков проекта в одну фигуру с метками панелей
 * (а), (б)… — так в журналах подают связанные результаты. Каждая панель вкладывается
 * вложенным <svg> со своим viewBox, поэтому пропорции и шрифты панелей сохраняются.
 */

export type CompositeLayout = 'row' | 'column' | 'grid';

const RU = 'абвгдежзик';
const EN = 'abcdefghij';

function viewBoxOf(svg: string): [number, number] {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return vb ? [Number(vb[1]), Number(vb[2])] : [720, 460];
}

/** Уникализируем id внутри панели: у всех рисунков clipPath по умолчанию один и тот же. */
function scopeIds(svg: string, prefix: string): string {
  return svg.replace(/id="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`);
}

export function renderComposite(panels: string[], opts: { layout: CompositeLayout; labels: 'ru' | 'en' | 'none'; gap?: number }): string {
  const list = panels.filter(Boolean).slice(0, 6);
  if (list.length === 0) return '';
  const gap = opts.gap ?? 16;
  const cols = opts.layout === 'row' ? list.length : opts.layout === 'column' ? 1 : Math.ceil(Math.sqrt(list.length));
  const rows = Math.ceil(list.length / cols);
  // Ячейка — по самой широкой панели; панели вписываются с сохранением пропорций.
  const sizes = list.map(viewBoxOf);
  const cw = Math.max(...sizes.map((s) => s[0]));
  const ch = Math.max(...sizes.map((s) => s[1]));
  const W = cols * cw + (cols - 1) * gap;
  const H = rows * ch + (rows - 1) * gap;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>`];
  list.forEach((svg, i) => {
    const x = (i % cols) * (cw + gap);
    const y = Math.floor(i / cols) * (ch + gap);
    const [w, h] = sizes[i];
    const inner = scopeIds(svg, `p${i}-`).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    out.push(`<svg x="${x}" y="${y}" width="${cw}" height="${ch}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
    if (opts.labels !== 'none') {
      const letter = (opts.labels === 'ru' ? RU : EN)[i];
      out.push(`<text x="${x + 10}" y="${y + 26}" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#1a1a1e">(${letter})</text>`);
    }
  });
  out.push('</svg>');
  return out.join('');
}
