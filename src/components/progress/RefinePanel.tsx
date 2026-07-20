'use client';
import { minScore } from '@/lib/types';
import type { RefineRoundInfo } from './deriveProgress';
import { refineCopy } from './stepCopy';

export default function RefinePanel(
  { rounds, feedback }: { rounds: RefineRoundInfo[]; feedback: string | null },
) {
  return (
    <div className="refine-panel">
      <h4>Доводка</h4>
      {rounds.map((r) => (
        <div className="refine-round" key={r.round}>
          <div className="refine-round-copy">{refineCopy(r.round)}</div>
          <div className="refine-round-delta">
            мин. оценка {minScore(r.before).toFixed(1)} →{' '}
            {r.after ? minScore(r.after).toFixed(1) : 'прервано'}
          </div>
        </div>
      ))}
      {feedback && (
        <details className="refine-feedback">
          <summary>Замечания судьи</summary>
          <p>{feedback}</p>
        </details>
      )}
    </div>
  );
}
