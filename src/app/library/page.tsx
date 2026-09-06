'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SimulationMeta } from '@/lib/types';
import { IconDownload, IconLibrary, IconPlay, IconSearch, IconTrash } from '@/components/icons';

type Sort = 'recent' | 'title';

export default function Library() {
  const [sims, setSims] = useState<SimulationMeta[]>([]);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const resp = await fetch('/api/simulations');
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

  async function remove(id: string) {
    if (!confirm('Удалить симуляцию?')) return;
    try {
      const resp = await fetch(`/api/simulations/${id}`, { method: 'DELETE' });
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

  return (
    <div className="library">
      <div className="library-head">
        <h1>Библиотека</h1>
        <label className="search">
          <IconSearch size={18} />
          <input placeholder="Поиск по названию и описанию" value={q}
            aria-label="Поиск" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {sims.length > 0 && (
        <div className="filters">
          <button className={subject === 'all' ? 'chip chip-action active' : 'chip chip-action'}
            onClick={() => setSubject('all')}>Все</button>
          {subjects.map((s) => (
            <button key={s} className={subject === s ? 'chip chip-action active' : 'chip chip-action'}
              onClick={() => setSubject(s)}>{s}</button>
          ))}
          <span className="spacer" />
          <span className="count">{shown.length}</span>
          <div className="segmented">
            <button className={sort === 'recent' ? 'segmented-item active' : 'segmented-item'}
              onClick={() => setSort('recent')}>Новые</button>
            <button className={sort === 'title' ? 'segmented-item active' : 'segmented-item'}
              onClick={() => setSort('title')}>По алфавиту</button>
          </div>
        </div>
      )}

      {error && <p className="error-box" style={{ marginTop: 16 }}>{error}</p>}

      {loading && sims.length === 0 && (
        <div className="cards">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="sim-card skeleton" />)}
        </div>
      )}

      {!loading && sims.length === 0 && !error && (
        <div className="empty-library">
          <IconLibrary size={34} />
          <div>
            <h2>Здесь пока пусто</h2>
            <p className="muted">Опишите явление — симуляция появится здесь.</p>
          </div>
          <div className="row">
            <a className="btn btn-primary" href="/">Создать симуляцию</a>
            <button className="btn" onClick={installDemos} disabled={installing}>
              {installing ? 'Возвращаю…' : 'Вернуть примеры'}
            </button>
          </div>
        </div>
      )}

      {sims.length > 0 && shown.length === 0 && (
        <p className="muted" style={{ marginTop: 24 }}>Ничего не нашлось. Попробуйте другой запрос.</p>
      )}

      <div className="cards">
        {shown.map((s) => <SimCard key={s.id} sim={s} onRemove={() => remove(s.id)} />)}
      </div>
    </div>
  );
}

/**
 * Карточка запускает симуляцию прямо в сетке при наведении: html подгружается
 * лениво и только один раз, с задержкой — чтобы движение мыши через сетку
 * не дёргало десяток запросов.
 */
function SimCard({ sim, onRemove }: { sim: SimulationMeta; onRemove: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  function onEnter() {
    timer.current = setTimeout(async () => {
      setLive(true);
      if (loaded.current) return;
      loaded.current = true;
      try {
        const res = await fetch(`/api/simulations/${sim.id}`);
        if (res.ok) setHtml((await res.json()).html);
      } catch {
        loaded.current = false;
      }
    }, 420);
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current);
    setLive(false);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <article className="sim-card" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <a href={`/?id=${sim.id}`} className="card-thumb" aria-label={sim.title}>
        {live && html
          ? <iframe sandbox="allow-scripts" srcDoc={html} title="" tabIndex={-1} />
          : (
            <>
              <img src={`/api/simulations/${sim.id}/thumbnail`} alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
              <span className="card-thumb-hint"><IconPlay size={26} /></span>
            </>
          )}
      </a>
      <div className="card-body">
        <h3><a href={`/?id=${sim.id}`}>{sim.title}</a></h3>
        <div className="card-sub">
          <span>{sim.subject}</span>
          <span>·</span>
          <span>{new Date(sim.updatedAt).toLocaleDateString('ru')}</span>
        </div>
        {sim.warning && <p className="warn">{sim.warning}</p>}
        <div className="card-actions">
          <a className="btn btn-sm btn-ghost" href={`/present/${sim.id}`} target="_blank" rel="noopener noreferrer">
            <IconPlay size={15} />Показать
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
