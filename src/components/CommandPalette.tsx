'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchHit } from '@/lib/search';
import {
  IconBook, IconCourses, IconOrg, IconPlay, IconPlus, IconSearch, IconUser, IconUsers,
} from '@/components/icons';

import type { PaletteAction } from '@/lib/palette-actions';

const KIND_ICON: Record<SearchHit['kind'] | 'action', (p: { size?: number }) => React.ReactNode> = {
  course: IconCourses, topic: IconBook, simulation: IconPlay, group: IconOrg, student: IconUser, user: IconUsers, action: IconPlus,
};

/**
 * ⌘K / Ctrl+K — поиск и быстрые действия с любой страницы. Действия задаются по ролям
 * на сервере и фильтруются здесь же, поиск по данным идёт с задержкой после ввода.
 */
export default function CommandPalette({ actions }: { actions: PaletteAction[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('open-palette', onOpen);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('open-palette', onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(''); setHits([]); setCursor(0);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then(async (r) => { if (r.ok) setHits(((await r.json()) as { hits: SearchHit[] }).hits); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  const needle = q.trim().toLowerCase();
  const shownActions = useMemo(
    () => actions.filter((a) => !needle || `${a.title} ${a.keywords}`.toLowerCase().includes(needle)).slice(0, needle ? 4 : 8),
    [actions, needle]);
  const items = [
    ...shownActions.map((a) => ({ key: a.id, kind: 'action' as const, title: a.title, subtitle: a.subtitle, href: a.href })),
    ...hits.map((h, i) => ({ key: `${h.kind}-${i}-${h.href}`, kind: h.kind, title: h.title, subtitle: h.subtitle, href: h.href })),
  ];
  const at = Math.min(cursor, Math.max(0, items.length - 1));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;
  return (
    <div className="pal-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="pal" role="dialog" aria-label="Поиск и действия"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((at + 1) % Math.max(1, items.length)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((at - 1 + items.length) % Math.max(1, items.length)); }
          if (e.key === 'Enter' && items[at]) { e.preventDefault(); go(items[at].href); }
        }}>
        <label className="pal-search">
          <IconSearch size={18} />
          <input ref={input} value={q} placeholder="Курс, тема, ученик, симуляция или действие…" aria-label="Поиск"
            onChange={(e) => { setQ(e.target.value); setCursor(0); }} />
          {loading ? <span className="pal-spin" aria-hidden="true" /> : <kbd>Esc</kbd>}
        </label>
        <div className="pal-list">
          {items.length === 0 && (
            <p className="pal-empty">{needle.length >= 2 && !loading ? 'Ничего не нашлось.' : 'Начните печатать — ищу по курсам, темам, ученикам и симуляциям.'}</p>
          )}
          {shownActions.length > 0 && <span className="pal-title">{needle ? 'Действия' : 'Быстрые действия'}</span>}
          {items.map((it, i) => (
            <div key={it.key}>
              {i === shownActions.length && hits.length > 0 && <span className="pal-title">Найдено</span>}
              <button type="button" className={i === at ? 'pal-item on' : 'pal-item'} onMouseEnter={() => setCursor(i)} onClick={() => go(it.href)}>
                <span className={`pal-icon k-${it.kind}`}>{KIND_ICON[it.kind]({ size: 17 })}</span>
                <span className="pal-text"><strong>{it.title}</strong><small>{it.subtitle}</small></span>
                {i === at && <kbd>↵</kbd>}
              </button>
            </div>
          ))}
        </div>
        <footer className="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>↵</kbd> открыть</span><span><kbd>⌘</kbd><kbd>K</kbd> открыть отовсюду</span></footer>
      </div>
    </div>
  );
}

export function PaletteButton() {
  return (
    <button type="button" className="pal-btn" onClick={() => window.dispatchEvent(new Event('open-palette'))} aria-label="Поиск (Ctrl+K)">
      <IconSearch size={16} /><span>Поиск</span><kbd>⌘K</kbd>
    </button>
  );
}

