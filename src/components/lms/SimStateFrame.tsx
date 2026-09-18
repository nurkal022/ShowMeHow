'use client';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import PreviewFrame from '@/components/PreviewFrame';
import { requestSimState } from '@/lib/lms/sim-bridge';
import type { BridgeReply } from '@/lib/lms/sim-state';

type Load = { state: 'loading' } | { state: 'ready'; html: string } | { state: 'missing' } | { state: 'error' };
export type CaptureSimState = () => Promise<BridgeReply>;

/**
 * Симуляция задания «Состояние симуляции»: тот же iframe, что у тренажёра в уроке,
 * плюс capture — снять значения контролов через мост.
 */
export default function SimStateFrame({ simulationId, captureRef }: {
  simulationId: string; captureRef: MutableRefObject<CaptureSimState | null>;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoad({ state: 'loading' });
    fetch(`/api/simulations/${simulationId}`)
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 404) return setLoad({ state: 'missing' });
        if (!res.ok) return setLoad({ state: 'error' });
        const body = await res.json();
        setLoad({ state: 'ready', html: String(body.html ?? '') });
      })
      .catch(() => { if (alive) setLoad({ state: 'error' }); });
    return () => { alive = false; };
  }, [simulationId]);

  useEffect(() => {
    captureRef.current = () => requestSimState(frameRef.current);
    return () => { captureRef.current = null; };
  }, [captureRef]);

  if (load.state === 'missing') return <p className="empty-state">Симуляция удалена автором.</p>;
  if (load.state === 'error') return <p className="error-box">Не удалось загрузить симуляцию. Обновите страницу.</p>;
  return (
    <figure className="embed">
      <div className="embed-frame">
        {load.state === 'ready'
          ? <PreviewFrame html={load.html} frameRef={frameRef} />
          : <div className="preview-empty">Загружаю симуляцию…</div>}
      </div>
    </figure>
  );
}
