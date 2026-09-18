'use client';
import { useEffect, useState } from 'react';
import PreviewFrame from '@/components/PreviewFrame';
import { IconExpand } from '@/components/icons';

type Load = { state: 'loading' } | { state: 'ready'; html: string } | { state: 'missing' } | { state: 'error' };

/**
 * Тренажёр внутри урока. missing — сервер уже знает, что автор удалил симуляцию;
 * 404 от API значит то же самое.
 */
export default function SimulationEmbed({ simulationId, missing, caption }: {
  simulationId: string | null; missing: boolean; caption: string;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

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

  if (!simulationId) return <p className="empty-state">Тренажёр ещё не выбран.</p>;
  if (missing || load.state === 'missing') return <p className="empty-state">Тренажёр удалён автором.</p>;
  if (load.state === 'error') {
    return <p className="error-box">Не удалось загрузить тренажёр. Обновите страницу.</p>;
  }
  return (
    <figure className="embed">
      <div className="embed-frame">
        {load.state === 'ready'
          ? <PreviewFrame html={load.html} />
          : <div className="preview-empty">Загружаю тренажёр…</div>}
      </div>
      <figcaption className="embed-caption">
        {caption && <span>{caption}</span>}
        <span className="spacer" />
        <a className="btn btn-sm btn-ghost" href={`/present/${simulationId}`} target="_blank" rel="noopener noreferrer">
          <IconExpand size={15} />На весь экран
        </a>
      </figcaption>
    </figure>
  );
}
