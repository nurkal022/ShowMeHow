/** Полоса «сделано из скольких» с подписью. total = 0 — полоса пустая, подпись «нет». */
export default function ProgressBar({ label, value, total }: { label: string; value: number; total: number }) {
  const share = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="learn-bar">
      <div className="learn-bar-head">
        <span>{label}</span>
        <span className="learn-bar-num">{total ? `${value} из ${total}` : 'нет'}</span>
      </div>
      <div className="learn-bar-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        <div className={share === 100 ? 'learn-bar-fill full' : 'learn-bar-fill'} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}
