'use client';
import { useEffect, useState } from 'react';
import type { QualityReport } from '@/lib/pipeline/quality';
import { callApi } from '../cabinet/api';
import { IconCheck, IconClose, IconMinus, IconWand } from '../icons';
import { useFormat, useT } from '@/i18n/client';
import { workbench } from '@/i18n/messages/workbench';
import { common } from '@/i18n/messages/common';


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
  const t = useT(workbench);
  const tc = useT(common);
  const f = useFormat();

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
      <div className="modal quality-panel" role="dialog" aria-label={t('qualityTitle')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('qualityTitle')}</h2>
          <button type="button" className="icon-btn" aria-label={tc('close')} onClick={onClose}><IconClose size={18} /></button>
        </div>
        {!report && !error && (
          <div className="quality-running"><span className="quality-spinner" aria-hidden />{t('qualityRunning')}</div>
        )}
        {error && <div className="error-box">{f.message(error)}</div>}
        {report && (
          <>
            <div className={`quality-score ${report.failed ? 'warn' : 'ok'}`}>
              {report.failed ? t('qualityFailed', { n: report.failed, total: report.items.length })
                : t('qualityPassed', { n: report.passed })}
            </div>
            <ul className="quality-list">
              {report.items.map((i) => (
                <li key={i.id + i.label} className={`q-${i.status}`}>
                  <span className="q-dot" aria-hidden>
                    {i.status === 'pass' ? <IconCheck size={12} /> : i.status === 'fail' ? '!' : <IconMinus size={12} />}
                  </span>
                  <div>
                    <b>{f.message(i.label)}</b>
                    {i.detail && <span>{f.message(i.detail)}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="plan-actions">
              {report.fixInstruction && (
                <button type="button" className="btn btn-primary" disabled={busy}
                  onClick={() => { onFix(report.fixInstruction!); onClose(); }}>
                  <IconWand size={16} />{t('fixFailed')}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClose}>{tc('close')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
