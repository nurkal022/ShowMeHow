'use client';
import { useEffect, useState } from 'react';
import type { QualityReport } from '@/lib/pipeline/quality';
import { callApi } from '../cabinet/api';
import { IconCheck, IconClose, IconMinus, IconWand } from '../icons';

/**
 * Проверка качества открытого тренажёра: те же пробы, что при генерации, и сверка с
 * планом. Проваленное одной кнопкой уходит в доработку — без переписывания руками.
 */
export default function QualityPanel({ simId, busy, onClose, onFix }: {
  simId: string;
  busy: boolean;
  onClose: () => void;
  onFix: (instruction: string) => void;
}) {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await callApi<QualityReport>(`/api/simulations/${simId}/check`, 'POST', {});
      if (!alive) return;
      if (res.ok) setReport(res.data); else setError(res.error);
    })();
    return () => { alive = false; };
  }, [simId]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal quality-panel" role="dialog" aria-label="Проверка качества" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Проверка качества</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}><IconClose size={18} /></button>
        </div>
        {!report && !error && (
          <div className="quality-running"><span className="quality-spinner" aria-hidden />Запускаю тренажёр и прохожу пробы…</div>
        )}
        {error && <div className="error-box">{error}</div>}
        {report && (
          <>
            <div className={`quality-score ${report.failed ? 'warn' : 'ok'}`}>
              {report.failed ? `${report.failed} ${report.failed === 1 ? 'проблема' : 'проблемы'} из ${report.items.length} проверок`
                : `Все ${report.passed} проверок пройдены`}
            </div>
            <ul className="quality-list">
              {report.items.map((i) => (
                <li key={i.id + i.label} className={`q-${i.status}`}>
                  <span className="q-dot" aria-hidden>
                    {i.status === 'pass' ? <IconCheck size={12} /> : i.status === 'fail' ? '!' : <IconMinus size={12} />}
                  </span>
                  <div>
                    <b>{i.label}</b>
                    {i.detail && <span>{i.detail}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="plan-actions">
              {report.fixInstruction && (
                <button type="button" className="btn btn-primary" disabled={busy}
                  onClick={() => { onFix(report.fixInstruction!); onClose(); }}>
                  <IconWand size={16} />Починить проваленное
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClose}>Закрыть</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
