'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconLab } from '@/components/icons';
import { api } from './shared';
import { useT } from '@/i18n/client';
import { researchCommon } from '@/i18n/messages/research-common';

export interface SimOption { id: string; title: string }

/** Привязать готовую симуляцию из библиотеки как материал (в проект, если он задан). */
export default function SimPicker({ sims, projectId }: { sims: SimOption[]; projectId?: string }) {
  const t = useT(researchCommon);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (sims.length === 0) return null;
  const found = sims.filter((s) => s.title.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="rs-picker">
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen((o) => !o)}><IconLab size={14} />{t('simFromLibrary')}</button>
      {open && (
        <div className="rs-picker-pop" role="dialog" aria-label={t('pickSim')}>
          <input className="input" autoFocus placeholder={t('searchByTitle')} value={q} onChange={(e) => setQ(e.target.value)} />
          {error && <p className="rs-error">{error}</p>}
          <ul>
            {found.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={async () => {
                  try {
                    const r = await api<{ item: { id: string } }>('/api/research/items', { method: 'POST', body: { kind: 'sim', simulationId: s.id, projectId: projectId ?? null } });
                    setOpen(false);
                    router.push(projectId ? `/research/projects/${projectId}` : `/research/${r.item.id}`);
                    router.refresh();
                  } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                }}>{s.title}</button>
              </li>
            ))}
            {found.length === 0 && <li className="muted rs-small">{t('nothingFound')}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
