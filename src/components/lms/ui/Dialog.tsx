'use client';
import { useEffect, useId, useRef } from 'react';
import { IconClose } from '@/components/icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Диалог рабочих экранов: фокус остаётся внутри, Esc закрывает, после закрытия
 * фокус возвращается туда, откуда диалог открыли.
 */
export default function Dialog({ title, subtitle, onClose, children, footer, wide, icon, tone }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Кнопки внизу: остаются на месте, пока содержимое прокручивается. */
  footer?: React.ReactNode;
  wide?: boolean;
  icon?: React.ReactNode;
  tone?: 'danger';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>('[data-autofocus]') ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop cf-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={wide ? 'cf-dialog wide' : 'cf-dialog'} role="dialog" aria-modal="true"
        aria-labelledby={titleId} tabIndex={-1}>
        <header className="cf-dialog-head">
          {icon && <span className={tone === 'danger' ? 'cf-dialog-icon danger' : 'cf-dialog-icon'}>{icon}</span>}
          <div className="cf-dialog-titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть окно" title="Закрыть" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </header>
        <div className="cf-dialog-body">{children}</div>
        {footer && <footer className="cf-dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}
