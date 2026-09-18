'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SessionItem } from '@/lib/jobs/sessions';
import { IconClose, IconHistory, IconPlus, IconSearch } from '@/components/icons';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days < 7) return 'На этой неделе';
  if (days < 31) return 'В этом месяце';
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

const STATUS: Record<SessionItem['status'], { text: string; tone: string }> = {
  done: { text: '', tone: '' },
  running: { text: 'идёт сейчас', tone: 'run' },
  queued: { text: 'в очереди', tone: 'run' },
  cancelled: { text: 'остановлена', tone: 'muted' },
  error: { text: 'не получилось', tone: 'bad' },
};

/**
 * История сессий, как список чатов: всё, что человек генерировал, включая остановленное
 * и неудачное. Сессия с симуляцией открывается с перепиской, без неё — возвращает запрос
 * в поле ввода или даёт сохранить последний черновик.
 */
export default function SessionsPanel({ open, onClose, onOpen, onNew, activeSimulationId }: {
  open: boolean; onClose: () => void; onOpen: (s: SessionItem) => void; onNew: () => void;
  activeSimulationId: string | null;
}) {
  const [items, setItems] = useState<SessionItem[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/jobs').then(async (res) => {
      if (!alive) return;
      setItems(res.ok ? ((await res.json()) as { sessions: SessionItem[] }).sessions : []);
    }).catch(() => { if (alive) setItems([]); });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { alive = false; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = (items ?? []).filter((s) => !needle || `${s.title ?? ''} ${s.prompt}`.toLowerCase().includes(needle));
    const out: { label: string; items: SessionItem[] }[] = [];
    for (const s of shown) {
      const label = dayLabel(s.updatedAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(s); else out.push({ label, items: [s] });
    }
    return out;
  }, [items, q]);

  if (!open) return null;
  return (
    <div className="sessions-layer">
      <button type="button" className="sessions-scrim" aria-label="Закрыть историю" onClick={onClose} />
      <aside className="sessions" role="dialog" aria-label="История сессий">
        <header className="sessions-head">
          <h2><IconHistory size={18} />История</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}><IconClose size={18} /></button>
        </header>
        <button type="button" className="btn btn-primary sessions-new" onClick={() => { onNew(); onClose(); }}>
          <IconPlus size={16} />Новая симуляция
        </button>
        <label className="sessions-search"><IconSearch size={16} />
          <input value={q} placeholder="Найти по названию или запросу" aria-label="Поиск по истории"
            onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="sessions-list">
          {items === null && <p className="muted sessions-note">Загружаю…</p>}
          {items !== null && groups.length === 0 && (
            <p className="muted sessions-note">
              {q ? 'Ничего не нашлось.' : 'Здесь появится всё, что вы создадите: готовые симуляции, остановленные и неудачные попытки.'}
            </p>
          )}
          {groups.map((g) => (
            <section key={g.label}>
              <h3>{g.label}</h3>
              {g.items.map((s) => {
                const st = STATUS[s.status];
                // Оставленная по ходу версия: задание ещё может числиться идущим, пока воркер не увидел остановку.
                const kept = s.status !== 'done' && s.status !== 'error' && s.simulationId;
                return (
                  <button key={s.jobId} type="button"
                    className={s.simulationId && s.simulationId === activeSimulationId ? 'session active' : 'session'}
                    onClick={() => { onOpen(s); onClose(); }}>
                    {s.simulationId
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/simulations/${s.simulationId}/thumbnail`} alt="" loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                      : <span className="session-nothumb" aria-hidden="true" />}
                    <span className="session-text">
                      <strong>{s.title ?? (s.prompt.slice(0, 70) || 'Без названия')}</strong>
                      <span className="session-meta">
                        {!kept && st.text && <em className={st.tone}>{st.text}</em>}
                        {kept && <em className="muted">оставлена по ходу</em>}
                        {s.refinements > 0 && <span>{`доработок: ${s.refinements}`}</span>}
                        {!s.simulationId && s.drafts > 0 && <span>есть черновик</span>}
                        <span>{new Date(s.updatedAt).toLocaleString('ru-RU',
                          { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
