'use client';
import { useEffect, useMemo, useState } from 'react';
import type { PipelineEvent } from '@/lib/types';
import type { JobKind } from '@/lib/jobs/store';
import { deriveProgress } from './deriveProgress';
import StageTimeline from './StageTimeline';
import PlanCard from './PlanCard';
import CandidateCard from './CandidateCard';
import RefinePanel from './RefinePanel';
import BuildCard from './BuildCard';
import { queuedCopy } from './stepCopy';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { workbenchProgress } from '@/i18n/messages/workbench-progress';


/**
 * Единственный источник состояния — events[]: всё, что показывается, вычисляется
 * заново из истории событий (useMemo), поэтому реплей после перезагрузки страницы
 * восстанавливает идентичную картинку. Единственное, что не берётся из events —
 * тикающее «сейчас» для отображения секунд у активного чипа; это чисто UI-таймер,
 * не влияющий на derive() и останавливающийся, как только нет ни одного активного этапа.
 */
export default function ProgressView(
  { events, kind = 'generate' }: { events: PipelineEvent[]; kind?: JobKind },
) {
  const state = useMemo(() => deriveProgress(events), [events]);
  const t = useT(workbenchProgress);
  const f = useFormat();
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const hasActiveStage = state.stages.some((s) => s.status === 'active');

  useEffect(() => {
    if (!hasActiveStage) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActiveStage]);

  if (events.length === 0) return null;

  return (
    <div className="progress-view">
      {state.queuePosition > 0
        ? <div className="queue-banner">{queuedCopy(state.queuePosition, locale)}</div>
        : <StageTimeline stages={state.stages} now={now} />}
      {state.plan && <PlanCard plan={state.plan} />}
      <BuildCard physics={state.physicsCheck} layers={state.layers} />
      {state.candidates.length > 0 && (
        <div className="candidates-row">
          {state.candidates.map((c) => <CandidateCard key={c.index} candidate={c} />)}
        </div>
      )}
      {state.refineRounds.length > 0 && (
        <RefinePanel rounds={state.refineRounds} feedback={state.judgeFeedback} />
      )}
      {state.warnings.map((w, i) => <div className="warn-banner" key={i}>{f.message(w)}</div>)}
      {state.terminal?.type === 'error' && (
        <div className="error-box">{f.message(state.terminal.message)}</div>
      )}
      {state.terminal?.type === 'cancelled' && (
        <div className="cancel-banner">
          {kind === 'refine' ? t('refineCancelled') : t('genCancelled')}
        </div>
      )}
    </div>
  );
}
