import { parseNumber } from '@/lib/lms/answers';
import type { TableColumn } from '@/lib/lms/block-schema';

const W = 520; const H = 260; const PAD = { l: 52, r: 16, t: 14, b: 40 };

function ticks(min: number, max: number): number[] {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const nice = [1, 2, 5, 10].map((m) => m * step).find((s) => span / s <= 6) ?? step * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / nice) * nice; v <= max + 1e-9; v += nice) out.push(Number(v.toPrecision(10)));
  return out;
}
const fmt = (v: number) => String(Number(v.toPrecision(4))).replace('.', ',');

/** График по таблице измерений: первый столбец — по горизонтали, второй — по вертикали. Чистый SVG, рисуется и на сервере. */
export default function MeasureChart({ columns, rows }: { columns: TableColumn[]; rows: string[][] }) {
  const pts = rows.map((r) => [parseNumber(r[0] ?? ''), parseNumber(r[1] ?? '')] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null)
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return <p className="muted measure-chart-empty">График появится, когда будут заполнены хотя бы две строки.</p>;
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const pad = (a: number, b: number) => (a === b ? [a - 1, b + 1] : [a - (b - a) * 0.08, b + (b - a) * 0.08]);
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs)); const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const px = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const py = (y: number) => H - PAD.b - ((y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const label = (c: TableColumn) => (c.unit ? `${c.label}, ${c.unit}` : c.label);
  return (
    <figure className="measure-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`График: ${label(columns[1])} от ${label(columns[0])}`}>
        {ticks(y0, y1).map((t) => (
          <g key={`y${t}`}><line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} className="chart-grid" />
            <text x={PAD.l - 8} y={py(t) + 4} textAnchor="end" className="chart-tick">{fmt(t)}</text></g>
        ))}
        {ticks(x0, x1).map((t) => (
          <text key={`x${t}`} x={px(t)} y={H - PAD.b + 16} textAnchor="middle" className="chart-tick">{fmt(t)}</text>
        ))}
        <polyline points={pts.map((p) => `${px(p[0])},${py(p[1])}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={px(p[0])} cy={py(p[1])} r="4.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />)}
        <text x={(W + PAD.l - PAD.r) / 2} y={H - 6} textAnchor="middle" className="chart-axis">{label(columns[0])}</text>
        <text x={14} y={(H - PAD.b + PAD.t) / 2} textAnchor="middle" className="chart-axis" transform={`rotate(-90 14 ${(H - PAD.b + PAD.t) / 2})`}>{label(columns[1])}</text>
      </svg>
    </figure>
  );
}
