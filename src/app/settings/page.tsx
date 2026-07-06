'use client';
import { useEffect, useState } from 'react';
import type { Settings, ProviderProfile } from '@/lib/types';

const EMPTY: ProviderProfile = { id: '', name: '', baseURL: 'https://api.openai.com/v1',
  apiKey: '', generationModel: '', visionModel: '' };

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) {
          setError(`Ошибка загрузки настроек: ${res.status}`);
          return;
        }
        const data = await res.json();
        setS(data);
        setError(null);
      } catch (err) {
        setError('Ошибка загрузки настроек');
      }
    })();
  }, []);

  if (!s) return <p style={{ padding: 20 }}>Загрузка…</p>;

  function patchProvider(i: number, patch: Partial<ProviderProfile>) {
    setS((prev) => prev && {
      ...prev,
      providers: prev.providers.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    });
  }
  function addProvider() {
    setS((prev) => prev && {
      ...prev,
      providers: [...prev.providers, { ...EMPTY, id: crypto.randomUUID() }],
    });
  }
  function removeProvider(i: number) {
    setS((prev) => {
      if (!prev) return prev;
      const removed = prev.providers[i];
      const filtered = prev.providers.filter((_, j) => j !== i);
      return {
        ...prev,
        providers: filtered,
        activeProviderId: removed.id === prev.activeProviderId
          ? filtered[0]?.id ?? null
          : prev.activeProviderId,
      };
    });
  }
  async function save() {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
      if (!res.ok) {
        setError(`Ошибка сохранения: ${res.status}`);
        return;
      }
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError('Ошибка сохранения настроек');
    }
  }

  return (
    <div className="settings">
      <h1>Настройки</h1>
      {error && <div className="error-box">{error}</div>}
      <label className="field">
        <span>Режим качества по умолчанию</span>
        <select value={s.qualityMode}
          onChange={(e) => setS({ ...s, qualityMode: e.target.value as Settings['qualityMode'] })}>
          <option value="max">Максимум</option>
          <option value="standard">Стандарт</option>
          <option value="fast">Быстрый</option>
        </select>
      </label>
      <h2>Провайдеры</h2>
      {s.providers.map((p, i) => (
        <fieldset key={p.id} className="provider">
          <label className="radio">
            <input type="radio" name="active" checked={s.activeProviderId === p.id}
              onChange={() => setS((prev) => prev && { ...prev, activeProviderId: p.id })} /> активный
          </label>
          <label className="field"><span>Название</span>
            <input value={p.name} onChange={(e) => patchProvider(i, { name: e.target.value })} /></label>
          <label className="field"><span>Base URL</span>
            <input value={p.baseURL} onChange={(e) => patchProvider(i, { baseURL: e.target.value })}
              placeholder="https://openrouter.ai/api/v1" /></label>
          <label className="field"><span>API-ключ</span>
            <input value={p.apiKey} onChange={(e) => patchProvider(i, { apiKey: e.target.value })} /></label>
          <label className="field"><span>Модель генерации</span>
            <input value={p.generationModel}
              onChange={(e) => patchProvider(i, { generationModel: e.target.value })} /></label>
          <label className="field"><span>Vision-модель (пусто = нет)</span>
            <input value={p.visionModel}
              onChange={(e) => patchProvider(i, { visionModel: e.target.value })} /></label>
          <button className="danger" onClick={() => removeProvider(i)}>Удалить провайдера</button>
        </fieldset>
      ))}
      <div className="settings-actions">
        <button onClick={addProvider}>+ Добавить провайдера</button>
        <button className="primary" onClick={save}>{saved ? 'Сохранено ✓' : 'Сохранить'}</button>
      </div>
    </div>
  );
}
