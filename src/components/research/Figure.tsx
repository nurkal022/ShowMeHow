'use client';
import { presetLabel, previewSize, presetByKey } from '@/lib/research/journals';
import { useLocale, useT } from '@/i18n/client';
import { researchCommon } from '@/i18n/messages/research-common';

/**
 * Рисунок в редакторе. Для журнала, слайда или постера показываем его в реальных
 * пропорциях на «листе» с увеличением ×1,6 — так видно, как кегль и толщина линий
 * лягут в колонку, а не растянутую на весь экран картинку.
 */
export interface FigurePick { sx: number; sy: number; map: string | null }

export default function Figure({ svg, size, onPick, pickMode }: {
  svg: string; size?: string;
  /** Клик по рисунку в координатах SVG — для подписей и отметки выбросов. */
  onPick?: (p: FigurePick) => void;
  pickMode?: string | null;
}) {
  const t = useT(researchCommon);
  const locale = useLocale();
  const chosen = size ? presetByKey(size) : null;
  const click = onPick ? (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest('svg');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vb = el.viewBox.baseVal;
    onPick({ sx: ((e.clientX - rect.left) * vb.width) / rect.width, sy: ((e.clientY - rect.top) * vb.height) / rect.height, map: el.getAttribute('data-map') });
  } : undefined;
  const cls = pickMode ? ` rs-figure-pick rs-pick-${pickMode}` : '';
  if (!chosen) return <div className={`rs-figure${cls}`} onClick={click} dangerouslySetInnerHTML={{ __html: svg }} />;
  const { width } = previewSize(size);
  const zoom = chosen.preset.medium === 'print' ? 1.6 : 1;
  return (
    <div className={`rs-figure rs-figure-sized${cls}`} onClick={click} style={{ '--fig-w': `${Math.round(width * zoom)}px` } as React.CSSProperties}>
      <div className="rs-figure-sheet" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="rs-figure-label">{t(zoom !== 1 ? 'figureZoom' : 'figureSheet', { journal: presetLabel(chosen.preset, locale), mm: chosen.preset[chosen.column].mm })}</span>
    </div>
  );
}
