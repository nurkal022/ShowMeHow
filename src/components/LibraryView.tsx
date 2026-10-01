'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SimulationMeta } from '@/lib/types';
import { IconDownload, IconEdit, IconLibrary, IconPlay, IconSearch, IconTrash } from '@/components/icons';
import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { app } from '@/i18n/messages/app';
import { INTL_LOCALE } from '@/i18n/config';

type Sort = 'recent' | 'title';

export default function LibraryView() {
  const t = useT(app);
  const locale = useLocale();
  const [sims, setSims] = useState<SimulationMeta[]>([]);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);
  const [loading, setLoading] = useState(true);
  // Пока ответ не пришёл, кнопку «Создать» не показываем: ученику без права
  // генерации она вела бы на форму, которая всё равно откажет.
  const [canCreate, setCanCreate] = useState(false);

  async function load() {
    try {
      const resp = await fetch('/api/simulations');
      if (isUnauthorized(resp)) { loginWithReturnTo('/library'); return; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setSims(await resp.json());
      setError('');
    } catch (err) {
      setError(t('libLoadFailed'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setCanCreate(body?.canGenerate === true))
      .catch(() => setCanCreate(false));
  }, []);

  async function remove(id: string) {
    if (!confirm(t('libDeleteConfirm'))) return;
    try {
      const resp = await fetch(`/api/simulations/${id}`, { method: 'DELETE' });
      if (isUnauthorized(resp)) { loginWithReturnTo('/library'); return; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await load();
    } catch (err) {
      setError(t('libDeleteFailed'));
      console.error(err);
    }
  }

  async function installDemos() {
    setInstalling(true);
    try {
      const resp = await fetch('/api/demos', { method: 'POST' });
      if (isUnauthorized(resp)) { loginWithReturnTo('/library'); return; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await load();
    } catch (err) {
      setError(t('libDemosFailed'));
      console.error(err);
    } finally {
      setInstalling(false);
    }
  }

  // Разделы берём из самих симуляций: фиксированного списка нет, предметы приходят
  // от пайплайна, и любой новый появится в фильтре сам.
  const subjects = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of sims) if (s.subject) seen.set(s.subject, (seen.get(s.subject) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [sims]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sims
      .filter((s) => subject === 'all' || s.subject === subject)
      .filter((s) => !needle
        || (s.title + s.prompt + s.subject + s.tags.join(' ')).toLowerCase().includes(needle))
      .sort((a, b) => (sort === 'title'
        ? a.title.localeCompare(b.title, INTL_LOCALE[locale])
        : +new Date(b.updatedAt) - +new Date(a.updatedAt)));
  }, [sims, q, subject, sort, locale]);

  const counts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of sims) if (s.subject) seen.set(s.subject, (seen.get(s.subject) ?? 0) + 1);
    return seen;
  }, [sims]);

  return (
    <div className="library">
      <div className="library-head">
        <div>
          <h1>{t('libTitle')}</h1>
          <p className="muted">{t('libLead')}</p>
        </div>
        <label className="search">
          <IconSearch size={18} />
          <input placeholder={t('libSearchPh')} value={q}
            aria-label={t('searchAria')} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {error && <p className="error-box" style={{ marginTop: 16 }}>{error}</p>}

      {!loading && sims.length === 0 && !error && (
        <div className="empty-library">
          <IconLibrary size={34} />
          <div>
            <h2>{t('libEmpty')}</h2>
            <p className="muted">{t('libEmptyText')}</p>
          </div>
          <div className="row">
            {canCreate && <a className="btn btn-primary" href="/">{t('libCreate')}</a>}
            <button className="btn" onClick={installDemos} disabled={installing}>
              {installing ? t('libRestoring') : t('libRestoreDemos')}
            </button>
          </div>
        </div>
      )}

      {(loading || sims.length > 0) && (
        <div className="lib-layout">
          <aside className="lib-side" aria-label={t('libSections')}>
            <button className={subject === 'all' ? 'lib-sub active' : 'lib-sub'} onClick={() => setSubject('all')}>
              {t('libAll')}<b>{sims.length}</b>
            </button>
            {subjects.map((s) => (
              <button key={s} className={subject === s ? 'lib-sub active' : 'lib-sub'}
                onClick={() => setSubject(s)}>{s}<b>{counts.get(s)}</b></button>
            ))}
          </aside>

          <div className="lib-main">
            <div className="lib-bar">
              <span className="count">
                {subject === 'all' ? t('libAll') : subject} · {shown.length}
              </span>
              <div className="segmented">
                <button className={sort === 'recent' ? 'segmented-item active' : 'segmented-item'}
                  onClick={() => setSort('recent')}>{t('libNewest')}</button>
                <button className={sort === 'title' ? 'segmented-item active' : 'segmented-item'}
                  onClick={() => setSort('title')}>{t('libAbc')}</button>
              </div>
            </div>

            {loading && sims.length === 0
              ? (
                <div className="cards">
                  {Array.from({ length: 8 }, (_, i) => <div key={i} className="sim-card skeleton" />)}
                </div>
              )
              : shown.length === 0
                ? <p className="muted" style={{ marginTop: 24 }}>{t('libNothing')}</p>
                : (
                  <div className="cards">
                    {shown.map((s) => <SimCard key={s.id} sim={s} onRemove={() => remove(s.id)} />)}
                  </div>
                )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Карточка — только картинка: живой предпросмотр при наведении держал в сетке
 * десяток iframe'ов и грузил страницу. Клик открывает сам тренажёр.
 */
function SimCard({ sim, onRemove }: { sim: SimulationMeta; onRemove: () => void }) {
  const t = useT(app);
  const f = useFormat();
  return (
    <article className="sim-card">
      <a href={`/present/${sim.id}`} className="card-thumb" aria-label={t('libOpenSim', { title: sim.title })}>
        <img src={`/api/simulations/${sim.id}/thumbnail`} alt="" loading="lazy" decoding="async"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        <span className="card-thumb-hint"><IconPlay size={26} />{t('open')}</span>
      </a>
      <div className="card-body">
        <h3><a href={`/present/${sim.id}`}>{sim.title}</a></h3>
        <div className="card-sub">
          <span>{sim.subject}</span>
          <span>·</span>
          <span>{f.date(sim.updatedAt, { day: 'numeric', month: 'numeric', year: 'numeric' })}</span>
        </div>
        {sim.warning && <p className="warn">{f.message(sim.warning)}</p>}
        <div className="card-actions">
          <a className="btn btn-sm btn-ghost" href={`/?id=${sim.id}`}>
            <IconEdit size={15} />{t('libInWorkbench')}
          </a>
          <a className="btn btn-sm btn-ghost" href={`/api/simulations/${sim.id}/export`}
            title={t('libDownload')} aria-label={t('libDownload')}>
            <IconDownload size={15} />
          </a>
          <span className="spacer" />
          <button className="btn btn-sm btn-danger" onClick={onRemove}
            title={t('delete')} aria-label={t('delete')}>
            <IconTrash size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
