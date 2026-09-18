'use client';
import { useEffect, useRef, useState } from 'react';
import { IconClose } from '@/components/icons';

/**
 * Кнопка, которая открывает форму в панели справа: список на странице остаётся на виду,
 * форма не отодвигает его вниз. Esc и клик мимо закрывают панель.
 */
export default function Drawer({ label, title, subtitle, icon, primary = true, openInitially = false, children }: {
  label: string; title: string; subtitle?: string; icon?: React.ReactNode; primary?: boolean; openInitially?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(openInitially);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input, textarea, select')?.focus());
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={() => setOpen(true)}>{icon}{label}</button>
      {open && (
        <div className="cab-drawer-layer">
          <button type="button" className="cab-drawer-scrim" aria-label="Закрыть панель" onClick={() => setOpen(false)} />
          <div ref={panel} className="cab-drawer" role="dialog" aria-modal="true" aria-label={title}>
            <header className="cab-drawer-head">
              <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
              <button type="button" className="icon-btn" aria-label="Закрыть" onClick={() => setOpen(false)}><IconClose size={18} /></button>
            </header>
            <div className="cab-drawer-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
