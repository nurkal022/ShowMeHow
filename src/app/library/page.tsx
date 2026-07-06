'use client';
import { useEffect, useState } from 'react';
import type { SimulationMeta } from '@/lib/types';

export default function Library() {
  const [sims, setSims] = useState<SimulationMeta[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);

  async function load() {
    try {
      const resp = await fetch('/api/simulations');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setSims(await resp.json());
      setError('');
    } catch (err) {
      setError('Ошибка загрузки симуляций');
      console.error(err);
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
      setError('Ошибка удаления симуляции');
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
      setError('Ошибка установки примеров');
      console.error(err);
    } finally {
      setInstalling(false);
    }
  }

  const shown = sims.filter((s) =>
    (s.title + s.prompt + s.subject + s.tags.join(' ')).toLowerCase()
      .includes(q.toLowerCase()));

  return (
    <div className="library">
      <div className="library-head">
        <h1>Библиотека</h1>
        <input placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="error-box">{error}</p>}
      {sims.length === 0 && (
        <div className="empty-library">
          <p className="muted">Пока пусто — создайте первую симуляцию или установите готовые примеры.</p>
          <button onClick={installDemos} disabled={installing}>
            {installing ? 'Устанавливаю…' : 'Установить 10 примеров'}
          </button>
        </div>
      )}
      {sims.length > 0 && shown.length === 0 && <p className="muted">Ничего не найдено.</p>}
      <div className="cards">
        {shown.map((s) => (
          <div key={s.id} className="card">
            <a href={`/?id=${s.id}`}>
              <img src={`/api/simulations/${s.id}/thumbnail`} alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <h3>{s.title}</h3>
            </a>
            <p className="muted">{s.subject} · {new Date(s.updatedAt).toLocaleDateString('ru')}</p>
            {s.warning && <p className="warn">⚠ {s.warning}</p>}
            <div className="card-actions">
              <a href={`/present/${s.id}`} target="_blank" rel="noopener noreferrer">▶ Показать</a>
              <a href={`/api/simulations/${s.id}/export`}>⬇ Экспорт</a>
              <button onClick={() => remove(s.id)}>Удалить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
