'use client';
import { useState } from 'react';
import type { RubricScores } from '@/lib/types';
import type { CandidateInfo } from './deriveProgress';
import { candidateCopy } from './stepCopy';
import { IconCheck } from '../icons';
import { useLocale, useT } from '@/i18n/client';
import { workbenchProgress } from '@/i18n/messages/workbench-progress';


const SCORE_DIMS: { key: keyof RubricScores; label: keyof typeof workbenchProgress.ru; cls: string }[] = [
  { key: 'physics', label: 'dimPhysics', cls: 'dim-physics' },
  { key: 'clarity', label: 'dimClarity', cls: 'dim-clarity' },
  { key: 'interactivity', label: 'dimInteractivity', cls: 'dim-interactivity' },
  { key: 'aesthetics', label: 'dimAesthetics', cls: 'dim-aesthetics' },
  { key: 'depth', label: 'dimDepth', cls: 'dim-depth' },
];

export default function CandidateCard({ candidate }: { candidate: CandidateInfo }) {
  const [showIssues, setShowIssues] = useState(false);
  const t = useT(workbenchProgress);
  const locale = useLocale();
  const classes = ['candidate-card'];
  if (candidate.status === 'failed') classes.push('failed');

  return (
    <div className={classes.join(' ')}>
      <div className="candidate-card-head">{t('candidate')}</div>
      <div className={`candidate-status status-${candidate.status}`}>
        {candidateCopy(candidate.status, locale)}
      </div>
      {candidate.screenshot && (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL screenshot, next/image не умеет
        <img src={candidate.screenshot} alt="" className="candidate-shot" />
      )}
      {candidate.critic && (
        candidate.critic.issues.length === 0 ? (
          <div className="candidate-critic ok"><IconCheck size={14} />{t('physicsOk')}</div>
        ) : (
          <details
            className="candidate-critic warn"
            open={showIssues}
            onToggle={(e) => setShowIssues(e.currentTarget.open)}
          >
            <summary>{t('issues', { n: candidate.critic.issues.length })}</summary>
            <ul>
              {candidate.critic.issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          </details>
        )
      )}
      {candidate.probes && (
        <div className={candidate.probes.failed.length ? 'cand-probes warn' : 'cand-probes ok'}>
          {candidate.probes.failed.length === 0
            ? t('probesPassed', { pct: Math.round(candidate.probes.passRate * 100) })
            : t('probesFailed', { n: candidate.probes.failed.length })}
          {candidate.probes.failed.length > 0 && (
            <ul>{candidate.probes.failed.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
        </div>
      )}
      {candidate.scores && (
        <div className="score-bars">
          {SCORE_DIMS.map((d) => {
            const value = candidate.scores![d.key];
            if (value === undefined) return null;
            return (
              <div className="score-bar-row" key={d.key}>
                <span className="score-bar-label">{t(d.label)}</span>
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
