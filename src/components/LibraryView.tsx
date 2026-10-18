'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SimulationMeta } from '@/lib/types';
import { IconDownload, IconEdit, IconLibrary, IconPlay, IconPlus, IconSearch, IconTrash } from '@/components/icons';
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
  // Вид запоминается: кому нужен список, тот не листает плитку при каждом заходе.
  const [view, setView] = useState<'grid' | 'list'>('grid');
  useEffect(() => { try { const v = localStorage.getItem('lib-view'); if (v === 'list' || v === 'grid') setView(v); } catch { /* приватный режим */ } }, []);
  function pickView(v: 'grid' | 'list') { setView(v); try { localStorage.setItem('lib-view', v); } catch { /* приватный режим */ } }
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);
  const [loading, setLoading] = useState(true);
  // Пока ответ не пришёл, кнопку «Создать» не показываем: студенту без права
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
    <div className="space lib2">
      <header className="lib2-head">
        <div>
          <h1>{t('libTitle')}</h1>
          <p>{t('libLead')}</p>
        </div>
        <div className="lib2-head-actions">
          <label className="sp-search">
            <IconSearch size={17} />
            <input placeholder={t('libSearchPh')} value={q} aria-label={t('searchAria')} onChange={(e) => setQ(e.target.value)} />
          </label>
          {canCreate && <a className="sp-btn sp-btn-primary" href="/create"><IconPlus size={17} />{t('libCreate')}</a>}
        </div>
      </header>

      {error && <p className="error-box" style={{ marginTop: 16 }}>{error}</p>}

      {!loading && sims.length === 0 && !error && (
        <div className="lib2-empty sp-glass">
          <IconLibrary size={40} />
          <h2>{t('libEmpty')}</h2>
          <p>{t('libEmptyText')}</p>
          <div className="lib2-empty-actions">
            {canCreate && <a className="sp-btn sp-btn-primary" href="/create">{t('libCreate')}</a>}
            <button className="sp-btn" onClick={installDemos} disabled={installing}>
              {installing ? t('libRestoring') : t('libRestoreDemos')}
            </button>
          </div>
        </div>
      )}

      {(loading || sims.length > 0) && (
        <>
          <div className="lib2-bar">
            <div className="sp-chips" role="tablist" aria-label={t('libSections')}>
              <button className={subject === 'all' ? 'sp-chip on' : 'sp-chip'} onClick={() => setSubject('all')}>
                {t('libAll')} <b>{sims.length}</b>
              </button>
              {subjects.map((s) => (
                <button key={s} className={subject === s ? 'sp-chip on' : 'sp-chip'} onClick={() => setSubject(s)}>
                  {s} <b>{counts.get(s)}</b>
                </button>
              ))}
            </div>
            <div className="lib2-tools">
              <div className="lib2-seg">
                <button className={sort === 'recent' ? 'on' : ''} onClick={() => setSort('recent')}>{t('libNewest')}</button>
                <button className={sort === 'title' ? 'on' : ''} onClick={() => setSort('title')}>{t('libAbc')}</button>
              </div>
              <div className="lib2-seg" aria-label={t('libViewGrid')}>
                <button className={view === 'grid' ? 'on' : ''} onClick={() => pickView('grid')} title={t('libViewGrid')} aria-label={t('libViewGrid')}>▦</button>
                <button className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')} title={t('libViewList')} aria-label={t('libViewList')}>☰</button>
              </div>
            </div>
          </div>

          {loading && sims.length === 0
            ? <div className="lib2-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="lib2-card lib2-skel" />)}</div>
            : shown.length === 0
              ? <p className="sp-empty">{t('libNothing')}</p>
              : (
                <div className={view === 'grid' ? 'lib2-grid' : 'lib2-list'}>
                  {shown.map((s, i) => <SimCard key={s.id} sim={s} index={i} onRemove={() => remove(s.id)} />)}
                </div>
              )}
        </>
      )}
    </div>
  );
}

/**
 * Карточка — только снимок: тренажёр запускается целиком лишь на своей странице
 * (/present), в сетке не крутится ни одной симуляции. Главное действие — «Открыть»,
 * остальное — рядом, удаление краснеет только при наведении.
 */
function SimCard({ sim, index, onRemove }: { sim: SimulationMeta; index: number; onRemove: () => void }) {
  const t = useT(app);
  const f = useFormat();
  return (
    <article className="lib2-card" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <a href={`/present/${sim.id}`} className="lib2-thumb" aria-label={t('libOpenSim', { title: sim.title })}>
        <img src={`/api/simulations/${sim.id}/thumbnail`} alt="" loading="lazy" decoding="async"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        <span className="lib2-play"><IconPlay size={22} /></span>
      </a>
      <div className="lib2-body">
        <div className="lib2-meta">
          {sim.subject && <span className="lib2-subject">{sim.subject}</span>}
          <span>{f.date(sim.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <h3><a href={`/present/${sim.id}`}>{sim.title}</a></h3>
        {sim.warning && <p className="lib2-warn">{f.message(sim.warning)}</p>}
        <div className="lib2-actions">
          <a className="sp-btn sp-btn-primary lib2-open" href={`/present/${sim.id}`}><IconPlay size={15} />{t('open')}</a>
          <a className="lib2-icon" href={`/create?id=${sim.id}`} title={t('libInWorkbench')} aria-label={t('libInWorkbench')}><IconEdit size={16} /></a>
          <a className="lib2-icon" href={`/api/simulations/${sim.id}/export`} title={t('libDownload')} aria-label={t('libDownload')}><IconDownload size={16} /></a>
          <button className="lib2-icon lib2-danger" onClick={onRemove} title={t('delete')} aria-label={t('delete')}><IconTrash size={16} /></button>
        </div>
      </div>
    </article>
  );
}
