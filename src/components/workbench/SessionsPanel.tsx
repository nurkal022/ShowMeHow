'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SessionItem } from '@/lib/jobs/sessions';
import { IconClose, IconHistory, IconPlus, IconSearch } from '@/components/icons';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { formatDate, translator } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import { workbench } from '@/i18n/messages/workbench';
import { common } from '@/i18n/messages/common';

function dayLabel(iso: string, locale: Locale): string {
  const t = translator(workbench, locale);
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 7) return t('thisWeek');
  if (days < 31) return t('thisMonth');
  return formatDate(d, locale, { month: 'long', year: 'numeric' });
}

const STATUS: Record<SessionItem['status'], { text: keyof typeof workbench.ru | null; tone: string }> = {
  done: { text: null, tone: '' },
  running: { text: 'stRunning', tone: 'run' },
  queued: { text: 'stQueued', tone: 'run' },
  cancelled: { text: 'stCancelled', tone: 'muted' },
  error: { text: 'stError', tone: 'bad' },
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
  const t = useT(workbench);
  const tc = useT(common);
  const f = useFormat();
  const locale = useLocale();

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
      const label = dayLabel(s.updatedAt, locale);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(s); else out.push({ label, items: [s] });
    }
    return out;
  }, [items, q, locale]);

  if (!open) return null;
  return (
    <div className="sessions-layer">
      <button type="button" className="sessions-scrim" aria-label={t('closeHistory')} onClick={onClose} />
      <aside className="sessions" role="dialog" aria-label={t('sessionsAria')}>
        <header className="sessions-head">
          <h2><IconHistory size={18} />{t('history')}</h2>
          <button type="button" className="icon-btn" aria-label={tc('close')} onClick={onClose}><IconClose size={18} /></button>
        </header>
        <button type="button" className="btn btn-primary sessions-new" onClick={() => { onNew(); onClose(); }}>
          <IconPlus size={16} />{t('newSim')}
        </button>
        <label className="sessions-search"><IconSearch size={16} />
          <input value={q} placeholder={t('sessionsSearchPh')} aria-label={t('sessionsSearchAria')}
            onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="sessions-list">
          {items === null && <p className="muted sessions-note">{t('loadingDots')}</p>}
          {items !== null && groups.length === 0 && (
            <p className="muted sessions-note">
              {q ? t('nothingFound') : t('sessionsEmpty')}
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
                      <strong>{s.title ?? (s.prompt.slice(0, 70) || t('untitled'))}</strong>
                      <span className="session-meta">
                        {!kept && st.text && <em className={st.tone}>{t(st.text)}</em>}
                        {kept && <em className="muted">{t('keptMidway')}</em>}
                        {s.refinements > 0 && <span>{t('refinements', { n: s.refinements })}</span>}
                        {!s.simulationId && s.drafts > 0 && <span>{t('hasDraft')}</span>}
                        <span>{f.dateTime(s.updatedAt)}</span>
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
