import { areaPath, smoothPath, type Point } from './scale';

const W = 120;
const H = 36;
const PAD = 3;

/**
 * Мини-график в карточке: линия с заливкой в цвете текста карточки (currentColor).
 * Точных чисел он не несёт — они в подписи; для читалок есть aria-label.
 */
export default function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const points: Point[] = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - PAD - (v / max) * (H - PAD * 2),
  }));
  const line = smoothPath(points);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="chart-area-in" d={areaPath(line, points, H)} fill="currentColor" opacity=".16" />
      <path className="chart-line-fade" d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
        strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity=".9" />
    </svg>
  );
}
