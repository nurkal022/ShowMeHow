'use client';
import { useState } from 'react';
import type { RubricScores } from '@/lib/types';
import type { CandidateInfo } from './deriveProgress';
import { candidateCopy } from './stepCopy';

const SCORE_DIMS: { key: keyof RubricScores; label: string; cls: string }[] = [
  { key: 'physics', label: 'Физика', cls: 'dim-physics' },
  { key: 'clarity', label: 'Наглядность', cls: 'dim-clarity' },
  { key: 'interactivity', label: 'Интерактив', cls: 'dim-interactivity' },
  { key: 'aesthetics', label: 'Эстетика', cls: 'dim-aesthetics' },
];

export default function CandidateCard({ candidate }: { candidate: CandidateInfo }) {
  const [showIssues, setShowIssues] = useState(false);
  const classes = ['candidate-card'];
  if (candidate.status === 'failed') classes.push('failed');

  return (
    <div className={classes.join(' ')}>
      <div className="candidate-card-head">Кандидат</div>
      <div className={`candidate-status status-${candidate.status}`}>
        {candidateCopy(candidate.status)}
      </div>
      {candidate.screenshot && (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL screenshot, next/image не умеет
        <img src={candidate.screenshot} alt="" className="candidate-shot" />
      )}
      {candidate.critic && (
        candidate.critic.issues.length === 0 ? (
          <div className="candidate-critic ok">✓ физика ок</div>
        ) : (
          <details
            className="candidate-critic warn"
            open={showIssues}
            onToggle={(e) => setShowIssues(e.currentTarget.open)}
          >
            <summary>⚠ {candidate.critic.issues.length} замечаний</summary>
            <ul>
              {candidate.critic.issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          </details>
        )
      )}
      {candidate.probes && (
        <div className={candidate.probes.failed.length ? 'cand-probes warn' : 'cand-probes ok'}>
          {candidate.probes.failed.length === 0
            ? `✓ пробы пройдены (${Math.round(candidate.probes.passRate * 100)}%)`
            : `⚠ пробы: ${candidate.probes.failed.length} провал(ов)`}
          {candidate.probes.failed.length > 0 && (
            <ul>{candidate.probes.failed.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
        </div>
      )}
      {candidate.scores && (
        <div className="score-bars">
          {SCORE_DIMS.map((d) => {
            const value = candidate.scores![d.key];
            return (
              <div className="score-bar-row" key={d.key}>
                <span className="score-bar-label">{d.label}</span>
                <div className="score-bar-track">
                  <div className={`score-bar-fill ${d.cls}`} style={{ width: `${value * 10}%` }} />
                </div>
                <span className="score-bar-num">{value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
