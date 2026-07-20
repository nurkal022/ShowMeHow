'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PipelineEvent, QualityMode } from '@/lib/types';
import { CANDIDATE_DEFAULTS } from '@/lib/candidate-defaults';
import { historyLabel } from '@/lib/history-label';
import ProgressView from './progress/ProgressView';
import PreviewFrame from './PreviewFrame';

type Phase = 'idle' | 'generating' | 'ready' | 'error';

const ACTIVE_JOB_KEY = 'showmehow-active-job';

export default function Workbench() {
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [simId, setSimId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<QualityMode>('max');
  const [candidates, setCandidates] = useState<number>(CANDIDATE_DEFAULTS.max);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Мобильные вкладки: на узком экране видна только одна колонка. На десктопе (≥900px)
  // переключатель скрыт CSS и обе колонки показываются одновременно.
  const [activeTab, setActiveTab] = useState<'create' | 'preview'>('create');
  const fileRef = useRef<HTMLInputElement>(null);
  // Strict Mode в dev монтирует компонент дважды — mount-эффект должен отработать
  // ровно один раз, иначе реплей job-стрима запустится параллельно и продублирует события.
  const didInit = useRef(false);
  // jobId, к стриму которого мы сейчас подключены (защита от повторного connect к тому же job).
  const connectedJobRef = useRef<string | null>(null);

  function onModeChange(next: QualityMode) {
    setMode(next);
    // Смена режима сбрасывает пользовательский выбор числа кандидатов на дефолт режима.
    setCandidates(CANDIDATE_DEFAULTS[next]);
  }

  function clearActiveJob() {
    localStorage.removeItem(ACTIVE_JOB_KEY);
    setJobId(null);
    setCancelling(false);
  }

  useEffect(() => {
    // Guard от двойного вызова эффекта в React Strict Mode: без него dev-режим
    // открыл бы ДВА параллельных SSE-подключения к job и каждый реплей-кадр
    // попадал бы в state дважды.
    if (didInit.current) return;
    didInit.current = true;
    // Порядок при монтировании: активный (running) job важнее ?id= — он восстанавливается
    // из localStorage и переподключается по SSE; ?id= обрабатывается только если такого
    // job нет (или он уже завершился и был вычищен).
    const activeJobId = localStorage.getItem(ACTIVE_JOB_KEY);
    if (!activeJobId) {
      const id = search.get('id');
      if (id) openSimulation(id);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${activeJobId}`);
        if (!res.ok) {
          // 404 (job исчез) или иная ошибка сервера — реплей всё равно невозможен.
          localStorage.removeItem(ACTIVE_JOB_KEY);
          return;
        }
        const job = await res.json();
        if (job.status === 'running') {
          setJobId(activeJobId);
          await connectToJob(activeJobId);
        } else if (job.status === 'done') {
          localStorage.removeItem(ACTIVE_JOB_KEY);
          if (job.simulationId) await openSimulation(job.simulationId);
        } else if (job.status === 'cancelled') {
          localStorage.removeItem(ACTIVE_JOB_KEY);
          setError('Генерация отменена');
          setPhase('idle');
        } else {
          // error
          localStorage.removeItem(ACTIVE_JOB_KEY);
          setError(job.error ?? 'Ошибка генерации');
          setPhase('error');
        }
      } catch {
        // Сеть недоступна прямо сейчас — оставляем ключ; при следующей загрузке
        // страницы попробуем переподключиться снова.
      }
    })();
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
        if (s?.qualityMode) onModeChange(s.qualityMode);
      } catch {
        // настройки недоступны — остаёмся на дефолтном режиме
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      loadHistory(id);
    } catch (err) {
      setError('Не удалось загрузить симуляцию: '
        + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }

  async function loadHistory(id: string) {
    try {
      const res = await fetch(`/api/simulations/${id}/history`);
      if (res.ok) setHistory(await res.json());
    } catch {
      // история версий не критична — просто не показываем список
    }
  }

  async function restoreVersion(name: string) {
    if (!simId) return;
    try {
      const res = await fetch(`/api/simulations/${simId}/history`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (res.ok) {
        setHtml(body.html);
        loadHistory(simId);
      } else {
        setError(body.error ?? `Ошибка сервера (${res.status})`);
      }
    } catch (err) {
      setError('Ошибка сети: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function consumeJobStream(res: Response) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let sawTerminal = false;
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
          if (e.type === 'done') {
            sawTerminal = true;
            clearActiveJob();
            // Готовый результат — на мобиле сразу показываем вкладку превью.
            setActiveTab('preview');
            await openSimulation(e.simulationId);
          }
          if (e.type === 'error') {
            sawTerminal = true;
            clearActiveJob();
            // Сообщение об ошибке уже показывает ProgressView (баннер .error-box
            // внутри неё, из того же события) — здесь только разблокируем композер.
            setPhase('error');
          }
          if (e.type === 'cancelled') {
            sawTerminal = true;
            clearActiveJob();
            // Баннер отмены рисует ProgressView из этого же события — не дублируем.
            setPhase('idle');
          }
        }
      }
      if (!sawTerminal) {
        // Strand-guard: поток закрылся без терминального события. НЕ чистим ключ —
        // job может ещё работать на сервере (например, сеть моргнула); при следующем
        // монтировании мы переподключимся и, если job жив, реплей восстановит прогресс.
        setError('Поток прервался, попробуйте перезагрузить страницу');
        setPhase('error');
      }
    } catch (err) {
      setError('Ошибка при получении событий: '
        + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }

  async function connectToJob(id: string) {
    // Идемпотентность по jobId: если к этому job уже открыт стрим, второй вызов
    // (двойной эффект, случайный повторный клик) не открывает параллельное подключение.
    if (connectedJobRef.current === id) return;
    connectedJobRef.current = id;
    setPhase('generating');
    // Реплей всегда начинается с чистого листа: даже неожиданный реконнект
    // не может продублировать уже показанные события.
    setEvents([]);
    try {
      const res = await fetch(`/api/jobs/${id}/stream`);
      if (!res.ok) {
        // Job исчез (404) или сервер вернул ошибку — чистим ключ, реплей невозможен.
        clearActiveJob();
        setError('Задание не найдено');
        setPhase('error');
        return;
      }
      await consumeJobStream(res);
    } catch (err) {
      setError('Ошибка сети: ' + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    } finally {
      // Стрим завершился (терминально или обрывом) — разрешаем будущий реконнект
      // к этому же job (например, после strand-guard и перезагрузки состояния).
      if (connectedJobRef.current === id) connectedJobRef.current = null;
    }
  }

  async function generate(text: string) {
    setPhase('generating'); setEvents([]); setError(null); setHtml(null); setCancelling(false);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, imageDataUrl: image ?? undefined, mode, candidates }),
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
      const { jobId: newJobId } = await res.json();
      localStorage.setItem(ACTIVE_JOB_KEY, newJobId);
      setJobId(newJobId);
      await connectToJob(newJobId);
    } catch (err) {
      setError('Ошибка сети: ' + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }

  async function cancelJob() {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    } catch {
      // Отмена best-effort: если запрос не дошёл, пользователь может нажать ещё раз
      // (requestCancel идемпотентен); статус придёт по SSE, если сервер всё же получил её.
      setCancelling(false);
    }
  }

  // Доработка существующей симуляции идёт мимо job-пайплайна (прямой POST без событий
  // суда/кандидатов) — единственный интересный чип таймлайна здесь «Доводка». Стартовое
  // событие эмитим сразу; end — по завершении запроса (все три исхода), иначе чип
  // «Доводка» пульсировал бы бесконечно даже после того, как результат уже показан.
  async function refine(instruction: string) {
    if (!simId) return;
    setPhase('generating'); setError(null);
    setEvents([{ type: 'stage', stage: 'refining', status: 'start', at: Date.now() }]);
    function closeRefiningStage() {
      setEvents((prev) => [...prev, { type: 'stage', stage: 'refining', status: 'end', at: Date.now() }]);
    }
    try {
      const res = await fetch(`/api/simulations/${simId}/refine`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const body = await res.json();
      closeRefiningStage();
      if (res.ok) { setHtml(body.html); setPhase('ready'); loadHistory(simId); }
      else { setError(body.error ?? `Ошибка сервера (${res.status})`); setPhase('error'); }
    } catch (err) {
      closeRefiningStage();
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
    <div className={`workbench tab-${activeTab}`}>
      <div className="mobile-tabs" role="tablist" aria-label="Разделы">
        <button
          role="tab"
          aria-selected={activeTab === 'create'}
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}
        >
          Создать
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'preview'}
          className={activeTab === 'preview' ? 'active' : ''}
          onClick={() => setActiveTab('preview')}
        >
          Превью
        </button>
      </div>
      <aside className="chat-pane">
        <h2>{hasSim ? 'Доработка' : 'Новая симуляция'}</h2>
        {hasSim && phase !== 'generating' && (
          <button className="link-btn" onClick={() => {
            setPhase('idle'); setSimId(null); setHtml(null); setEvents([]); setError(null);
            setHistory([]); clearActiveJob();
          }}>+ начать новую</button>
        )}
        <ProgressView events={events} />
        {error && <div className="error-box">{error}</div>}
        {phase === 'generating' && jobId && (
          <button
            className="link-btn danger"
            disabled={cancelling}
            onClick={cancelJob}
          >
            {cancelling ? 'Отменяю…' : '✕ Отменить'}
          </button>
        )}
        <div className="composer">
          {!hasSim && (
            <div className="composer-row">
              <select
                aria-label="Режим качества"
                value={mode}
                disabled={phase === 'generating'}
                onChange={(e) => onModeChange(e.target.value as QualityMode)}
              >
                <option value="max">Максимум (3-6 мин)</option>
                <option value="standard">Стандарт (1-3 мин)</option>
                <option value="fast">Быстрый (~1 мин)</option>
              </select>
              <select
                aria-label="Число кандидатов"
                value={candidates}
                disabled={phase === 'generating'}
                onChange={(e) => setCandidates(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>Кандидатов: {n}</option>
                ))}
              </select>
              <button disabled={phase === 'generating'} onClick={() => fileRef.current?.click()}>
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
        {phase === 'generating' && (
          <button className="to-process-badge" onClick={() => setActiveTab('create')}>
            идёт генерация → к процессу
          </button>
        )}
        <PreviewFrame html={html} />
        {simId && (
          <div className="preview-actions">
            <a href={`/present/${simId}`} target="_blank" rel="noopener noreferrer">▶ Режим презентации</a>
            <a href={`/api/simulations/${simId}/export`}>⬇ Экспорт HTML</a>
            {history.length > 0 && (
              <details className="history-dropdown">
                <summary>История версий ({history.length})</summary>
                <ul>
                  {history.map((name) => (
                    <li key={name}>
                      <span>{historyLabel(name)}</span>
                      <button onClick={() => restoreVersion(name)}>Восстановить</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
