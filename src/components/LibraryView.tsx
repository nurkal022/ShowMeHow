'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SimulationMeta } from '@/lib/types';
import { IconDownload, IconEdit, IconLibrary, IconPlay, IconSearch, IconTrash } from '@/components/icons';
import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';

type Sort = 'recent' | 'title';

export default function LibraryView() {
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
      setError('Не удалось загрузить библиотеку');
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
    if (!confirm('Удалить симуляцию?')) return;
    try {
      const resp = await fetch(`/api/simulations/${id}`, { method: 'DELETE' });
      if (isUnauthorized(resp)) { loginWithReturnTo('/library'); return; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await load();
    } catch (err) {
      setError('Не удалось удалить симуляцию');
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
      setError('Не удалось установить примеры');
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
        ? a.title.localeCompare(b.title, 'ru')
        : +new Date(b.updatedAt) - +new Date(a.updatedAt)));
  }, [sims, q, subject, sort]);

  const counts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of sims) if (s.subject) seen.set(s.subject, (seen.get(s.subject) ?? 0) + 1);
    return seen;
  }, [sims]);

  return (
    <div className="library">
      <div className="library-head">
        <div>
          <h1>Библиотека</h1>
          <p className="muted">Готовые тренажёры. Нажмите на карточку — тренажёр откроется на весь экран.</p>
        </div>
        <label className="search">
          <IconSearch size={18} />
          <input placeholder="Поиск по названию и описанию" value={q}
            aria-label="Поиск" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {error && <p className="error-box" style={{ marginTop: 16 }}>{error}</p>}

      {!loading && sims.length === 0 && !error && (
        <div className="empty-library">
          <IconLibrary size={34} />
          <div>
            <h2>Здесь пока пусто</h2>
            <p className="muted">Опишите явление — симуляция появится здесь.</p>
          </div>
          <div className="row">
            {canCreate && <a className="btn btn-primary" href="/">Создать симуляцию</a>}
            <button className="btn" onClick={installDemos} disabled={installing}>
              {installing ? 'Возвращаю…' : 'Вернуть примеры'}
            </button>
          </div>
        </div>
      )}

      {(loading || sims.length > 0) && (
        <div className="lib-layout">
          <aside className="lib-side" aria-label="Разделы">
            <button className={subject === 'all' ? 'lib-sub active' : 'lib-sub'} onClick={() => setSubject('all')}>
              Все разделы<b>{sims.length}</b>
            </button>
            {subjects.map((s) => (
              <button key={s} className={subject === s ? 'lib-sub active' : 'lib-sub'}
                onClick={() => setSubject(s)}>{s}<b>{counts.get(s)}</b></button>
            ))}
          </aside>

          <div className="lib-main">
            <div className="lib-bar">
              <span className="count">
                {subject === 'all' ? 'Все разделы' : subject} · {shown.length}
              </span>
              <div className="segmented">
                <button className={sort === 'recent' ? 'segmented-item active' : 'segmented-item'}
                  onClick={() => setSort('recent')}>Новые</button>
                <button className={sort === 'title' ? 'segmented-item active' : 'segmented-item'}
                  onClick={() => setSort('title')}>По алфавиту</button>
              </div>
            </div>

            {loading && sims.length === 0
              ? (
                <div className="cards">
                  {Array.from({ length: 8 }, (_, i) => <div key={i} className="sim-card skeleton" />)}
                </div>
              )
              : shown.length === 0
                ? <p className="muted" style={{ marginTop: 24 }}>Ничего не нашлось. Попробуйте другой запрос.</p>
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
  return (
    <article className="sim-card">
      <a href={`/present/${sim.id}`} className="card-thumb" aria-label={`Открыть тренажёр «${sim.title}»`}>
        <img src={`/api/simulations/${sim.id}/thumbnail`} alt="" loading="lazy" decoding="async"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        <span className="card-thumb-hint"><IconPlay size={26} />Открыть</span>
      </a>
      <div className="card-body">
        <h3><a href={`/present/${sim.id}`}>{sim.title}</a></h3>
        <div className="card-sub">
          <span>{sim.subject}</span>
          <span>·</span>
          <span>{new Date(sim.updatedAt).toLocaleDateString('ru')}</span>
        </div>
        {sim.warning && <p className="warn">{sim.warning}</p>}
        <div className="card-actions">
          <a className="btn btn-sm btn-ghost" href={`/?id=${sim.id}`}>
            <IconEdit size={15} />В мастерской
          </a>
          <a className="btn btn-sm btn-ghost" href={`/api/simulations/${sim.id}/export`}
            title="Скачать HTML" aria-label="Скачать HTML">
            <IconDownload size={15} />
          </a>
          <span className="spacer" />
          <button className="btn btn-sm btn-danger" onClick={onRemove}
            title="Удалить" aria-label="Удалить">
            <IconTrash size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
