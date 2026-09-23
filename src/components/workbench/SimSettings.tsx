'use client';
import { useEffect, useState } from 'react';
import type { SimParameter } from '@/lib/types';
import type { SimConfig, ConfigParam } from '@/lib/pipeline/config';
import { callApi } from '../cabinet/api';
import { IconClose, IconPlus, IconTrash } from '../icons';

interface Loaded {
  config: SimConfig;
  title: string;
  parameters: SimParameter[];
  presets: { label: string; values: Record<string, number> }[];
}

const FIELDS: [keyof ConfigParam, string][] = [
  ['min', 'от'], ['max', 'до'], ['step', 'шаг'], ['value', 'сначала'],
];

/**
 * Настройки тренажёра без модели: подписи, диапазоны, значения по умолчанию, пресеты
 * и название. Сохраняется JSON-наложение — код тренажёра не трогается, новая версия
 * появляется за секунды и попадает в историю, как любая доработка.
 */
export default function SimSettings({ simId, onClose, onSaved }: {
  simId: string;
  onClose: () => void;
  onSaved: (html: string) => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<SimConfig>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await callApi<Loaded>(`/api/simulations/${simId}/config`, 'GET');
      if (!alive) return;
      if (!res.ok) { setError(res.error); return; }
      setData(res.data);
      setDraft(res.data.config);
    })();
    return () => { alive = false; };
  }, [simId]);

  function paramValue(p: SimParameter, key: keyof ConfigParam): string {
    const v = draft.parameters?.[p.name]?.[key];
    if (v !== undefined) return String(v);
    const base = p[key as keyof SimParameter];
    // Для старых тренажёров без плана диапазоны неизвестны — поле пустое, значит «как есть».
    return typeof base === 'number' && (p.max !== 0 || p.min !== 0) ? String(base) : (typeof base === 'string' ? base : '');
  }

  function setParam(name: string, patch: ConfigParam) {
    setDraft((d) => ({ ...d, parameters: { ...(d.parameters ?? {}), [name]: { ...(d.parameters?.[name] ?? {}), ...patch } } }));
  }

  function onNumber(p: SimParameter, key: keyof ConfigParam, raw: string) {
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(n)) {
      setDraft((d) => {
        const cur = { ...(d.parameters?.[p.name] ?? {}) };
        delete cur[key];
        return { ...d, parameters: { ...(d.parameters ?? {}), [p.name]: cur } };
      });
      return;
    }
    setParam(p.name, { [key]: n });
  }

  const presets = draft.presets ?? data?.presets ?? [];
  function setPresets(next: { label: string; values: Record<string, number> }[]) {
    setDraft((d) => ({ ...d, presets: next }));
  }

  async function save() {
    setSaving(true); setError(null);
    const res = await callApi<{ html: string }>(`/api/simulations/${simId}/config`, 'PUT', { config: draft });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved(res.data.html);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal sim-settings" role="dialog" aria-label="Настройки тренажёра" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Настройки тренажёра</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}><IconClose size={18} /></button>
        </div>
        <p className="muted sim-settings-note">
          Меняется только то, что видит ученик на панели: подписи, диапазоны, начальные значения и пресеты.
          Код тренажёра не трогается — сохранение занимает секунды.
        </p>
        {!data && !error && <div className="muted">Загружаю…</div>}
        {data && (
          <>
            <label className="field">
              <span>Название на панели</span>
              <input value={draft.title ?? data.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </label>
            <div className="sim-settings-params">
              {data.parameters.map((p) => (
                <div className="sim-settings-param" key={p.name}>
                  <div className="sim-settings-row">
                    <input className="grow" aria-label="Подпись" value={draft.parameters?.[p.name]?.label ?? p.label}
                      onChange={(e) => setParam(p.name, { label: e.target.value })} />
                    <input className="unit" aria-label="Единица" value={draft.parameters?.[p.name]?.unit ?? p.unit}
                      onChange={(e) => setParam(p.name, { unit: e.target.value })} />
                  </div>
                  <div className="sim-settings-row">
                    {FIELDS.map(([key, label]) => (
                      <label key={key} className="mini">
                        <span>{label}</span>
                        <input inputMode="decimal" defaultValue={paramValue(p, key)}
                          onBlur={(e) => onNumber(p, key, e.target.value)} />
                      </label>
                    ))}
                  </div>
                  <code className="sim-settings-name">{p.name}</code>
                </div>
              ))}
            </div>
            <div className="plan-section">
              <div className="plan-section-title">Пресеты</div>
              {presets.map((pr, i) => (
                // В ключе значения: поля чисел неконтролируемые, и при удалении пресета из середины
                // позиционный ключ оставил бы в строке цифры удалённого соседа. Подписи в ключе нет —
                // она контролируемая, и её набор не должен пересоздавать строку и сбивать фокус.
                <div className="sim-settings-row" key={`${i}:${JSON.stringify(pr.values)}`}>
                  <input className="grow" aria-label="Название пресета" value={pr.label}
                    onChange={(e) => setPresets(presets.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                  {data.parameters.map((p) => (
                    <label key={p.name} className="mini">
                      <span>{p.label}</span>
                      <input inputMode="decimal" defaultValue={pr.values[p.name] ?? ''}
                        onBlur={(e) => {
                          const n = Number(e.target.value.replace(',', '.'));
                          const values = { ...pr.values };
                          if (e.target.value.trim() === '' || !Number.isFinite(n)) delete values[p.name]; else values[p.name] = n;
                          setPresets(presets.map((x, k) => (k === i ? { ...x, values } : x)));
                        }} />
                    </label>
                  ))}
                  <button type="button" className="icon-btn" aria-label="Убрать пресет"
                    onClick={() => setPresets(presets.filter((_, k) => k !== i))}><IconTrash size={15} /></button>
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-ghost"
                onClick={() => setPresets([...presets, { label: 'Новый режим', values: {} }])}>
                <IconPlus size={15} />Пресет
              </button>
            </div>
          </>
        )}
        {error && <div className="error-box">{error}</div>}
        <div className="plan-actions">
          <button type="button" className="btn btn-primary" disabled={!data || saving} onClick={save}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
