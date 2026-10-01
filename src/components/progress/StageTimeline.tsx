'use client';
import type { StageInfo } from './deriveProgress';
import { stageCopy, stageTitle } from './stepCopy';
import { IconCheck } from '../icons';
import { useLocale, useT } from '@/i18n/client';
import { workbenchProgress } from '@/i18n/messages/workbench-progress';

export default function StageTimeline({ stages, now }: { stages: StageInfo[]; now: number }) {
  const t = useT(workbenchProgress);
  const locale = useLocale();
  const formatDuration = (ms: number): string => {
    const sec = Math.round(ms / 1000);
    return sec <= 0 ? t('lessThanSec') : t('seconds', { n: sec });
  };
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
            suffix = t('interrupted');
          }
          return (
            <div key={s.stage} className={`stage-chip stage-${s.status}`}>
              {s.status === 'done' && <span className="stage-check"><IconCheck size={13} /></span>}
              <span className="stage-chip-label">{stageTitle(s.stage, locale)}</span>
              {suffix && <span className="stage-chip-suffix">{suffix}</span>}
            </div>
          );
        })}
      </div>
      {active && <div className="stage-caption">{stageCopy(active.stage, locale)}</div>}
    </div>
  );
}
