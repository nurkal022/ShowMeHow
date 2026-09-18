'use client';
import { useRef, useState } from 'react';
import SimStateFrame, { type CaptureSimState } from '@/components/lms/SimStateFrame';
import { defaultTolerance, SIM_LIMITS } from '@/lib/lms/sim-state';
import type { SimTargetRow } from './assignment-form';

/**
 * Режим «задать цель»: учитель выставляет контролы в симуляции и фиксирует их
 * значения. Что именно проверять и с каким допуском — решает здесь же.
 */
export default function SimStateEditor({ simulationId, rows, showHints, invalid, onRows, onShowHints }: {
  simulationId: string; rows: SimTargetRow[]; showHints: boolean; invalid?: boolean;
  onRows: (rows: SimTargetRow[]) => void; onShowHints: (v: boolean) => void;
}) {
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
          {rows.length > 0 ? 'Зафиксировать заново' : 'Зафиксировать как цель'}
        </button>
        <span className="muted">Выставьте ползунки и переключатели так, как должно получиться у ученика.</span>
      </div>
      {problem === 'wait' && (
        <p className="warn-banner" role="alert">Симуляция ещё загружается или не отвечает. Подождите пару секунд и нажмите снова.</p>
      )}
      {problem === 'none' && (
        <p className="warn-banner" role="alert">
          Эта симуляция не сообщает значения своих параметров, поэтому проверить состояние автоматически нельзя.
          Выберите другую симуляцию или сделайте задание с развёрнутым ответом, поставив эту симуляцию стендом.
        </p>
      )}
      {rows.length > 0 && (
        <div className={invalid ? 'cf-simstate-table invalid' : 'cf-simstate-table'} role="group" aria-label="Параметры цели">
          <div className="cf-simstate-row cf-simstate-head" aria-hidden="true">
            <span>Проверять</span><span>Параметр</span><span>Цель</span><span>Допуск (±)</span>
          </div>
          {rows.map((r) => (
            <div key={r.name} className={r.include ? 'cf-simstate-row' : 'cf-simstate-row off'}>
              <input type="checkbox" checked={r.include} aria-label={`Проверять «${r.label}»`}
                onChange={(e) => patch(r.name, { include: e.target.checked })} />
              <span className="cf-simstate-label">{r.label}</span>
              <input className="input" inputMode="decimal" value={r.value} disabled={!r.include}
                aria-label={`Цель для «${r.label}»`} onChange={(e) => patch(r.name, { value: e.target.value })} />
              <input className="input" inputMode="decimal" value={r.tolerance} disabled={!r.include}
                aria-label={`Допуск для «${r.label}»`} onChange={(e) => patch(r.name, { tolerance: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      <label className="check-row">
        <input type="checkbox" checked={!showHints} onChange={(e) => onShowHints(!e.target.checked)} />
        Не подсказывать ученику, какие параметры совпали
      </label>
      <p className="muted">
        Балл — доля совпавших параметров (шаг 0,5); все в допуске — полный балл. Переключатель — это 0 или 1.
        Состояние присылает браузер ученика: для текущего контроля этого достаточно, для экзамена — нет.
      </p>
    </div>
  );
}
