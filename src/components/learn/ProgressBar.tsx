'use client';
import { useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';

/** Полоса «сделано из скольких» с подписью. total = 0 — полоса пустая, подпись «нет». */
export default function ProgressBar({ label, value, total }: { label: string; value: number; total: number }) {
  const t = useT(learn);
  const share = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="learn-bar">
      <div className="learn-bar-head">
        <span>{label}</span>
        <span className="learn-bar-num">{total ? t('ofTotal', { a: value, b: total }) : t('none')}</span>
      </div>
      <div className="learn-bar-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        <div className={share === 100 ? 'learn-bar-fill full' : 'learn-bar-fill'} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}
