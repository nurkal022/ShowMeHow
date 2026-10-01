import Link from 'next/link';
import Sparkline from './charts/Sparkline';
import CountUp from '@/components/motion/CountUp';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { cabinet } from '@/i18n/messages/cabinet';

export type StatTone = 'indigo' | 'blue' | 'amber' | 'rose' | 'teal';

/** Цветная карточка-показатель: число, подпись, пояснение и мини-график за 14 дней. */
export default function StatCard({ tone, value, label, hint, spark, sparkLabel, href, icon, locale = 'ru' }: {
  tone: StatTone;
  value: number | string;
  label: string;
  hint?: string;
  spark?: number[];
  sparkLabel?: string;
  href?: string;
  icon?: React.ReactNode;
  /** Язык подписи мини-графика по умолчанию (компонент серверный). */
  locale?: Locale;
}) {
  const body = (
    <>
      <div className="stat-card-top">
        <div>
          <strong>{typeof value === 'number' ? <CountUp value={value} /> : value}</strong>
          <span className="stat-card-label">{label}</span>
        </div>
        {icon && <span className="stat-card-icon">{icon}</span>}
      </div>
      {hint && <span className="stat-card-hint">{hint}</span>}
      <div className="stat-card-spark">
        {spark && spark.some((v) => v > 0)
          ? <Sparkline values={spark} label={sparkLabel ?? translator(cabinet, locale)('sparkLabel', { label, n: spark.length })} />
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
