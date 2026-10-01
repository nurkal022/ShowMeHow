'use client';
import { useRef, useState } from 'react';
import SimStateFrame, { type CaptureSimState } from '@/components/lms/SimStateFrame';
import { defaultTolerance, SIM_LIMITS } from '@/lib/lms/sim-state';
import type { SimTargetRow } from './assignment-form';
import { useT } from '@/i18n/client';
import { teachLesson } from '@/i18n/messages/teach-lesson';

/**
 * Режим «задать цель»: учитель выставляет контролы в симуляции и фиксирует их
 * значения. Что именно проверять и с каким допуском — решает здесь же.
 */
export default function SimStateEditor({ simulationId, rows, showHints, invalid, onRows, onShowHints }: {
  simulationId: string; rows: SimTargetRow[]; showHints: boolean; invalid?: boolean;
  onRows: (rows: SimTargetRow[]) => void; onShowHints: (v: boolean) => void;
}) {
  const t = useT(teachLesson);
  const captureRef = useRef<CaptureSimState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'' | 'wait' | 'none'>('');

  async function capture() {
    setBusy(true);
    setProblem('');
    const reply = captureRef.current ? await captureRef.current() : null;
    setBusy(false);
    if (!reply || !reply.ok) {
      setProblem(!reply || reply.reason === 'timeout' || reply.reason === 'no-frame' ? 'wait' : 'none');
      return;
    }
    const old = new Map(rows.map((r) => [r.name, r]));
    let included = 0;
    onRows(reply.controls.map((c) => {
      const prev = old.get(c.name);
      // Повторная фиксация обновляет значения, а выбор параметров и допуски сохраняет.
      const include = (prev ? prev.include : rows.length === 0 && c.kind !== 'speed') && included < SIM_LIMITS.maxTargets;
      if (include) included += 1;
      return { name: c.name, label: c.label, include, value: String(c.value),
        tolerance: prev ? prev.tolerance : String(defaultTolerance(c)) };
    }));
  }

  const patch = (name: string, p: Partial<SimTargetRow>) => onRows(rows.map((r) => (r.name === name ? { ...r, ...p } : r)));

  return (
    <div className="cf-simstate">
      <SimStateFrame simulationId={simulationId} captureRef={captureRef} />
      <div className="cf-inline">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={capture}>
          {rows.length > 0 ? t('captureAgain') : t('capture')}
        </button>
        <span className="muted">{t('captureHint')}</span>
      </div>
      {problem === 'wait' && (
        <p className="warn-banner" role="alert">{t('simWait')}</p>
      )}
      {problem === 'none' && (
        <p className="warn-banner" role="alert">
          {t('simNone')}
        </p>
      )}
      {rows.length > 0 && (
        <div className={invalid ? 'cf-simstate-table invalid' : 'cf-simstate-table'} role="group" aria-label={t('targetParams')}>
          <div className="cf-simstate-row cf-simstate-head" aria-hidden="true">
            <span>{t('check')}</span><span>{t('param')}</span><span>{t('target')}</span><span>{t('tolerance')}</span>
          </div>
          {rows.map((r) => (
            <div key={r.name} className={r.include ? 'cf-simstate-row' : 'cf-simstate-row off'}>
              <input type="checkbox" checked={r.include} aria-label={t('checkParam', { label: r.label })}
                onChange={(e) => patch(r.name, { include: e.target.checked })} />
              <span className="cf-simstate-label">{r.label}</span>
              <input className="input" inputMode="decimal" value={r.value} disabled={!r.include}
                aria-label={t('targetFor', { label: r.label })} onChange={(e) => patch(r.name, { value: e.target.value })} />
              <input className="input" inputMode="decimal" value={r.tolerance} disabled={!r.include}
                aria-label={t('toleranceFor', { label: r.label })} onChange={(e) => patch(r.name, { tolerance: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      <label className="check-row">
        <input type="checkbox" checked={!showHints} onChange={(e) => onShowHints(!e.target.checked)} />
        {t('noHints')}
      </label>
      <p className="muted">
        {t('scoring')}
      </p>
    </div>
  );
}
