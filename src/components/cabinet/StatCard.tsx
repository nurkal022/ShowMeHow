import Link from 'next/link';
import Sparkline from './charts/Sparkline';

export type StatTone = 'indigo' | 'blue' | 'amber' | 'rose' | 'teal';

/** Цветная карточка-показатель: число, подпись, пояснение и мини-график за 14 дней. */
export default function StatCard({ tone, value, label, hint, spark, sparkLabel, href, icon }: {
  tone: StatTone;
  value: number | string;
  label: string;
  hint?: string;
  spark?: number[];
  sparkLabel?: string;
  href?: string;
  icon?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="stat-card-top">
        <div>
          <strong>{typeof value === 'number' ? value.toLocaleString('ru-RU') : value}</strong>
          <span className="stat-card-label">{label}</span>
        </div>
        {icon && <span className="stat-card-icon">{icon}</span>}
      </div>
      {hint && <span className="stat-card-hint">{hint}</span>}
      <div className="stat-card-spark">
        {spark && spark.some((v) => v > 0)
          ? <Sparkline values={spark} label={sparkLabel ?? `${label}: динамика за ${spark.length} дней`} />
          : <span className="stat-card-flat" aria-hidden="true" />}
      </div>
    </>
  );
  const className = `stat-card tone-${tone}`;
  return href
    ? <Link href={href} className={className}>{body}</Link>
    : <div className={className}>{body}</div>;
}

export function StatCards({ children }: { children: React.ReactNode }) {
  return <div className="stat-cards">{children}</div>;
}
