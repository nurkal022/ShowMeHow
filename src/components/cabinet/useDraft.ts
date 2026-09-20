'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Черновик формы: всё, что человек ввёл, сразу лежит в браузере и переживает закрытие
 * вкладки. `saved` — то, что на сервере; черновик отличается от него — есть несохранённое.
 * При возвращении черновик восстанавливается сам (restoredAt подскажет, от какого он времени),
 * а уйти со страницы с несохранённым браузер не даст без вопроса.
 */
export function useDraft<T extends object>(key: string, saved: T) {
  const [value, setValue] = useState<T>(saved);
  const [draftAt, setDraftAt] = useState<number | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const base = useRef(saved);
  const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

  // Чтение черновика — только в браузере и один раз: сервер о нём не знает.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const d = JSON.parse(raw) as { value: T; at: number };
      if (d && d.value && !same({ ...saved, ...d.value }, saved)) {
        setValue({ ...saved, ...d.value });
        setRestoredAt(d.at);
        setDraftAt(d.at);
      } else {
        localStorage.removeItem(key);
      }
    } catch { /* приватный режим */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const dirty = !same(value, base.current);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      const at = Date.now();
      try { localStorage.setItem(key, JSON.stringify({ value, at })); setDraftAt(at); } catch { /* не беда */ }
    }, 350);
    return () => clearTimeout(t);
  }, [dirty, key, value]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((patch: Partial<T>) => setValue((v) => ({ ...v, ...patch })), []);

  /** Сервер принял: новое «сохранённое», черновик больше не нужен. */
  const markSaved = useCallback((next: T) => {
    base.current = next;
    setValue(next);
    setDraftAt(null);
    setRestoredAt(null);
    try { localStorage.removeItem(key); } catch { /* не беда */ }
  }, [key]);

  /** Отбросить черновик и вернуть сохранённое. */
  const discard = useCallback(() => markSaved(base.current), [markSaved]);

  return { value, set, dirty, draftAt, restoredAt, markSaved, discard, dismissRestored: () => setRestoredAt(null) };
}

export function formatClock(at: number): string {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
