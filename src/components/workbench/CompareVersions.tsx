'use client';
import { useEffect, useRef, useState } from 'react';
import { historyLabel } from '@/lib/history-label';
import { callApi } from '../cabinet/api';
import { IconClose } from '../icons';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { workbench } from '@/i18n/messages/workbench';
import { common } from '@/i18n/messages/common';


/** Размер «ноутбука», в котором отрисовывается каждая версия: иначе кит в узкой колонке включит мобильную раскладку. */
const W = 1280;
const H = 800;

/**
 * Живой тренажёр в полном размере, уменьшенный под колонку. Масштаб пересчитывается
 * по ширине колонки, панели кита остаются развёрнутыми, как у ученика на ноутбуке.
 */
function ScaledFrame({ html, title }: { html: string | null; title: string }) {
  const t = useT(workbench);
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setK(Math.min(el.clientWidth / W, el.clientHeight / H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="compare-stage" ref={box}>
      {html
        ? <iframe title={title} sandbox="allow-scripts" srcDoc={html}
            style={{ width: W, height: H, transform: `scale(${k})` }} />
        : <div className="preview-empty">{t('loadingDots')}</div>}
    </div>
  );
}

/**
 * Две версии рядом, обе живые: после доработки видно, что именно поменялось, и
 * можно вернуть прежнюю одной кнопкой. Слева — выбранная из истории, справа — текущая.
 */
export default function CompareVersions({ simId, current, history, initial, busy, onRestore, onClose }: {
  simId: string;
  current: string | null;
  history: string[];
  initial?: string;
  busy: boolean;
  onRestore: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial ?? history[0] ?? '');
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT(workbench);
  const f = useFormat();
  const locale = useLocale();
  const tc = useT(common);

  useEffect(() => {
    if (!name) return;
    let alive = true;
    setHtml(null); setError(null);
    (async () => {
      const res = await callApi<{ html: string }>(
        `/api/simulations/${simId}/history?name=${encodeURIComponent(name)}`, 'GET');
      if (!alive) return;
      if (res.ok) setHtml(res.data.html); else setError(res.error);
    })();
    return () => { alive = false; };
  }, [simId, name]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal compare-modal" role="dialog" aria-label={t('compareTitle')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('compareTitle')}</h2>
          <button type="button" className="icon-btn" aria-label={tc('close')} onClick={onClose}><IconClose size={18} /></button>
        </div>
        <div className="compare-grid">
          <div className="compare-col">
            <div className="compare-bar">
              <select value={name} onChange={(e) => setName(e.target.value)} aria-label={t('historyVersion')}>
                {history.map((h) => <option key={h} value={h}>{historyLabel(h, locale)}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy || !name}
                onClick={() => { onRestore(name); onClose(); }}>{t('restoreThis')}</button>
            </div>
            {error ? <div className="error-box">{f.message(error)}</div> : <ScaledFrame html={html} title={t('historyVersion')} />}
          </div>
          <div className="compare-col">
            <div className="compare-bar"><b>{t('now')}</b></div>
            <ScaledFrame html={current} title={t('currentVersion')} />
          </div>
        </div>
      </div>
    </div>
  );
}
