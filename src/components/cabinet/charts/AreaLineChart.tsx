'use client';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { areaPath, formatDay, labelIndexes, niceTicks, smoothPath, type Point } from './scale';

export interface ChartSeries {
  key: string;
  label: string;
  values: number[];
  /** Номер цвета ряда: --chart-1, --chart-2… из cabinet.css. */
  color: 1 | 2 | 3;
  /** Ряды различаются не только цветом: второй рисуется пунктиром. */
  dashed?: boolean;
  /** Заливка под линией — только у главного ряда. */
  area?: boolean;
}

const H = 300;
const M = { top: 16, right: 16, bottom: 30, left: 40 };

/**
 * График по дням: линии с заливкой, сетка, оси, легенда и подсказка под курсором.
 * Ширина берётся из контейнера (viewBox = его пиксели), поэтому подписи не сжимаются
 * на телефоне. С клавиатуры: фокус на графике, стрелки двигают выбранный день.
 */
export default function AreaLineChart({ days, series, label }: {
  days: string[]; series: ChartSeries[]; label: string;
}) {
  const gid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const plotW = width - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const ticks = niceTicks(Math.max(0, ...series.flatMap((s) => s.values)));
  const top = ticks[ticks.length - 1];
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const xLabels = labelIndexes(n, width < 520 ? 4 : width < 800 ? 6 : 9);
  const active = hover !== null && hover < n ? hover : null;

  function indexAt(clientX: number): number {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || n < 2) return 0;
    const ratio = (clientX - rect.left - M.left) / plotW;
    return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return setHover(null);
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    setHover((cur) => Math.min(n - 1, Math.max(0, (cur ?? n - 1) + delta)));
  }

  // Подсказка держится внутри графика: у правого края переезжает влево от курсора.
  const tipLeft = active === null ? 0 : x(active);
  const tipFlip = tipLeft > width - 190;

  return (
    <div className="chart">
      <ul className="chart-legend" aria-hidden="true">
        {series.map((s) => (
          <li key={s.key}>
            <svg width="26" height="10" viewBox="0 0 26 10">
              <line x1="1" y1="5" x2="25" y2="5" stroke={`var(--chart-${s.color})`} strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray={s.dashed ? '5 5' : undefined} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <div className="chart-box" ref={box} tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}
        onPointerMove={(e) => setHover(indexAt(e.clientX))} onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => setHover(indexAt(e.clientX))}
        role="group" aria-label={`${label}. Стрелки влево и вправо — выбор дня.`}>
        <svg viewBox={`0 0 ${width} ${H}`} width="100%" height={H} role="img" aria-label={label}>
          <defs>
            {series.filter((s) => s.area).map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={`var(--chart-${s.color})`} stopOpacity=".26" />
                <stop offset="1" stopColor={`var(--chart-${s.color})`} stopOpacity=".02" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={M.left - 8} y={y(t)} dy=".32em" textAnchor="end">{t}</text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} className="chart-tick" x={x(i)} y={H - 8}
              textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{formatDay(days[i])}</text>
          ))}
          {series.map((s) => {
            const points: Point[] = s.values.map((v, i) => ({ x: x(i), y: y(v) }));
            const line = smoothPath(points);
            return (
              <g key={s.key}>
                {s.area && <path className="chart-area-in" d={areaPath(line, points, M.top + plotH)} fill={`url(#${gid}-${s.key})`} />}
                <path className={s.dashed ? 'chart-line-fade' : 'chart-line-draw'} pathLength={s.dashed ? undefined : 1}
                  d={line} fill="none" stroke={`var(--chart-${s.color})`} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '6 5' : undefined} />
              </g>
            );
          })}
          {active !== null && (
            <g>
              <line className="chart-cross" x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} />
              {series.map((s) => (
                <circle key={s.key} cx={x(active)} cy={y(s.values[active] ?? 0)} r="4.5"
                  fill={`var(--chart-${s.color})`} className="chart-dot" />
              ))}
            </g>
          )}
        </svg>
        {active !== null && (
          <div className="chart-tip" role="status"
            style={{ left: tipLeft, transform: tipFlip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
            <strong>{formatDay(days[active])}</strong>
            {series.map((s) => (
              <span key={s.key}>
                <i style={{ background: `var(--chart-${s.color})` }} className={s.dashed ? 'dashed' : undefined} />
                {s.label}<b>{s.values[active] ?? 0}</b>
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Те же числа таблицей — для читалок экрана. */}
      <table className="visually-hidden">
        <caption>{label}</caption>
        <thead><tr><th scope="col">День</th>{series.map((s) => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}><th scope="row">{formatDay(d)}</th>{series.map((s) => <td key={s.key}>{s.values[i] ?? 0}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
