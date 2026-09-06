'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PipelineEvent, QualityMode } from '@/lib/types';
import type { JobStatus } from '@/lib/jobs';
import type { UserPrefs } from '@/lib/auth/prefs';
import { historyLabel } from '@/lib/history-label';
import ProgressView from './progress/ProgressView';
import PreviewFrame from './PreviewFrame';
import ConstructorStand from './constructor/ConstructorStand';
import { useVoiceInput } from './useVoiceInput';
import {
  IconClose, IconDownload, IconHistory, IconImage, IconMic,
  IconPlay, IconPlus, IconSend, IconSliders, IconSpark, IconWand,
} from './icons';

type Phase = 'idle' | 'generating' | 'ready' | 'error';

const ACTIVE_JOB_KEY = 'showmehow-active-job';

const SUGGESTIONS = [
  'Диффузия молекул духов в комнате',
  'Маятник с изменяемой длиной нити',
  'Преломление луча на границе двух сред',
  'Орбита спутника вокруг планеты',
];

const QUALITY_OPTIONS: [QualityMode, string, string][] = [
  ['max', 'Максимум', '3–6 мин'],
  ['standard', 'Стандарт', '1–3 мин'],
  ['fast', 'Быстро', '~1 мин'],
];

/**
 * Что делать при восстановлении job из localStorage при монтировании, в зависимости
 * от его текущего статуса на сервере. 'queued' обрабатывается так же, как 'running':
 * задание ещё живо (просто не стартовало), поэтому вместо ошибки мы переподключаемся
 * к SSE-потоку — реплей уже содержит событие { type: 'queued', position }, и дальше
 * job сам пришлёт стадии, когда до него дойдёт очередь.
 */
export function restoredJobAction(status: JobStatus): 'reconnect' | 'open' | 'cancelled' | 'error' {
  if (status === 'running' || status === 'queued') return 'reconnect';
  if (status === 'done') return 'open';
  if (status === 'cancelled') return 'cancelled';
  return 'error';
}

interface QuotaInfo { limit: number | null; used: number; remaining: number | null }
interface Message { role: 'user' | 'bot'; text: string }

export default function Workbench() {
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [simId, setSimId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<QualityMode>('max');
  const [prefs, setPrefs] = useState<UserPrefs>({});
  // Стенд — то, что человек видит первым: он показывает, что система умеет.
  // Свободный текст остаётся на расстоянии одной кнопки.
  const [inputMode, setInputMode] = useState<'stand' | 'text'>('stand');
  const [showSettings, setShowSettings] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  // Мобильные вкладки: на узком экране видна только одна колонка. На десктопе
  // переключатель скрыт CSS и обе колонки показываются одновременно.
  const [activeTab, setActiveTab] = useState<'create' | 'preview'>('create');
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  // Strict Mode в dev монтирует компонент дважды — mount-эффект должен отработать
  // ровно один раз, иначе реплей job-стрима запустится параллельно и продублирует события.
  const didInit = useRef(false);
  // jobId, к стриму которого мы сейчас подключены (защита от повторного connect к тому же job).
  const connectedJobRef = useRef<string | null>(null);

  const voice = useVoiceInput((text) => {
    setPrompt((prev) => (prev ? `${prev} ${text}` : text));
    textRef.current?.focus();
  });

  function clearActiveJob() {
    localStorage.removeItem(ACTIVE_JOB_KEY);
    setJobId(null);
    setCancelling(false);
  }

  useEffect(() => { fetchQuota(); }, []);

  // Лента всегда прокручена к последнему событию — иначе прогресс уезжает за край.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, events.length, phase]);

  // Поле ввода растёт под текст, но не больше max-height из CSS.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [prompt]);

  // Квота и настройки нужны только для оформления композера — не критичны,
  // поэтому молча игнорируем сетевые ошибки. Перечитываем и после успешной
  // генерации: она тратит квоту, и остаток должен обновиться без перезагрузки.
  async function fetchQuota() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return;
      const body = await res.json();
      setQuota(body.quota ?? null);
      setQuotaMessage(body.quotaMessage ?? null);
      const p: UserPrefs = body.prefs ?? {};
      setPrefs(p);
      if (p.quality) setMode(p.quality);
      if (p.startWithConstructor === false) setInputMode('text');
    } catch {
      // см. комментарий выше
    }
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
        switch (restoredJobAction(job.status)) {
          case 'reconnect':
            setJobId(activeJobId);
            await connectToJob(activeJobId);
            break;
          case 'open':
            localStorage.removeItem(ACTIVE_JOB_KEY);
            if (job.simulationId) await openSimulation(job.simulationId);
            break;
          case 'cancelled':
            localStorage.removeItem(ACTIVE_JOB_KEY);
            setError('Генерация отменена');
            setPhase('idle');
            break;
          default:
            localStorage.removeItem(ACTIVE_JOB_KEY);
            setError(job.error ?? 'Ошибка генерации');
            setPhase('error');
            break;
        }
      } catch {
        // Сеть недоступна прямо сейчас — оставляем ключ; при следующей загрузке
        // страницы попробуем переподключиться снова.
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

  function say(role: Message['role'], text: string) {
    setMessages((prev) => [...prev, { role, text }]);
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
            say('bot', 'Готово. Симуляция справа — можно показывать или дорабатывать.');
            // Готовый результат — на мобиле сразу показываем вкладку превью.
            setActiveTab('preview');
            await openSimulation(e.simulationId);
            // Успешная генерация тратит квоту — перечитываем остаток.
            fetchQuota();
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
    setInputMode('text');
    say('user', text);
    setPhase('generating'); setEvents([]); setError(null); setHtml(null); setCancelling(false);
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
    say('user', instruction);
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
      if (res.ok) {
        setHtml(body.html); setPhase('ready'); loadHistory(simId);
        say('bot', 'Готово, обновил.');
      } else {
        setError(body.error ?? `Ошибка сервера (${res.status})`); setPhase('error');
      }
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
    if (!hasSim && quota?.remaining === 0) return;
    setPrompt('');
    // Пока открыта симуляция (simId есть) — любой запрос это доработка,
    // даже после ошибки; новая генерация только после «Новая симуляция».
    if (simId) refine(text);
    else generate(text);
  }

  /**
   * Возврат к стенду. Обязательно сбрасывает фазу: стенд показывается только в
   * состоянии покоя, и после неудачной генерации фаза остаётся 'error' — кнопка
   * «конструктор» тогда просто молчала бы.
   */
  function openStand() {
    setInputMode('stand');
    setPhase('idle');
    setError(null);
    setEvents([]);
  }

  function startNew() {
    setPhase('idle'); setSimId(null); setHtml(null); setEvents([]); setError(null);
    setHistory([]); setMessages([]); setImage(null); clearActiveJob();
    setActiveTab('create');
    setInputMode(prefs.startWithConstructor === false ? 'text' : 'stand');
  }

  const hasSim = simId !== null;
  const busy = phase === 'generating';
  const outOfQuota = !hasSim && quota?.remaining === 0;
  const empty = messages.length === 0 && events.length === 0 && !hasSim;
  const voiceOn = voice.supported && prefs.voiceInput !== false;

  // Пока ничего не начато — на экране стенд во всю ширину. Как только пошла
  // генерация или открыта симуляция, возвращается обычная мастерская.
  if (!hasSim && phase === 'idle' && inputMode === 'stand') {
    return (
      <ConstructorStand
        disabled={busy || outOfQuota}
        defaultLevel={prefs.level}
        defaultStyle={prefs.style}
        quotaNote={quota && quota.limit !== null && (
          outOfQuota
            ? <span className="quota-line quota-exhausted">{quotaMessage}</span>
            : <span className="quota-line">Осталось {quota.remaining} из {quota.limit}</span>
        )}
        onCreate={(text) => { if (!busy) generate(text); }}
        onWriteText={(text) => { setPrompt(text); setInputMode('text'); }}
      />
    );
  }

  return (
    <div className={`workbench tab-${activeTab}`}>
      <div className="mobile-tabs" role="tablist" aria-label="Разделы">
        <button role="tab" aria-selected={activeTab === 'create'}
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}>Диалог</button>
        <button role="tab" aria-selected={activeTab === 'preview'}
          className={activeTab === 'preview' ? 'active' : ''}
          onClick={() => setActiveTab('preview')}>Симуляция</button>
      </div>

      <aside className="chat-pane">
        <div className="thread">
          {(hasSim || messages.length > 0) && (
            <div className="thread-top">
              <span className="label">{hasSim ? 'Доработка' : 'Диалог'}</span>
              {!busy && (
                <button className="btn btn-sm btn-secondary" onClick={startNew}>
                  <IconPlus size={16} />Новая
                </button>
              )}
            </div>
          )}

          {empty && (
            <div className="hero">
              <h2>С чего начнём?</h2>
              <p>Опишите явление — соберу интерактивную симуляцию.</p>
              <div className="hero-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => setPrompt(s)}>
                    <IconSpark size={17} />{s}
                  </button>
                ))}
                <button className="suggestion" onClick={openStand}>
                  <IconWand size={17} />Собрать по шагам в конструкторе
                </button>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'msg msg-user' : 'msg msg-bot'}>
              <div className="bubble">{m.text}</div>
            </div>
          ))}

          <ProgressView events={events} />
          {error && <div className="error-box">{error}</div>}
          {busy && jobId && (
            <button className="btn btn-sm btn-danger" style={{ alignSelf: 'flex-start' }}
              disabled={cancelling} onClick={cancelJob}>
              <IconClose size={15} />{cancelling ? 'Отменяю…' : 'Отменить'}
            </button>
          )}
          <div ref={threadEndRef} />
        </div>

        <div className="composer">
          <div className="composer-wrap">
            {showSettings && (
              <div className="popover" role="dialog" aria-label="Настройки генерации">
                <div className="field">
                  <span>Качество</span>
                  <div className="segmented">
                    {QUALITY_OPTIONS.map(([v, label, hint]) => (
                      <button key={v} type="button" title={hint} aria-pressed={mode === v}
                        className={mode === v ? 'segmented-item active' : 'segmented-item'}
                        disabled={busy} onClick={() => setMode(v)}>{label}</button>
                    ))}
                  </div>
                  <span className="muted">{QUALITY_OPTIONS.find(([v]) => v === mode)?.[2]}</span>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowSettings(false)}>
                  Готово
                </button>
              </div>
            )}
            <div className="composer-box">
              <textarea
                ref={textRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                placeholder={hasSim ? 'Что изменить?' : 'Опишите симуляцию'}
                rows={1}
                aria-label={hasSim ? 'Что изменить' : 'Описание симуляции'}
              />
              <div className="composer-tools">
                {!hasSim && (
                  <>
                    <button className="icon-btn" title="Собрать в конструкторе"
                      aria-label="Собрать в конструкторе" disabled={busy}
                      onClick={openStand}>
                      <IconWand size={19} />
                    </button>
                    <button className={image ? 'icon-btn on' : 'icon-btn'} title="Картинка-образец"
                      aria-label="Картинка-образец" disabled={busy}
                      onClick={() => fileRef.current?.click()}>
                      <IconImage size={19} />
                    </button>
                    <button className={showSettings ? 'icon-btn on' : 'icon-btn'} title="Качество"
                      aria-label="Настройки генерации" disabled={busy}
                      onClick={() => setShowSettings((v) => !v)}>
                      <IconSliders size={19} />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                  </>
                )}
                <span className="spacer" />
                {voiceOn && (
                  <button className={voice.listening ? 'icon-btn rec' : 'icon-btn'}
                    title={voice.listening ? 'Остановить запись' : 'Голосовой ввод'}
                    aria-label="Голосовой ввод" aria-pressed={voice.listening}
                    onClick={voice.toggle} disabled={busy}>
                    <IconMic size={19} />
                  </button>
                )}
                <button className="composer-send" onClick={submit}
                  disabled={busy || !prompt.trim() || outOfQuota}
                  title="Отправить" aria-label="Отправить">
                  <IconSend size={19} />
                </button>
              </div>
            </div>
          </div>
          <div className="composer-foot">
            {image && <span className="attach-note"><IconImage size={14} />картинка добавлена</span>}
            {voice.error && <span className="voice-hint">{voice.error}</span>}
            <span className="spacer" />
            {!hasSim && quota && quota.limit !== null && (
              outOfQuota
                ? <span className="quota-line quota-exhausted">{quotaMessage}</span>
                : <span className="quota-line">Осталось {quota.remaining} из {quota.limit}</span>
            )}
          </div>
        </div>
      </aside>

      <section className="preview-pane">
        {busy && (
          <button className="to-process-badge" onClick={() => setActiveTab('create')}>
            идёт генерация — к процессу
          </button>
        )}
        <PreviewFrame html={html} />
        {simId && (
          <div className="preview-actions">
            <a className="btn btn-sm btn-ghost" href={`/present/${simId}`} target="_blank" rel="noopener noreferrer">
              <IconPlay size={16} />Презентация
            </a>
            <a className="btn btn-sm btn-ghost" href={`/api/simulations/${simId}/export`}>
              <IconDownload size={16} />Экспорт
            </a>
            <span className="spacer" />
            {history.length > 0 && (
              <details className="history-dropdown">
                <summary><IconHistory size={16} />&nbsp;Версии ({history.length})</summary>
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
