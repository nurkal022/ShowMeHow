import Link from 'next/link';
import { formatAgo } from '@/lib/lms/format';

/**
 * Мелкие наглядные элементы кабинетов: кольцо прогресса, тепловая карта дней,
 * аватар с инициалами, лента событий. Всё рисуется на сервере, движение — в CSS.
 */

export function Ring({ value, size = 56, stroke = 6, tone = 'var(--accent)', label, children }: {
  value: number | null; size?: number; stroke?: number; tone?: string; label: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <span className="ring" style={{ width: size, height: size, ['--ring-tone' as string]: tone }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        {value !== null && v > 0 && (
          <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none"
            strokeDasharray={c} strokeLinecap="round"
            style={{ ['--ring-c' as string]: c, strokeDashoffset: c * (1 - v / 100) }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <span className="ring-center">{children ?? (value === null ? '—' : `${v}%`)}</span>
    </span>
  );
}

const PALETTE = ['#5b5bd6', '#3457e6', '#0c8f7f', '#c77700', '#d6336c', '#7c3aed', '#0f766e', '#b45309'];

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar-chip" aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.38, ['--av' as string]: PALETTE[h % PALETTE.length] }}>
      {initials}
    </span>
  );
}

/** Квадратики по дням, неделя — столбец (пн сверху). Цвет — доля от максимума. */
export function Heatmap({ days, values, label }: { days: string[]; values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const first = new Date(`${days[0]}T00:00:00`);
  const pad = (first.getDay() + 6) % 7;
  const cells: ({ day: string; n: number } | null)[] = [...Array(pad).fill(null), ...days.map((d, i) => ({ day: d, n: values[i] }))];
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  return (
    <div className="heatmap" role="img" aria-label={label}>
      <div className="heatmap-days" aria-hidden="true"><span>пн</span><span /><span>ср</span><span /><span>пт</span><span /><span /></div>
      <div className="heatmap-grid">
        {weeks.map((w, wi) => (
          <div key={wi} className="heatmap-week">
            {w.map((c, di) => c
              ? <i key={di} className={`hm-${level(c.n)}`} style={{ animationDelay: `${wi * 18 + di * 6}ms` }}
                  title={`${new Date(`${c.day}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: ${c.n}`} />
              : <i key={di} className="hm-none" />)}
          </div>
        ))}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        меньше <i className="hm-0" /><i className="hm-1" /><i className="hm-2" /><i className="hm-3" /><i className="hm-4" /> больше
      </div>
    </div>
  );
}

export interface TimelineItem {
  key: string; icon: React.ReactNode; tone: 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'gray';
  who: string; text: React.ReactNode; at: string; href?: string | null;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="timeline">
      {items.map((it) => {
        const body = (
          <>
            <span className={`timeline-dot t-${it.tone}`}>{it.icon}</span>
            <span className="timeline-body">
              <span><b>{it.who}</b> {it.text}</span>
              <time dateTime={it.at} title={new Date(it.at).toLocaleString('ru-RU')}>{formatAgo(it.at)}</time>
            </span>
          </>
        );
        return <li key={it.key}>{it.href ? <Link href={it.href}>{body}</Link> : <div>{body}</div>}</li>;
      })}
    </ol>
  );
}

/** Горизонтальная полоса-доля с подписью. */
export function Bar({ value, tone = 'var(--accent)', label }: { value: number; tone?: string; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
      <i style={{ width: `${v}%`, background: tone }} />
    </span>
  );
}
