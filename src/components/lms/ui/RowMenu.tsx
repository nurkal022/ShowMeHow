'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { IconMore } from '@/components/icons';

export interface RowMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Почему пункт недоступен — подсказкой. */
  hint?: string;
  onSelect: () => void;
}

/** Меню действий строки: кнопка «⋮», стрелки и Esc с клавиатуры, закрытие по клику мимо. */
export default function RowMenu({ label, items, busy }: { label: string; items: RowMenuItem[]; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  // Меню живёт в таблицах с прокруткой, поэтому позиционируется от окна, а не от строки.
  const [pos, setPos] = useState<React.CSSProperties>({});
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      const up = window.innerHeight - rect.bottom < 44 * items.length + 24 && rect.top > window.innerHeight / 2;
      setPos({
        right: Math.max(8, window.innerWidth - rect.right),
        ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
    }
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, items.length]);

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus(); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const nodes = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    if (nodes.length === 0) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % nodes.length : (i - 1 + nodes.length) % nodes.length;
    nodes[next].focus();
  }

  if (items.length === 0) return null;
  return (
    <span className="cf-menu-wrap" ref={wrap} onKeyDown={onKey}>
      <button ref={button} type="button" className={open ? 'icon-btn cf-icon-btn on' : 'icon-btn cf-icon-btn'}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label={label} title={label} disabled={busy} onClick={() => setOpen((v) => !v)}>
        <IconMore size={18} />
      </button>
      {open && (
        <span id={menuId} role="menu" aria-label={label} className="cf-menu" style={pos}>
          {items.map((item) => (
            <button key={item.key} type="button" role="menuitem" disabled={item.disabled} title={item.hint}
              className={item.danger ? 'cf-menu-item danger' : 'cf-menu-item'}
              onClick={() => { setOpen(false); button.current?.focus(); item.onSelect(); }}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
