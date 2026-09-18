'use client';
import { useEffect, useRef, useState } from 'react';
import PreviewFrame from '@/components/PreviewFrame';
import { IconClose, IconExpand, IconLock } from '@/components/icons';
import { applySimPreset } from '@/lib/lms/sim-bridge';

type Load = { state: 'loading' } | { state: 'ready'; html: string } | { state: 'missing' } | { state: 'error' };

/**
 * Тренажёр внутри урока. missing — сервер уже знает, что автор удалил симуляцию;
 * 404 от API значит то же самое. preset и locked — стартовые значения и закрытые
 * учителем ползунки. «Крупнее» разворачивает сцену поверх урока, не уводя со страницы.
 */
export default function SimulationEmbed({ simulationId, missing, caption, preset, locked }: {
  simulationId: string | null; missing: boolean; caption: string;
  preset?: Record<string, number>; locked?: string[];
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [theater, setTheater] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const presetKey = JSON.stringify([preset ?? {}, locked ?? []]);

  useEffect(() => {
    if (!simulationId || missing) return;
    let alive = true;
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
  }, [simulationId, missing]);

  useEffect(() => {
    if (load.state !== 'ready') return;
    const [values, locks] = JSON.parse(presetKey) as [Record<string, number>, string[]];
    if (Object.keys(values).length === 0 && locks.length === 0) return;
    void applySimPreset(frameRef.current, values, locks);
  }, [load.state, presetKey]);

  useEffect(() => {
    if (!theater) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTheater(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [theater]);

  if (!simulationId) return <p className="empty-state">Тренажёр ещё не выбран.</p>;
  if (missing || load.state === 'missing') return <p className="empty-state">Тренажёр удалён автором.</p>;
  if (load.state === 'error') {
    return <p className="error-box">Не удалось загрузить тренажёр. Обновите страницу.</p>;
  }
  return (
    <figure className={theater ? 'embed embed-theater' : 'embed'}>
      {theater && <button type="button" className="embed-theater-scrim" aria-label="Свернуть тренажёр" onClick={() => setTheater(false)} />}
      <div className="embed-frame">
        {load.state === 'ready'
          ? <PreviewFrame html={load.html} frameRef={frameRef} />
          : <div className="preview-empty">Загружаю тренажёр…</div>}
        {theater && (
          <button type="button" className="embed-theater-close" onClick={() => setTheater(false)}><IconClose size={16} />Свернуть · Esc</button>
        )}
      </div>
      <figcaption className="embed-caption">
        {caption && <span>{caption}</span>}
        {locked && locked.length > 0 && <span className="embed-locked" title="Учитель зафиксировал часть параметров"><IconLock size={13} />{`закреплено: ${locked.length}`}</span>}
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTheater(true)}><IconExpand size={15} />Крупнее</button>
        <a className="btn btn-sm btn-ghost" href={`/present/${simulationId}`} target="_blank" rel="noopener noreferrer">В новой вкладке</a>
      </figcaption>
    </figure>
  );
}
