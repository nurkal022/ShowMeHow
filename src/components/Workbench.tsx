'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PipelineEvent, QualityMode } from '@/lib/types';
import ProgressFeed from './ProgressFeed';
import PreviewFrame from './PreviewFrame';

type Phase = 'idle' | 'generating' | 'ready' | 'error';

export default function Workbench() {
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [simId, setSimId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<QualityMode>('max');
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = search.get('id');
    if (id) openSimulation(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Подтягиваем сохранённый по умолчанию режим качества из настроек, не блокируя
    // интерфейс: пока запрос не завершился (или упал), остаётся дефолт 'max'.
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) return;
        const s = await res.json();
        if (s?.qualityMode) setMode(s.qualityMode);
      } catch {
        // настройки недоступны — остаёмся на дефолтном режиме
      }
    })();
  }, []);

  async function openSimulation(id: string) {
    try {
      const res = await fetch(`/api/simulations/${id}`);
      if (!res.ok) {
        setError('Не удалось загрузить симуляцию');
        setPhase('error');
        return;
      }
      const { html } = await res.json();
      setSimId(id); setHtml(html); setPhase('ready');
    } catch (err) {
      setError('Не удалось загрузить симуляцию: '
        + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }

  async function consumeSSE(res: Response) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop()!;
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const e = JSON.parse(part.slice(6)) as PipelineEvent;
          setEvents((prev) => [...prev, e]);
          if (e.type === 'done') { await openSimulation(e.simulationId); }
          if (e.type === 'error') { setError(e.message); setPhase('error'); }
        }
      }
    } catch (err) {
      setError('Ошибка при получении событий: '
        + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }

  async function generate(text: string) {
    setPhase('generating'); setEvents([]); setError(null); setHtml(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, imageDataUrl: image ?? undefined, mode }),
      });
      if (!res.ok) {
        let message = `Ошибка сервера (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) message = String(body.error);
        } catch { /* тело не JSON — оставляем сообщение со статусом */ }
        setError(message);
        setPhase('error');
        return;
      }
      await consumeSSE(res);
    } catch (err) {
      setError('Ошибка сети: ' + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }

  async function refine(instruction: string) {
    if (!simId) return;
    setPhase('generating'); setError(null);
    setEvents([{ type: 'stage', stage: 'refining' }]);
    try {
      const res = await fetch(`/api/simulations/${simId}/refine`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const body = await res.json();
      if (res.ok) { setHtml(body.html); setPhase('ready'); }
      else { setError(body.error ?? `Ошибка сервера (${res.status})`); setPhase('error'); }
    } catch (err) {
      setError('Ошибка сети: ' + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setImage(String(r.result));
    r.readAsDataURL(f);
  }

  function submit() {
    const text = prompt.trim();
    if (!text || phase === 'generating') return;
    setPrompt('');
    // Пока открыта симуляция (simId есть) — любой запрос это доработка,
    // даже после ошибки; новая генерация только после «+ начать новую».
    if (simId) refine(text);
    else generate(text);
  }

  const hasSim = simId !== null;

  return (
    <div className="workbench">
      <aside className="chat-pane">
        <h2>{hasSim ? 'Доработка' : 'Новая симуляция'}</h2>
        {hasSim && phase !== 'generating' && (
          <button className="link-btn" onClick={() => {
            setPhase('idle'); setSimId(null); setHtml(null); setEvents([]); setError(null);
          }}>+ начать новую</button>
        )}
        <ProgressFeed events={events} />
        {error && <div className="error-box">{error}</div>}
        <div className="composer">
          {!hasSim && (
            <div className="composer-row">
              <select value={mode} onChange={(e) => setMode(e.target.value as QualityMode)}>
                <option value="max">Максимум (3-6 мин)</option>
                <option value="standard">Стандарт (1-3 мин)</option>
                <option value="fast">Быстрый (~1 мин)</option>
              </select>
              <button onClick={() => fileRef.current?.click()}>
                {image ? '🖼 картинка ✓' : '🖼 картинка'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            </div>
          )}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={hasSim
              ? 'Что изменить? Например: сделай частицы медленнее'
              : 'Опишите симуляцию. Например: диффузия молекул духов в комнате'}
            rows={3}
          />
          <button className="primary" disabled={phase === 'generating'} onClick={submit}>
            {phase === 'generating' ? 'Работаю…' : hasSim ? 'Доработать' : 'Создать'}
          </button>
        </div>
      </aside>
      <section className="preview-pane">
        <PreviewFrame html={html} />
        {simId && (
          <div className="preview-actions">
            <a href={`/present/${simId}`} target="_blank">▶ Режим презентации</a>
            <a href={`/api/simulations/${simId}/export`}>⬇ Экспорт HTML</a>
          </div>
        )}
      </section>
    </div>
  );
}
