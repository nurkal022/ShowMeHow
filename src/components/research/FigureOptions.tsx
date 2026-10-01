'use client';
import type { FigureOptions as Options } from '@/lib/research/doc';
import { JOURNAL_FIGURES, presetLabel } from '@/lib/research/journals';
import { useLocale, useT } from '@/i18n/client';
import { researchCommon } from '@/i18n/messages/research-common';

type Purpose = 'screen' | 'journal' | 'talk' | 'poster';

const PURPOSES: { key: Purpose; label: 'purposeScreen' | 'purposeJournal' | 'purposeTalk' | 'purposePoster' }[] = [
  { key: 'screen', label: 'purposeScreen' },
  { key: 'journal', label: 'purposeJournal' },
  { key: 'talk', label: 'purposeTalk' },
  { key: 'poster', label: 'purposePoster' },
];

/** Назначение рисунка задаёт сразу стиль и размер: один выбор вместо двух похожих. */
export function purposeOf(size: string | undefined): Purpose {
  if (!size) return 'screen';
  if (size.startsWith('slide')) return 'talk';
  if (size.startsWith('poster')) return 'poster';
  return 'journal';
}

const PRINT = JOURNAL_FIGURES.filter((p) => p.medium === 'print');

/** Оформление рисунка — общее у графика из данных и у модели. */
export default function FigureOptions<T extends Options>({ doc, onChange }: { doc: T; onChange: (patch: Partial<Options>) => void }) {
  const t = useT(researchCommon);
  const locale = useLocale();
  const purpose = purposeOf(doc.size);
  const choose = (p: Purpose) => {
    if (p === 'screen') onChange({ style: 'screen', size: '' });
    if (p === 'journal') onChange({ style: 'paper', size: purpose === 'journal' ? doc.size : 'elsevier:single', grid: false });
    if (p === 'talk') onChange({ style: 'talk', size: 'slide:single' });
    if (p === 'poster') onChange({ style: 'talk', size: 'poster:single' });
  };
  return (
    <section className="rs-panel">
      <h3>{t('look')}</h3>
      <label className="field"><span>{t('chartTitle')}</span>
        <input value={doc.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={t('chartTitlePh')} />
      </label>
      <div className="rs-grid2">
        <label className="field"><span>{t('axisX')}</span><input value={doc.xLabel} onChange={(e) => onChange({ xLabel: e.target.value })} /></label>
        <label className="field"><span>{t('axisY')}</span><input value={doc.yLabel} onChange={(e) => onChange({ yLabel: e.target.value })} /></label>
      </div>
      <div className="field"><span>{t('purpose')}</span>
        <div className="segmented rs-styles" role="group" aria-label={t('purposeAria')}>
          {PURPOSES.map((p) => (
            <button key={p.key} type="button" title={t(`${p.label}Hint` as 'purposeScreenHint')} className={purpose === p.key ? 'segmented-item active' : 'segmented-item'}
              aria-pressed={purpose === p.key} onClick={() => choose(p.key)}>{t(p.label)}</button>
          ))}
        </div>
      </div>
      {purpose === 'journal' && (
        <label className="field rs-reveal"><span>{t('journalWidth')}</span>
          <select value={doc.size} onChange={(e) => onChange({ size: e.target.value })}>
            {PRINT.map((p) => [
              <option key={`${p.key}1`} value={`${p.key}:single`}>{t('col1', { journal: presetLabel(p, locale), mm: p.single.mm })}</option>,
              <option key={`${p.key}2`} value={`${p.key}:double`}>{t('col2', { journal: presetLabel(p, locale), mm: p.double.mm })}</option>,
            ])}
          </select>
        </label>
      )}
      <div className="rs-checks">
        <label><input type="checkbox" checked={doc.xLog} onChange={(e) => onChange({ xLog: e.target.checked })} />{t('logX')}</label>
        <label><input type="checkbox" checked={doc.yLog} onChange={(e) => onChange({ yLog: e.target.checked })} />{t('logY')}</label>
        <label><input type="checkbox" checked={doc.grid} onChange={(e) => onChange({ grid: e.target.checked })} />{t('grid')}</label>
      </div>
    </section>
  );
}
