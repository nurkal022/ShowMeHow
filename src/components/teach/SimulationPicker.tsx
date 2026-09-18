'use client';
import { useEffect, useState } from 'react';
import type { PickerItem } from '@/app/api/teach/simulations/route';
import { callApi } from '@/components/cabinet/api';
import { IconSearch } from '@/components/icons';

type Source = 'mine' | 'catalog';

/** Диалог «Выбрать тренажёр»: своя библиотека или общий каталог, поиск и превью. */
export default function SimulationPicker({ onPick, onClose }: {
  onPick: (item: PickerItem) => void; onClose: () => void;
}) {
  const [source, setSource] = useState<Source>('mine');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PickerItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const res = await callApi<{ items: PickerItem[] }>(
        `/api/teach/simulations?source=${source}&q=${encodeURIComponent(q)}`, 'GET');
      if (!alive) return;
      if (res.ok) { setItems(res.data.items); setError(''); } else setError(res.error);
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [source, q]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} role="dialog" aria-modal="true" aria-labelledby="picker-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="picker-title">Выбрать тренажёр</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>Закрыть</button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="segmented">
            {(['mine', 'catalog'] as Source[]).map((s) => (
              <button key={s} type="button" aria-pressed={source === s}
                className={source === s ? 'segmented-item active' : 'segmented-item'}
                onClick={() => { setSource(s); setItems(null); }}>
                {s === 'mine' ? 'Моя библиотека' : 'Общий каталог'}
              </button>
            ))}
          </div>
          <label className="search">
            <IconSearch size={18} />
            <input value={q} placeholder="Поиск по названию" aria-label="Поиск тренажёра" onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {error && <p className="error-box">{error}</p>}
        {items === null && !error && <p className="muted">Загружаю…</p>}
        {items?.length === 0 && (
          <p className="empty-state">
            {source === 'mine'
              ? 'В вашей библиотеке ничего не нашлось. Сгенерируйте тренажёр или загляните в общий каталог.'
              : 'В общем каталоге пока ничего не нашлось.'}
          </p>
        )}
        {items && items.length > 0 && (
          <div className="picker-grid">
            {items.map((item) => (
              <button key={item.id} type="button" className="picker-card" onClick={() => onPick(item)}>
                <img src={`/api/simulations/${item.id}/thumbnail`} alt=""
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                <span><strong>{item.title}</strong></span>
                <span className="muted">{item.subject}{source === 'catalog' ? ` · ${item.ownerLabel}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
