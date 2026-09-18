'use client';
import { useEffect, type RefObject } from 'react';

/** Закрывает выпадающее меню по клику мимо и по Escape. */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) close();
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
    // close создаётся заново на каждый рендер; подписка зависит только от open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
