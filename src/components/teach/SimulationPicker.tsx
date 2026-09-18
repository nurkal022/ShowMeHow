'use client';
import { useEffect, useState } from 'react';
import type { PickerItem } from '@/app/api/teach/simulations/route';
import { callApi } from '@/components/cabinet/api';
import { IconSearch, IconWand } from '@/components/icons';
import Dialog from '@/components/lms/ui/Dialog';

type Source = 'mine' | 'catalog';
const SOURCES: { key: Source; label: string }[] = [
  { key: 'mine', label: 'Моя библиотека' },
  { key: 'catalog', label: 'Общий каталог' },
];

/** Диалог «Выбрать тренажёр»: своя библиотека или общий каталог, поиск и превью. */
export default function SimulationPicker({ onPick, onClose, generateHref }: {
  onPick: (item: PickerItem) => void; onClose: () => void;
  /** Ссылка «Сгенерировать новый» для блока, в который выбирают тренажёр. */
  generateHref?: string;
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

  const generate = generateHref && (
    <a className="btn btn-ghost" href={generateHref}><IconWand size={16} />Сгенерировать новый</a>
  );

  return (
    <Dialog wide title="Выбрать тренажёр" subtitle="Нажмите на карточку — тренажёр встанет в блок." onClose={onClose}
      footer={<>{generate}<span className="cf-grow" /><button type="button" className="btn" onClick={onClose}>Закрыть</button></>}>
      <div className="cf-picker-bar">
        <div className="segmented" role="group" aria-label="Откуда выбрать">
          {SOURCES.map((s) => (
            <button key={s.key} type="button" aria-pressed={source === s.key}
              className={source === s.key ? 'segmented-item active' : 'segmented-item'}
              onClick={() => { if (s.key !== source) { setSource(s.key); setItems(null); } }}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="cf-search">
          <IconSearch size={17} />
          <input value={q} data-autofocus placeholder="Поиск по названию или предмету" aria-label="Поиск тренажёра"
            onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      <div aria-live="polite" className="cf-picker-results">
        {items === null && !error && (
          <div className="picker-grid" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="cf-skeleton" />)}
          </div>
        )}
        {items?.length === 0 && (
          <div className="cf-empty">
            <strong>{q ? 'Ничего не нашлось.' : source === 'mine' ? 'В вашей библиотеке пока пусто.' : 'В общем каталоге пока пусто.'}</strong>
            <p className="muted">
              {q ? 'Попробуйте другое слово или второй источник.'
                : source === 'mine' ? 'Сгенерируйте тренажёр в мастерской или загляните в общий каталог.'
                : 'Тренажёры в каталог добавляет администратор платформы.'}
            </p>
            {source === 'mine' && !q && (
              <button type="button" className="btn btn-sm" onClick={() => { setSource('catalog'); setItems(null); }}>Открыть общий каталог</button>
            )}
          </div>
        )}
        {items && items.length > 0 && (
          <div className="picker-grid">
            {items.map((item) => (
              <button key={item.id} type="button" className="picker-card cf-picker-card" onClick={() => onPick(item)}>
                <img src={`/api/simulations/${item.id}/thumbnail`} alt="" loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                <span><strong>{item.title}</strong></span>
                <span className="muted">{item.subject}{source === 'catalog' ? ` · ${item.ownerLabel}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
