'use client';
import { formatNumber } from '@/i18n/core';
import { useState } from 'react';
import AreaLineChart, { type ChartSeries } from './AreaLineChart';
import { formatDay } from './scale';
import { useLocale, useT } from '@/i18n/client';
import { INTL_LOCALE } from '@/i18n/config';
import { cabinet } from '@/i18n/messages/cabinet';

/**
 * Карточка с большим графиком: заголовок, переключатель периода и итоги рядов.
 * Данные приходят за самый длинный период, период режет ряд на клиенте — без запроса.
 */
export default function ChartCard({ title, days, series, periods, initialPeriod, emptyHint }: {
  title: string;
  days: string[];
  series: ChartSeries[];
  /** Длины периодов в днях, например [7, 30, 90]; без них переключателя нет. */
  periods?: number[];
  initialPeriod?: number;
  emptyHint?: string;
}) {
  const locale = useLocale();
  const t = useT(cabinet);
  const [period, setPeriod] = useState(initialPeriod ?? periods?.[0] ?? days.length);
  const from = Math.max(0, days.length - period);
  const shownDays = days.slice(from);
  const shown = series.map((s) => ({ ...s, values: s.values.slice(from) }));
  const totals = shown.map((s) => s.values.reduce((a, b) => a + b, 0));
  const grand = totals.reduce((a, b) => a + b, 0);

  return (
    <section className="cab-card chart-card">
      <header className="cab-card-head">
        <div>
          <h2>{title}</h2>
          <span className="muted">
            {shownDays.length > 0 && `${formatDay(shownDays[0], locale)} — ${formatDay(shownDays[shownDays.length - 1], locale)}`}
          </span>
        </div>
        {periods && (
          <div className="segmented" role="group" aria-label={t('period')}>
            {periods.map((p) => (
              <button key={p} type="button" aria-pressed={p === period}
                className={p === period ? 'segmented-item active' : 'segmented-item'}
                onClick={() => setPeriod(p)}>{t('periodDays', { n: p })}</button>
            ))}
          </div>
        )}
      </header>
      <AreaLineChart days={shownDays} series={shown} label={t('lastDays', { title, n: shownDays.length })} />
      {grand === 0 && emptyHint && <p className="chart-empty muted">{emptyHint}</p>}
      <footer className="chart-totals">
        {shown.map((s, i) => (
          <div key={s.key}>
            <span className="muted">{s.label}</span>
            <strong>{formatNumber(totals[i], locale)}</strong>
            <span className="chart-share" aria-hidden="true">
              <i style={{ width: `${grand ? Math.round((totals[i] / grand) * 100) : 0}%`, background: `var(--chart-${s.color})` }} />
            </span>
          </div>
        ))}
        <div>
          <span className="muted">{t('perDay')}</span>
          <strong>{formatNumber(shownDays.length ? totals[0] / shownDays.length : 0, locale, { maximumFractionDigits: 1 })}</strong>
          <span className="muted chart-note">{shown[0]?.label.toLocaleLowerCase(INTL_LOCALE[locale])}</span>
        </div>
      </footer>
    </section>
  );
}
