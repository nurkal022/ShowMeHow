'use client';
import { minScore } from '@/lib/types';
import type { RefineRoundInfo } from './deriveProgress';
import { refineCopy } from './stepCopy';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { workbenchProgress } from '@/i18n/messages/workbench-progress';

export default function RefinePanel(
  { rounds, feedback }: { rounds: RefineRoundInfo[]; feedback: string | null },
) {
  const t = useT(workbenchProgress);
  const f = useFormat();
  const locale = useLocale();
  return (
    <div className="refine-panel">
      <h4>{t('refining')}</h4>
      {rounds.map((r) => (
        <div className="refine-round" key={r.round}>
          <div className="refine-round-copy">{refineCopy(r.round, locale)}</div>
          <div className="refine-round-delta">
            {t('minScore')} {minScore(r.before).toFixed(1)} →{' '}
            {r.after ? minScore(r.after).toFixed(1) : t('interrupted')}
          </div>
        </div>
      ))}
      {feedback && (
        <details className="refine-feedback">
          <summary>{t('judgeNotes')}</summary>
          <p>{f.message(feedback)}</p>
        </details>
      )}
    </div>
  );
}
