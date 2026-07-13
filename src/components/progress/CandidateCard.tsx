'use client';
import { useState } from 'react';
import type { RubricScores } from '@/lib/types';
import type { CandidateInfo } from './deriveProgress';

const STATUS_LABELS: Record<CandidateInfo['status'], string> = {
  generating: 'генерация', rendering: 'проверка рендера', fixing: 'автопочинка',
  critiquing: 'критика', ok: '✓ готов', failed: '✗ выбыл',
};

const SCORE_DIMS: { key: keyof RubricScores; label: string; cls: string }[] = [
  { key: 'physics', label: 'Физика', cls: 'dim-physics' },
  { key: 'clarity', label: 'Наглядность', cls: 'dim-clarity' },
  { key: 'interactivity', label: 'Интерактив', cls: 'dim-interactivity' },
  { key: 'aesthetics', label: 'Эстетика', cls: 'dim-aesthetics' },
];

export default function CandidateCard({ candidate }: { candidate: CandidateInfo }) {
  const [showIssues, setShowIssues] = useState(false);
  const classes = ['candidate-card'];
  if (candidate.isWinner) classes.push('winner');
  if (candidate.status === 'failed') classes.push('failed');

  return (
    <div className={classes.join(' ')}>
      {candidate.isWinner && <span className="winner-badge" title="Победитель">👑</span>}
      <div className="candidate-card-head">
        Кандидат {candidate.index + 1} · {candidate.styleHint || '…'}
      </div>
      <div className="candidate-status">{STATUS_LABELS[candidate.status] ?? candidate.status}</div>
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
