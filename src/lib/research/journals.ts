import type { PlotSpec, PlotStyle } from './plot';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';

/**
 * Размеры рисунков под требования журналов. Рисунок рисуется сразу в физическом
 * размере колонки (CSS-пиксели при 96 dpi), а PNG масштабируется до dpi журнала —
 * тогда шрифт 12 px на рисунке так и остаётся ~9 pt в напечатанной статье, а не
 * ужимается до нечитаемых 5 pt, как бывает при уменьшении картинки «с экрана».
 */

export interface JournalPreset {
  key: string;
  label: string;
  single: { mm: number };
  double: { mm: number };
  /** Шрифт, который журнал просит на рисунках. */
  font: string;
  /** Минимальный кегль подписей на рисунке в напечатанном размере. */
  minFontPt: number;
  dpi: number;
  /** print — печать (ч/б, подпись под рисунком); screen — слайд, постер. */
  medium: 'print' | 'screen';
}

export const JOURNAL_FIGURES: JournalPreset[] = [
  { key: 'elsevier', label: 'Elsevier', single: { mm: 90 }, double: { mm: 190 }, font: 'Arial, Helvetica, Times', minFontPt: 7, dpi: 600, medium: 'print' },
  { key: 'springer', label: 'Springer Nature', single: { mm: 84 }, double: { mm: 174 }, font: 'Arial, Helvetica', minFontPt: 8, dpi: 600, medium: 'print' },
  { key: 'mdpi', label: 'MDPI', single: { mm: 85 }, double: { mm: 170 }, font: 'Palatino, Arial', minFontPt: 8, dpi: 600, medium: 'print' },
  { key: 'ieee', label: 'IEEE', single: { mm: 88.9 }, double: { mm: 181 }, font: 'Times New Roman, Helvetica', minFontPt: 8, dpi: 600, medium: 'print' },
  { key: 'acs', label: 'ACS', single: { mm: 82.5 }, double: { mm: 178 }, font: 'Arial, Helvetica', minFontPt: 6, dpi: 600, medium: 'print' },
  { key: 'aps', label: 'APS / PRL', single: { mm: 86 }, double: { mm: 178 }, font: 'Times, Helvetica', minFontPt: 7, dpi: 600, medium: 'print' },
  { key: 'wiley', label: 'Wiley', single: { mm: 80 }, double: { mm: 170 }, font: 'Arial, Helvetica', minFontPt: 7, dpi: 600, medium: 'print' },
  { key: 'vestnik', label: 'Вестник (КазНУ/ЕНУ, типовой)', single: { mm: 80 }, double: { mm: 165 }, font: 'Times New Roman', minFontPt: 8, dpi: 300, medium: 'print' },
  // Слайд 13,33″ шириной: 1280 CSS-пикселей, PNG ×2 — чётко и на 4K-проекторе.
  { key: 'slide', label: 'Слайд 16:9', single: { mm: 338.7 }, double: { mm: 338.7 }, font: 'Sans-serif', minFontPt: 12, dpi: 192, medium: 'screen' },
  { key: 'poster', label: 'Постер A0 (фрагмент)', single: { mm: 280 }, double: { mm: 560 }, font: 'Sans-serif', minFontPt: 12, dpi: 150, medium: 'screen' },
];

/** Кегль шрифта стилей renderPlot в пикселях — дублирует plot.ts, чтобы проверить читаемость. */
const STYLE_FONT_PX: Record<PlotStyle, number> = { screen: 12, paper: 13, talk: 17 };

const PX_PER_MM = 96 / 25.4;

export function figureSize(preset: JournalPreset, column: 'single' | 'double', aspect = 0.62): { widthPx: number; heightPx: number; scale: number } {
  const widthPx = Math.round(preset[column].mm * PX_PER_MM);
  return { widthPx, heightPx: Math.round(widthPx * aspect), scale: preset.dpi / 96 };
}

/** Кегль подписей рисунка в пунктах при печати в размере пресета. */
export function figureFontPt(spec: Pick<PlotSpec, 'style'>): number {
  return STYLE_FONT_PX[spec.style ?? 'screen'] * 0.75;
}

/** Что редакция журнала скорее всего вернёт на доработку — до того, как рисунок уйдёт в статью. */
const LOCAL_LABELS: Record<string, 'presetVestnik' | 'presetSlide' | 'presetPoster'> = { vestnik: 'presetVestnik', slide: 'presetSlide', poster: 'presetPoster' };

/** Название пресета на языке интерфейса: у журналов оно одно, у «Вестника», слайда и постера — своё. */
export function presetLabel(preset: JournalPreset, locale: Locale = 'ru'): string {
  const k = LOCAL_LABELS[preset.key];
  return k ? translator(researchFigure, locale)(k) : preset.label;
}

export function figureWarnings(spec: PlotSpec, preset: JournalPreset, locale: Locale = 'ru'): string[] {
  const t = translator(researchFigure, locale);
  const out: string[] = [];
  const style = spec.style ?? 'screen';
  const curves = spec.curves ?? [];
  const items = spec.series.length + curves.length;
  if (preset.medium === 'print' && style !== 'paper' && (curves.length > 1 || items > 2)) out.push(t('warnColorOnly'));
  if (items > 6) out.push(t('warnTooMany', { n: items }));
  if (preset.medium === 'print' && spec.title?.trim()) out.push(t('warnTitle'));
  const pt = figureFontPt(spec);
  if (pt < preset.minFontPt) {
    out.push(t(style === 'talk' ? 'warnFontTalk' : 'warnFont', { pt: pt.toFixed(1), journal: presetLabel(preset, locale), min: preset.minFontPt }));
  }
  if (preset.medium === 'screen' && style === 'paper') out.push(t('warnPalePaper'));
  return out;
}

/** Ключ выбора размера в интерфейсе: «elsevier:single». */
export function presetByKey(key: string): { preset: JournalPreset; column: 'single' | 'double' } | null {
  const [k, col] = key.split(':');
  const preset = JOURNAL_FIGURES.find((p) => p.key === k);
  return preset ? { preset, column: col === 'double' ? 'double' : 'single' } : null;
}

/**
 * Размер превью рисунка: для журнала, слайда или постера — ровно тот, в каком он уйдёт
 * в файл (экран растягивает картинку, пропорции шрифта к полю сохраняются). Без пресета — экранный.
 */
export function previewSize(size: string | undefined): { width: number; height: number } {
  const chosen = size ? presetByKey(size) : null;
  if (!chosen) return { width: 760, height: 480 };
  const d = figureSize(chosen.preset, chosen.column, chosen.preset.key === 'slide' ? 0.5625 : 0.62);
  return { width: Math.round(d.widthPx), height: Math.round(d.heightPx) };
}
