'use client';
import { useState } from 'react';
import { IconArrowDown, IconArrowUp, IconClose, IconGrip } from '@/components/icons';

/** Интерактивные поля ответа: пропуски, пары и порядок. Управляемые — состояние держит AnswerForm. */

export function GapsInput({ parts, values, disabled, onChange }: {
  parts: string[]; values: string[]; disabled: boolean; onChange: (v: string[]) => void;
}) {
  const count = parts.length - 1;
  const filled = Array.from({ length: count }, (_, i) => values[i] ?? '');
  return (
    <p className="learn-gaps">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < count && (
            <input className="learn-gap" value={filled[i]} disabled={disabled} maxLength={100} autoComplete="off"
              aria-label={`Пропуск ${i + 1}`} style={{ width: `${Math.max(6, filled[i].length + 2)}ch` }}
              onChange={(e) => onChange(filled.map((v, k) => (k === i ? e.target.value : v)))} />
          )}
        </span>
      ))}
    </p>
  );
}

const PAIR_TONES = 6;

export function MatchInput({ left, right, pairs, disabled, onChange }: {
  left: { id: string; text: string }[]; right: { id: string; text: string }[];
  pairs: Record<string, string>; disabled: boolean; onChange: (p: Record<string, string>) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const toneOf = (leftId: string) => left.findIndex((l) => l.id === leftId) % PAIR_TONES;
  const ownerOf = (rightId: string) => Object.keys(pairs).find((l) => pairs[l] === rightId);

  function pickLeft(id: string) {
    if (disabled) return;
    if (pairs[id]) { const next = { ...pairs }; delete next[id]; onChange(next); setPicked(id); return; }
    setPicked(picked === id ? null : id);
  }
  function pickRight(id: string) {
    if (disabled) return;
    const owner = ownerOf(id);
    const next = { ...pairs };
    if (owner) delete next[owner];
    if (picked) { next[picked] = id; setPicked(null); }
    onChange(next);
  }

  return (
    <div className="learn-match">
      <p className="muted learn-hint">
        {picked ? 'Теперь выберите пару справа.' : 'Нажмите на карточку слева, затем на её пару справа. Повторное нажатие разрывает пару.'}
      </p>
      <div className="learn-match-cols">
        <div className="learn-match-col">
          {left.map((l, i) => (
            <button key={l.id} type="button" disabled={disabled} aria-pressed={picked === l.id}
              className={['learn-match-card', picked === l.id ? 'picked' : '', pairs[l.id] ? `paired tone-${toneOf(l.id)}` : ''].filter(Boolean).join(' ')}
              onClick={() => pickLeft(l.id)}>
              <span className="learn-match-num">{i + 1}</span><span>{l.text}</span>
            </button>
          ))}
        </div>
        <div className="learn-match-col">
          {right.map((r) => {
            const owner = ownerOf(r.id);
            return (
              <button key={r.id} type="button" disabled={disabled || (!picked && !owner)}
                className={['learn-match-card', owner ? `paired tone-${toneOf(owner)}` : '', picked && !owner ? 'target' : ''].filter(Boolean).join(' ')}
                onClick={() => pickRight(r.id)}>
                <span className="learn-match-num">{owner ? left.findIndex((l) => l.id === owner) + 1 : '·'}</span>
                <span>{r.text}</span>
                {owner && !disabled && <IconClose size={14} className="learn-match-x" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function OrderInput({ items, order, disabled, onChange }: {
  items: { id: string; text: string }[]; order: string[]; disabled: boolean; onChange: (o: string[]) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // Пока ученик ничего не двигал, показываем порядок выдачи — он уже перемешан сервером.
  const ids = order.length === items.length ? order : items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i.text]));

  function move(from: number, to: number) {
    if (to < 0 || to >= ids.length || from === to) return;
    const next = [...ids];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  }

  return (
    <ol className="learn-order">
      {ids.map((id, i) => (
        <li key={id} draggable={!disabled}
          className={['learn-order-item', drag === id ? 'dragging' : '', over === i && drag !== id ? 'over' : ''].filter(Boolean).join(' ')}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDrag(id); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(i); } }}
          onDrop={(e) => { e.preventDefault(); if (drag) move(ids.indexOf(drag), i); setDrag(null); setOver(null); }}>
          <span className="learn-order-grip" aria-hidden="true"><IconGrip size={16} /></span>
          <span className="learn-order-num">{i + 1}</span>
          <span className="learn-order-text">{byId.get(id)}</span>
          {!disabled && (
            <span className="learn-order-tools">
              <button type="button" className="icon-btn" aria-label={`Поднять «${byId.get(id)}»`} disabled={i === 0} onClick={() => move(i, i - 1)}><IconArrowUp size={15} /></button>
              <button type="button" className="icon-btn" aria-label={`Опустить «${byId.get(id)}»`} disabled={i === ids.length - 1} onClick={() => move(i, i + 1)}><IconArrowDown size={15} /></button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
