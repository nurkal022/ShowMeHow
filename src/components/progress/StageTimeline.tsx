'use client';
import { STAGE_LABELS, type StageInfo } from './deriveProgress';
import { stageCopy } from './stepCopy';
import { IconCheck } from '../icons';

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  return sec <= 0 ? '<1с' : `${sec}с`;
}

export default function StageTimeline({ stages, now }: { stages: StageInfo[]; now: number }) {
  const active = stages.find((s) => s.status === 'active');
  const doneCount = stages.filter((s) => s.status === 'done').length;
  const pct = Math.round((doneCount / stages.length) * 100);
  return (
    <div className="stage-timeline-wrap">
      <div className="stage-progressbar" aria-hidden>
        <div className="stage-progressbar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="stage-timeline">
        {stages.map((s) => {
          let suffix: string | null = null;
          if (s.status === 'done' && s.startAt != null && s.endAt != null) {
            suffix = formatDuration(s.endAt - s.startAt);
          } else if (s.status === 'active' && s.startAt != null) {
            suffix = formatDuration(now - s.startAt);
          } else if (s.status === 'skipped') {
            suffix = '—';
          } else if (s.status === 'interrupted') {
            suffix = 'прервано';
          }
          return (
            <div key={s.stage} className={`stage-chip stage-${s.status}`}>
              {s.status === 'done' && <span className="stage-check"><IconCheck size={13} /></span>}
              <span className="stage-chip-label">{STAGE_LABELS[s.stage]}</span>
              {suffix && <span className="stage-chip-suffix">{suffix}</span>}
            </div>
          );
        })}
      </div>
      {active && <div className="stage-caption">{stageCopy(active.stage)}</div>}
    </div>
  );
}
