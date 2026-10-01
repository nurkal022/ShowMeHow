'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PipelineEvent, PlanSpec, QualityMode, SimLevel } from '@/lib/types';
import type { JobKind, JobStatus } from '@/lib/jobs/store';
import type { UserPrefs } from '@/lib/auth/prefs';
import { historyLabel } from '@/lib/history-label';
import { RECONNECT_COMMENT } from '@/lib/jobs/sse';
import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';
import { lessonBlockFromSearch } from '@/lib/lms/links';
import { callApi } from './cabinet/api';
import ProgressView from './progress/ProgressView';
import PreviewFrame from './PreviewFrame';
import ConstructorStand from './constructor/ConstructorStand';
import LiveStage from './workbench/LiveStage';
import SessionsPanel from './workbench/SessionsPanel';
import PlanEditor, { LEVEL_OPTIONS } from './workbench/PlanEditor';
import SimSettings from './workbench/SimSettings';
import CompareVersions from './workbench/CompareVersions';
import QualityPanel from './workbench/QualityPanel';
import type { SessionItem } from '@/lib/jobs/sessions';
import { useVoiceInput } from './useVoiceInput';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { translator } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import { workbench } from '@/i18n/messages/workbench';
import { common } from '@/i18n/messages/common';
import {
  IconCheck, IconClose, IconDownload, IconHistory, IconImage, IconMic, IconMinus,
  IconPlay, IconPlus, IconSend, IconSliders, IconSpark, IconSwap, IconTarget, IconUndo, IconWand,
} from './icons';

type Phase = 'idle' | 'generating' | 'ready' | 'error';

const ACTIVE_JOB_KEY = 'showmehow-active-job';

const SUGGESTIONS = ['sugg1', 'sugg2', 'sugg3', 'sugg4'] as const;

// Первая рабочая версия появляется в рабочей области через 1–2 минуты в любом режиме;
// режим задаёт, сколько ещё её будут проверять и доводить (остановить можно в любой момент).
const QUALITY_OPTIONS: [QualityMode, 'qFast' | 'qStandard' | 'qMax', 'qFastHint' | 'qStandardHint' | 'qMaxHint'][] = [
  ['fast', 'qFast', 'qFastHint'],
  ['standard', 'qStandard', 'qStandardHint'],
  ['max', 'qMax', 'qMaxHint'],
];

/**
 * Что делать при восстановлении job из localStorage при монтировании, в зависимости
 * от его текущего статуса на сервере. 'queued' обрабатывается так же, как 'running':
 * задание ещё живо (просто не стартовало), поэтому вместо ошибки мы переподключаемся
 * к SSE-потоку — пока задание ждёт, поток сразу после реплея присылает
 * { type: 'queued', position } (место не хранится в журнале, а считается на лету
 * и обновляется при изменении), а стадии придут, когда до задания дойдёт очередь.
 */
export function restoredJobAction(status: JobStatus): 'reconnect' | 'open' | 'cancelled' | 'error' {
  if (status === 'running' || status === 'queued') return 'reconnect';
  if (status === 'done') return 'open';
  if (status === 'cancelled') return 'cancelled';
  return 'error';
}

export function doneMessage(kind: JobKind, locale: Locale = 'ru'): string {
  const t = translator(workbench, locale);
  return kind === 'refine' ? t('doneRefine') : t('doneGenerate');
}

// Паузы между попытками переподключения к потоку. Их суммы хватает, чтобы пережить
// рестарт веба при выкладке; генерация на воркере тем временем идёт дальше.
const RECONNECT_DELAYS_MS = [1000, 2000, 3000, 5000, 5000, 10000, 10000, 15000, 15000, 30000];

/** Пауза перед попыткой номер attempt (с нуля); null — пора сдаться. */
export function reconnectDelay(attempt: number): number | null {
  return RECONNECT_DELAYS_MS[attempt] ?? null;
}

/** Пауза после планового закрытия потока: разброс, чтобы после рестарта веба не прийти толпой. */
const PLANNED_RECONNECT_MIN_MS = 250;
const PLANNED_RECONNECT_MAX_MS = 1000;

export interface ReconnectState {
  /** Номер следующей неудачной попытки подряд (с нуля). */
  attempt: number;
  /** Больше всего событий, принесённых одним подключением. */
  seen: number;
}

/**
 * Что делать после подключения, закрытого без терминального события. planned — сервер
 * закрыл поток сам (`: reconnect`): рестарт веба или предел жизни потока; такие закрытия
 * попыток не расходуют. Обрыв после нового прогресса начинает отсчёт заново, пустой
 * реплей того же журнала — нет. delay null — пора сдаться.
 */
export function nextReconnect(
  state: ReconnectState,
  result: { planned: boolean; received: number },
  random: () => number = Math.random,
): ReconnectState & { delay: number | null } {
  const progressed = result.received > state.seen;
  const seen = progressed ? result.received : state.seen;
  if (result.planned) {
    const spread = PLANNED_RECONNECT_MAX_MS - PLANNED_RECONNECT_MIN_MS;
    return { attempt: 0, seen, delay: PLANNED_RECONNECT_MIN_MS + Math.round(random() * spread) };
  }
  const attempt = progressed ? 0 : state.attempt;
  return { attempt: attempt + 1, seen, delay: reconnectDelay(attempt) };
}

/**
 * Событие потока в показанный список. Журнал задания только дописывается, и каждое
 * подключение отдаёт его с начала в том же порядке, поэтому событие журнала с номером
 * index (с нуля, в этом подключении) уже показано, если показанных событий журнала больше.
 * Позиции в очереди в журнал не входят и просто дописываются. Если ничего не изменилось,
 * возвращается тот же массив: прогресс не перерисовывается и не сворачивается.
 */
export function applyStreamEvent(
  shown: PipelineEvent[], index: number, e: PipelineEvent,
): PipelineEvent[] {
  if (e.type !== 'queued') {
    let logShown = 0;
    for (const s of shown) if (s.type !== 'queued') logShown++;
    if (index < logShown) return shown;
  }
  return [...shown, e];
}

/** Пауза, которую прерывает отмена. Слушатель отмены снимается, как только пауза кончилась. */
export function pauseUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface QuotaInfo { limit: number | null; used: number; remaining: number | null }
/**
 * Сообщение ленты. У ответа помощника, кроме текста, бывает разбор правки
 * (что изменено, чего он делать не стал, что предлагает дальше) и варианты ответа
 * на уточняющий вопрос — их человек выбирает кликом, не набирая заново.
 */
interface Message {
  role: 'user' | 'bot';
  text: string;
  changed?: string[];
  skipped?: string[];
  next?: string[];
  options?: string[];
  /** Просьба, к которой задан уточняющий вопрос: к ней приклеивается выбранный вариант. */
  askedFor?: string;
  /** Правка ухудшила проверки: под сообщением кнопка отката к прошлой версии. */
  undo?: boolean;
}

/** Куда человек показал в превью: доли размеров кадра и что там лежит. */
interface Pick { x: number; y: number; target: string }

export default function Workbench() {
  const search = useSearchParams();
  const t = useT(workbench);
  const tc = useT(common);
  const f = useFormat();
  const locale = useLocale();
  // Учитель пришёл из редактора курса: готовую симуляцию можно вставить в блок урока.
  const returnTo = lessonBlockFromSearch(search.get('returnTo'));
  const [inserting, setInserting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [simId, setSimId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<QualityMode>('standard');
  // Уровень тренажёра: 'auto' — решает планировщик по теме.
  const [level, setLevel] = useState<SimLevel | 'auto'>('auto');
  // Карточка плана перед генерацией: в «Быстро» её нет — там важна скорость.
  const [planFirst, setPlanFirst] = useState(true);
  const [draftSpec, setDraftSpec] = useState<PlanSpec | null>(null);
  const [planPrompt, setPlanPrompt] = useState('');
  const [planning, setPlanning] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [exemplar, setExemplar] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  // Номер текущего запроса плана: ответ на запрос, который уже не актуален, отбрасывается.
  const planTicket = useRef(0);
  const [prefs, setPrefs] = useState<UserPrefs>({});
  // Стенд — то, что человек видит первым: он показывает, что система умеет.
  // Свободный текст остаётся на расстоянии одной кнопки.
  const [inputMode, setInputMode] = useState<'stand' | 'text'>('stand');
  const [showSettings, setShowSettings] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<JobKind>('generate');
  const [cancelling, setCancelling] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
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
  // Подключение к потоку задания: уход со страницы обрывает и чтение, и попытки переподключиться.
  const streamAbortRef = useRef<AbortController | null>(null);

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
  useEffect(() => () => streamAbortRef.current?.abort(), []);

  // «Покажи и скажи»: превью сообщает, куда кликнули, и просьба уходит про это место.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== previewRef.current?.contentWindow) return;
      if (e.data?.type !== 'smh-pick') return;
      setPicking(false);
      if (e.data.cancelled) return;
      setPick({ x: Number(e.data.x), y: Number(e.data.y), target: String(e.data.target || t('pickScene')) });
      textRef.current?.focus();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Превью перерисовалось (другая версия, настройки, другая симуляция) — режим выбора жил
  // внутри старого кадра и пропал вместе с ним, а отмеченная точка относится к старому содержимому.
  useEffect(() => { setPicking(false); setPick(null); }, [html, simId]);

  function togglePick() {
    const w = previewRef.current?.contentWindow;
    if (!w) return;
    if (picking) { w.postMessage({ type: 'smh-pick-stop' }, '*'); setPicking(false); return; }
    setActiveTab('preview');
    w.postMessage({ type: 'smh-pick-start' }, '*');
    setPicking(true);
  }

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
    // Учитель пришёл из задания: помощник уже описал тренажёр — описание ложится в поле запроса.
    const brief = search.get('brief');
    if (brief) {
      setPrompt(brief.slice(0, 2000));
      setInputMode('text');
    }
    // Исследователь пришёл из раздела «Исследования»: уровень тренажёра задан заготовкой.
    const presetLevel = search.get('level');
    if (presetLevel === 'demo' || presetLevel === 'lab' || presetLevel === 'research') setLevel(presetLevel);
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
        if (isUnauthorized(res)) { loginWithReturnTo('/'); return; }
        if (!res.ok) {
          // 404 (job исчез) или иная ошибка сервера — реплей всё равно невозможен.
          localStorage.removeItem(ACTIVE_JOB_KEY);
          return;
        }
        const job = await res.json();
        const kind: JobKind = job.kind === 'refine' ? 'refine' : 'generate';
        const target: string | undefined = job.targetSimulationId;
        switch (restoredJobAction(job.status)) {
          case 'reconnect':
            setJobId(activeJobId);
            // Доработка идёт поверх открытой симуляции — сначала показываем её.
            if (kind === 'refine' && target) await openSimulation(target);
            await connectToJob(activeJobId, kind);
            break;
          case 'open':
            localStorage.removeItem(ACTIVE_JOB_KEY);
            if (job.simulationId) await openSimulation(job.simulationId);
            break;
          case 'cancelled':
            localStorage.removeItem(ACTIVE_JOB_KEY);
            if (kind === 'refine' && target) {
              await openSimulation(target);
            } else {
              setError(t('genCancelled'));
              setPhase('idle');
            }
            break;
          default:
            localStorage.removeItem(ACTIVE_JOB_KEY);
            if (kind === 'refine' && target) await openSimulation(target);
            setError(job.error ?? (kind === 'refine' ? t('refineError') : t('genError')));
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
      if (isUnauthorized(res)) { loginWithReturnTo('/'); return; }
      if (!res.ok) {
        setError(t('loadSimFailed'));
        setPhase('error');
        return;
      }
      const { html, exemplar: starred } = await res.json();
      setSimId(id); setHtml(html); setPhase('ready'); setExemplar(!!starred);
      loadHistory(id);
      loadThread(id);
    } catch (err) {
      setError(t('loadSimFailedWith', { error: err instanceof Error ? err.message : String(err) }));
      setPhase('error');
    }
  }

  /** Переписка по симуляции из истории заданий — чтобы вернуться и продолжить с того же места. */
  async function loadThread(id: string) {
    try {
      const res = await fetch(`/api/simulations/${id}/thread`);
      if (!res.ok) return;
      const body = await res.json() as { messages: Message[] };
      // Живую ленту текущей сессии не затираем: история нужна, когда лента пуста.
      if (body.messages.length > 0) {
        setMessages((prev) => (prev.length > 0 ? prev : body.messages.map(
          ({ role, text, changed, skipped, next }) => ({ role, text: role === 'bot' ? f.message(text) : text, changed, skipped, next }))));
      }
    } catch { /* переписка — удобство */ }
  }

  /** «Оставить эту версию»: черновик сразу становится симуляцией, полировка останавливается. */
  async function keepDraft(version: number) {
    if (!jobId || keeping) return;
    setKeeping(true);
    const res = await callApi<{ simulationId: string }>(`/api/jobs/${jobId}/keep`, 'POST', { version });
    setKeeping(false);
    if (!res.ok) return setError(res.error);
    streamAbortRef.current?.abort();
    clearActiveJob();
    setEvents([]);
    say('bot', t('keptVersion', { v: version }));
    setActiveTab('preview');
    await openSimulation(res.data.simulationId);
    fetchQuota();
  }

  async function openSession(s: SessionItem) {
    if (busy) return;
    streamAbortRef.current?.abort();
    setEvents([]); setError(null); setMessages([]); setHistory([]); setImage(null);
    if (s.simulationId) {
      setInputMode('text');
      await openSimulation(s.simulationId);
      return;
    }
    // Результата нет: возвращаем запрос в поле ввода, а черновик, если он был, можно сохранить.
    setSimId(null); setHtml(null); setPhase('idle'); setInputMode('text');
    setPrompt(s.prompt);
    if (s.drafts > 0) {
      const res = await callApi<{ simulationId: string }>(`/api/jobs/${s.jobId}/keep`, 'POST', {});
      if (res.ok) { setPrompt(''); say('bot', t('openedDraft')); await openSimulation(res.data.simulationId); }
    } else {
      say('bot', s.status === 'error'
        ? (s.error ? t('attemptFailedWith', { error: f.message(s.error) }) : t('attemptFailed'))
        : t('stoppedBeforeFirst'));
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
      if (isUnauthorized(res)) { loginWithReturnTo('/'); return; }
      const body = await res.json();
      if (res.ok) {
        setHtml(body.html);
        loadHistory(simId);
      } else {
        setError(body.error ?? t('serverError', { status: res.status }));
      }
    } catch (err) {
      setError(t('networkError', { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  /** Эталон: следующие генерации берут отсюда приборы, виды и урок как образец. */
  async function toggleExemplar() {
    if (!simId) return;
    const next = !exemplar;
    setExemplar(next);
    const res = await callApi<{ exemplar: boolean }>(`/api/simulations/${simId}/exemplar`, 'POST', { on: next });
    if (!res.ok) { setExemplar(!next); setError(res.error); return; }
    if (next) say('bot', t('exemplarOn'));
  }

  async function insertIntoLesson() {
    if (!simId || !returnTo) return;
    setInserting(true);
    const res = await callApi<{ href: string }>(`/api/teach/blocks/${returnTo}/simulation`, 'POST', { simulationId: simId });
    setInserting(false);
    if (res.ok) {
      window.location.assign(res.data.href);
      return;
    }
    setError(res.error === 'Не найдено.'
      ? t('blockNotFound')
      : res.error);
  }

  function say(role: Message['role'], text: string, extra: Partial<Message> = {}) {
    setMessages((prev) => [...prev, { role, text, ...extra }]);
  }

  /**
   * Выбранный вариант уточнения или предложение «что дальше» — такая же доработка,
   * только формулировку не набирали руками. Второй раз переспрашивать не о чем:
   * уходит clarified. Варианты у сообщения гасим, чтобы по ним нельзя было кликнуть дважды.
   */
  function chooseOption(index: number, option: string, askedFor?: string) {
    if (busy) return;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, options: [], next: [] } : m)));
    refine(askedFor ? t('clarified', { request: askedFor, option }) : option, true);
  }

  /**
   * Читает поток до конца. terminal — задание завершилось; received — сколько событий пришло;
   * planned — сервер закрыл поток сам и просит переподключиться.
   */
  async function consumeJobStream(
    res: Response, kind: JobKind,
  ): Promise<{ terminal: boolean; received: number; planned: boolean }> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let received = 0;
    let logIndex = 0;
    let planned = false;
    // Разбор правки уже сказал всё, что нужно: дежурное «Готово, обновил» после него — шум.
    let noted = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop()!;
        for (const part of parts) {
          // `: reconnect` — плановое закрытие; `: ping` — сердцебиение, событий в нём нет.
          if (part === RECONNECT_COMMENT) planned = true;
          if (!part.startsWith('data: ')) continue;
          const e = JSON.parse(part.slice(6)) as PipelineEvent;
          received++;
          const index = logIndex;
          if (e.type !== 'queued') logIndex++;
          // Реплей после переподключения дописывает только новое: прогресс не мигает.
          setEvents((prev) => applyStreamEvent(prev, index, e));
          if (e.type === 'note') {
            noted = true;
            say('bot', e.summary || t(kind === 'refine' ? 'doneRefine' : 'doneGenerate'),
              { changed: e.changed, skipped: e.skipped, next: e.next });
          }
          if (e.type === 'regression') {
            say('bot', t('regression', { lost: e.lost.join('; ') }), { undo: true });
          }
          if (e.type === 'done') {
            clearActiveJob();
            if (!noted) say('bot', t(kind === 'refine' ? 'doneRefine' : 'doneGenerate'));
            // Готовый результат — на мобиле сразу показываем вкладку превью.
            setActiveTab('preview');
            await openSimulation(e.simulationId);
            // Квоту тратит только генерация.
            if (kind === 'generate') fetchQuota();
            return { terminal: true, received, planned };
          }
          if (e.type === 'error') {
            clearActiveJob();
            // Текст ошибки уже показывает ProgressView из этого же события.
            setPhase('error');
            return { terminal: true, received, planned };
          }
          if (e.type === 'cancelled') {
            clearActiveJob();
            // Отменённая доработка оставляет открытой прежнюю версию симуляции.
            setPhase(kind === 'refine' ? 'ready' : 'idle');
            return { terminal: true, received, planned };
          }
        }
      }
    } catch {
      // Обрыв посреди чтения — то же, что закрытие без терминального события.
    }
    return { terminal: false, received, planned };
  }

  async function connectToJob(id: string, kind: JobKind) {
    // Идемпотентность по jobId: второй вызов не открывает параллельное подключение.
    if (connectedJobRef.current === id) return;
    connectedJobRef.current = id;
    const abort = new AbortController();
    streamAbortRef.current = abort;
    setJobKind(kind);
    setPhase('generating');
    let reconnect: ReconnectState = { attempt: 0, seen: 0 };
    // Показанное не стирается между подключениями: реплей сверяется с ним (applyStreamEvent).
    setEvents([]);
    try {
      for (;;) {
        let res: Response | null = null;
        try {
          res = await fetch(`/api/jobs/${id}/stream`, { signal: abort.signal });
        } catch {
          res = null;   // сеть или рестарт веба — попробуем ещё раз
        }
        if (abort.signal.aborted) return;
        if (res && isUnauthorized(res)) { clearActiveJob(); loginWithReturnTo('/'); return; }
        if (res && !res.ok && res.status < 500) {
          clearActiveJob();
          setError(res.status === 404 ? t('jobNotFound') : t('serverError', { status: res.status }));
          setPhase('error');
          return;
        }
        let closed = { planned: false, received: 0 };
        if (res && res.ok) {
          const { terminal, received, planned } = await consumeJobStream(res, kind);
          if (terminal || abort.signal.aborted) return;
          closed = { planned, received };
        }
        const next = nextReconnect(reconnect, closed);
        if (next.delay === null) {
          // Ключ не чистим: задание может ещё идти, перезагрузка страницы подхватит его.
          setError(t('connectionLost'));
          setPhase('error');
          return;
        }
        reconnect = next;
        await pauseUnlessAborted(next.delay, abort.signal);
        if (abort.signal.aborted) return;
      }
    } finally {
      if (connectedJobRef.current === id) connectedJobRef.current = null;
      if (streamAbortRef.current === abort) streamAbortRef.current = null;
    }
  }

  /**
   * Новая генерация. В «Стандарте» и «Максимуме» сначала план: карточку можно поправить
   * за секунды, прежде чем уйдут минуты генерации. В «Быстро» — сразу в работу.
   */
  async function generate(text: string) {
    setInputMode('text');
    // Поле могло остаться заполненным после «Открыть как текст»: запрос уже ушёл,
    // и старая копия в композере выглядела бы как неотправленный черновик.
    setPrompt('');
    say('user', text);
    if (planFirst && mode !== 'fast') { await requestPlan(text); return; }
    await startGeneration(text);
  }

  async function requestPlan(text: string) {
    setPlanning(true); setError(null); setDraftSpec(null); setPlanPrompt(text);
    const ticket = ++planTicket.current;
    const res = await callApi<{ spec: PlanSpec }>('/api/plan', 'POST', {
      prompt: text, imageDataUrl: image ?? undefined, level: level === 'auto' ? undefined : level,
    });
    if (ticket !== planTicket.current) return;
    setPlanning(false);
    if (!res.ok) {
      // План — удобство: без него генерация всё равно возможна.
      say('bot', t('planFailed', { error: f.message(res.error) }));
      await startGeneration(text);
      return;
    }
    setDraftSpec(res.data.spec);
  }

  async function correctPlan(correction: string) {
    if (!draftSpec || replanning) return;
    say('user', correction);
    setReplanning(true);
    const ticket = ++planTicket.current;
    const res = await callApi<{ spec: PlanSpec }>('/api/plan', 'POST', { spec: draftSpec, correction });
    // Пока ждали, карточку могли закрыть («Отмена», «Новая») — поздний ответ её не воскрешает.
    if (ticket !== planTicket.current) return;
    setReplanning(false);
    if (res.ok) setDraftSpec(res.data.spec);
    else setError(res.error);
  }

  async function approvePlan() {
    if (!draftSpec) return;
    const spec = draftSpec;
    setDraftSpec(null);
    await startGeneration(planPrompt, spec);
  }

  async function startGeneration(text: string, spec?: PlanSpec) {
    setJobKind('generate');
    setPhase('generating'); setEvents([]); setError(null); setHtml(null); setCancelling(false);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text, imageDataUrl: image ?? undefined, mode, spec,
          level: level === 'auto' ? undefined : level,
        }),
      });
      if (isUnauthorized(res)) { loginWithReturnTo('/'); return; }
      if (!res.ok) {
        let message = t('serverError', { status: res.status });
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
      await connectToJob(newJobId, 'generate');
    } catch (err) {
      setError(t('networkError', { error: err instanceof Error ? err.message : String(err) }));
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

  // Доработка — такое же задание, как генерация: тот же поток, та же отмена,
  // то же восстановление после перезагрузки страницы.
  async function refine(instruction: string, clarified = false) {
    if (!simId) return;
    const pointed = pick;
    setPick(null);
    say('user', pointed ? `${instruction}\n📍 ${pointed.target}` : instruction);
    setJobKind('refine');
    setPhase('generating'); setError(null); setEvents([]); setCancelling(false);
    try {
      const res = await fetch(`/api/simulations/${simId}/refine`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, clarified, pick: pointed ?? undefined }),
      });
      if (isUnauthorized(res)) { loginWithReturnTo('/'); return; }
      const body = await res.json().catch(() => ({}));
      // Просьбу поняли неоднозначно: задание не создано, ждём выбора варианта.
      if (res.ok && body.clarify) {
        setPhase('ready');
        say('bot', String(body.clarify.question),
          { options: body.clarify.options as string[], askedFor: instruction });
        return;
      }
      if (!res.ok) {
        setError(body.error ?? t('serverError', { status: res.status }));
        setPhase('error');
        return;
      }
      localStorage.setItem(ACTIVE_JOB_KEY, body.jobId);
      setJobId(body.jobId);
      await connectToJob(body.jobId, 'refine');
    } catch (err) {
      setError(t('networkError', { error: err instanceof Error ? err.message : String(err) }));
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
    if (!text || phase === 'generating' || planning) return;
    // Пока открыта карточка плана, текст в поле — поправка к плану, а не новый запрос.
    if (draftSpec) { setPrompt(''); correctPlan(text); return; }
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
    planTicket.current++;
    setDraftSpec(null); setPick(null); setPicking(false); setPlanning(false); setReplanning(false);
    setPhase('idle'); setSimId(null); setHtml(null); setEvents([]); setError(null);
    setHistory([]); setMessages([]); setImage(null); clearActiveJob();
    setActiveTab('create');
    setInputMode(prefs.startWithConstructor === false ? 'text' : 'stand');
  }

  const hasSim = simId !== null;
  // Пока идёт план или его поправка, «Новая», композер и отправка заблокированы: иначе ответ
  // модели вернул бы карточку уже брошенного запроса или две поправки гонялись бы друг с другом.
  const busy = phase === 'generating' || planning || replanning;
  const outOfQuota = !hasSim && quota?.remaining === 0;
  const empty = messages.length === 0 && events.length === 0 && !hasSim;
  const voiceOn = voice.supported && prefs.voiceInput !== false;

  // Пока ничего не начато — на экране стенд во всю ширину. Как только пошла
  // генерация или открыта симуляция, возвращается обычная мастерская.
  if (!hasSim && phase === 'idle' && inputMode === 'stand' && !draftSpec && !planning) {
    return (
      <>
      <button type="button" className="sessions-fab" onClick={() => setSessionsOpen(true)}><IconHistory size={17} />{t('history')}</button>
      <SessionsPanel open={sessionsOpen} onClose={() => setSessionsOpen(false)} onOpen={openSession} onNew={startNew} activeSimulationId={simId} />
      <ConstructorStand
        disabled={busy || outOfQuota}
        defaultLevel={prefs.level}
        defaultStyle={prefs.style}
        quotaNote={(
          <>
            {returnTo && <span className="quota-line">{t('forLessonNote')}</span>}
            {quota && quota.limit !== null && (
              outOfQuota
                ? <span className="quota-line quota-exhausted">{quotaMessage && f.message(quotaMessage)}</span>
                : <span className="quota-line">{t('quotaLeft', { remaining: quota.remaining, limit: quota.limit })}</span>
            )}
          </>
        )}
        onCreate={(text) => { if (!busy) generate(text); }}
        onWriteText={(text) => { setPrompt(text); setInputMode('text'); }}
      />
      </>
    );
  }

  return (
    <div className={`workbench tab-${activeTab}`}>
      <SessionsPanel open={sessionsOpen} onClose={() => setSessionsOpen(false)} onOpen={openSession} onNew={startNew} activeSimulationId={simId} />
      <div className="mobile-tabs" role="tablist" aria-label={t('sectionsAria')}>
        <button role="tab" aria-selected={activeTab === 'create'}
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}>{t('tabDialog')}</button>
        <button role="tab" aria-selected={activeTab === 'preview'}
          className={activeTab === 'preview' ? 'active' : ''}
          onClick={() => setActiveTab('preview')}>{t('tabSim')}</button>
      </div>

      <aside className="chat-pane">
        <div className="thread">
          <div className="thread-top">
            <button type="button" className="btn btn-sm btn-ghost thread-history" disabled={busy} onClick={() => setSessionsOpen(true)}>
              <IconHistory size={16} />{t('history')}
            </button>
            <span className="spacer" />
            {(hasSim || messages.length > 0) && !busy && (
              <button className="btn btn-sm btn-secondary" onClick={startNew}>
                <IconPlus size={16} />{t('newShort')}
              </button>
            )}
          </div>

          {returnTo && (
            <div className="queue-banner">
              {t('lessonBanner')}
            </div>
          )}

          {empty && (
            <div className="hero">
              <h2>{t('heroTitle')}</h2>
              <p>{t('heroText')}</p>
              <div className="hero-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => setPrompt(t(s))}>
                    <IconSpark size={17} />{t(s)}
                  </button>
                ))}
                <button className="suggestion" onClick={openStand}>
                  <IconWand size={17} />{t('heroStand')}
                </button>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'msg msg-user' : 'msg msg-bot'}>
              <Bubble text={m.text} />
              {(m.changed?.length || m.skipped?.length) ? (
                <div className="msg-report">
                  {m.changed && m.changed.length > 0 && (
                    <ul className="msg-changed">
                      {m.changed.map((c, k) => <li key={k}><IconCheck size={13} />{c}</li>)}
                    </ul>
                  )}
                  {m.skipped && m.skipped.length > 0 && (
                    <ul className="msg-skipped">
                      {m.skipped.map((c, k) => <li key={k}><IconMinus size={13} />{c}</li>)}
                    </ul>
                  )}
                </div>
              ) : null}
              {m.undo && history.length > 0 && (
                <div className="msg-choices" role="group" aria-label={t('rollbackAria')}>
                  <button type="button" className="msg-choice" disabled={busy}
                    onClick={() => { setMessages((prev) => prev.map((x, k) => (k === i ? { ...x, undo: false } : x))); restoreVersion(history[0]); }}>
                    <IconUndo size={14} />{t('restorePrev')}
                  </button>
                  <button type="button" className="msg-choice" disabled={busy} onClick={() => setCompareOpen(true)}>
                    <IconSwap size={14} />{t('compare')}
                  </button>
                </div>
              )}
              {m.options && m.options.length > 0 && (
                <div className="msg-choices" role="group" aria-label={t('answerOptions')}>
                  {m.options.map((o) => (
                    <button key={o} type="button" className="msg-choice" disabled={busy}
                      onClick={() => chooseOption(i, o, m.askedFor)}>{o}</button>
                  ))}
                </div>
              )}
              {m.next && m.next.length > 0 && (
                <div className="msg-choices next" role="group" aria-label={t('nextAria')}>
                  <span className="msg-choices-label">{t('nextLabel')}</span>
                  {m.next.map((o) => (
                    <button key={o} type="button" className="msg-choice" disabled={busy}
                      onClick={() => chooseOption(i, o)}>{o}</button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {planning && (
            <div className="msg msg-bot"><div className="bubble plan-thinking">{t('planning')}</div></div>
          )}
          {draftSpec && (
            <PlanEditor spec={draftSpec} busy={phase === 'generating'} replanning={replanning}
              onChange={setDraftSpec} onGenerate={approvePlan} onCorrect={correctPlan}
              onCancel={() => { planTicket.current++; setReplanning(false); setDraftSpec(null); setPrompt(planPrompt); }} />
          )}
          {busy && jobKind === 'refine' && (
            <div className="msg msg-bot"><div className="bubble">{t('refining')}</div></div>
          )}
          <ProgressView events={events} kind={jobKind} />
          {error && <div className="error-box">{f.message(error)}</div>}
          {busy && jobId && (
            <button className="btn btn-sm btn-danger" style={{ alignSelf: 'flex-start' }}
              disabled={cancelling} onClick={cancelJob}>
              <IconClose size={15} />{cancelling ? t('cancelling') : t('cancelJob')}
            </button>
          )}
          <div ref={threadEndRef} />
        </div>

        <div className="composer">
          <div className="composer-wrap">
            {showSettings && (
              <div className="popover" role="dialog" aria-label={t('genSettings')}>
                <div className="field">
                  <span>{t('quality')}</span>
                  <div className="segmented">
                    {QUALITY_OPTIONS.map(([v, label, hint]) => (
                      <button key={v} type="button" title={t(hint)} aria-pressed={mode === v}
                        className={mode === v ? 'segmented-item active' : 'segmented-item'}
                        disabled={busy} onClick={() => setMode(v)}>{t(label)}</button>
                    ))}
                  </div>
                  <span className="muted">{t(QUALITY_OPTIONS.find(([v]) => v === mode)?.[2] ?? 'qStandardHint')}</span>
                </div>
                <div className="field">
                  <span>{t('simLevel')}</span>
                  <div className="segmented segmented-wrap">
                    <button type="button" aria-pressed={level === 'auto'} disabled={busy}
                      className={level === 'auto' ? 'segmented-item active' : 'segmented-item'}
                      onClick={() => setLevel('auto')}>{t('auto')}</button>
                    {LEVEL_OPTIONS.map(([v, label, hint]) => (
                      <button key={v} type="button" title={t(hint)} aria-pressed={level === v} disabled={busy}
                        className={level === v ? 'segmented-item active' : 'segmented-item'}
                        onClick={() => setLevel(v)}>{t(label)}</button>
                    ))}
                  </div>
                  <span className="muted">
                    {level === 'auto' ? t('autoHint') : t(LEVEL_OPTIONS.find(([v]) => v === level)?.[2] ?? 'levelDemoHint')}
                  </span>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={planFirst} disabled={busy || mode === 'fast'}
                    onChange={(e) => setPlanFirst(e.target.checked)} />
                  <span>{mode === 'fast' ? t('planFirstFast') : t('planFirst')}</span>
                </label>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowSettings(false)}>
                  {tc('done')}
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
                placeholder={draftSpec ? t('phPlan') : pick ? t('phPick', { target: pick.target }) : hasSim ? t('phChange') : t('phDescribe')}
                rows={1}
                aria-label={hasSim ? t('ariaChange') : t('ariaDescribe')}
              />
              <div className="composer-tools">
                {!hasSim && (
                  <>
                    <button className="icon-btn" title={t('buildInStand')}
                      aria-label={t('buildInStand')} disabled={busy}
                      onClick={openStand}>
                      <IconWand size={19} />
                    </button>
                    <button className={image ? 'icon-btn on' : 'icon-btn'} title={t('sampleImage')}
                      aria-label={t('sampleImage')} disabled={busy}
                      onClick={() => fileRef.current?.click()}>
                      <IconImage size={19} />
                    </button>
                    <button className={showSettings ? 'icon-btn on' : 'icon-btn'} title={t('quality')}
                      aria-label={t('genSettings')} disabled={busy}
                      onClick={() => setShowSettings((v) => !v)}>
                      <IconSliders size={19} />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                  </>
                )}
                <span className="spacer" />
                {voiceOn && (
                  <button className={voice.listening ? 'icon-btn rec' : 'icon-btn'}
                    title={voice.listening ? t('stopRec') : t('voiceInput')}
                    aria-label={t('voiceInput')} aria-pressed={voice.listening}
                    onClick={voice.toggle} disabled={busy}>
                    <IconMic size={19} />
                  </button>
                )}
                <button className="composer-send" onClick={submit}
                  disabled={busy || !prompt.trim() || outOfQuota}
                  title={t('send')} aria-label={t('send')}>
                  <IconSend size={19} />
                </button>
              </div>
            </div>
          </div>
          <div className="composer-foot">
            {image && <span className="attach-note"><IconImage size={14} />{t('imageAdded')}</span>}
            {pick && (
              <span className="attach-note pick-note">
                <IconTarget size={14} />{pick.target}
                <button type="button" aria-label={t('removePick')} onClick={() => setPick(null)}><IconClose size={12} /></button>
              </span>
            )}
            {voice.error && <span className="voice-hint">{voice.error}</span>}
            <span className="spacer" />
            {!hasSim && quota && quota.limit !== null && (
              outOfQuota
                ? <span className="quota-line quota-exhausted">{quotaMessage && f.message(quotaMessage)}</span>
                : <span className="quota-line">{t('quotaLeft', { remaining: quota.remaining, limit: quota.limit })}</span>
            )}
          </div>
        </div>
      </aside>

      <section className="preview-pane">
        {busy && (
          <button className="to-process-badge" onClick={() => setActiveTab('create')}>
            {jobKind === 'refine' ? t('badgeRefine') : t('badgeGen')}
          </button>
        )}
        {busy && jobKind === 'generate'
          ? <LiveStage events={events} jobId={jobId} onKeep={keepDraft} keeping={keeping} />
          : <PreviewFrame html={html} frameRef={previewRef} />}
        {picking && <div className="pick-hint">{t('pickHint')}</div>}
        {simId && (
          <div className="preview-actions">
            <a className="btn btn-sm btn-ghost" href={`/present/${simId}`} target="_blank" rel="noopener noreferrer">
              <IconPlay size={16} />{t('present')}
            </a>
            <a className="btn btn-sm btn-ghost" href={`/api/simulations/${simId}/export`}>
              <IconDownload size={16} />{t('export')}
            </a>
            {returnTo && !busy && (
              <button type="button" className="btn btn-sm btn-primary" onClick={insertIntoLesson} disabled={inserting}>
                {inserting ? t('inserting') : t('insert')}
              </button>
            )}
            {!busy && (
              <>
                <button type="button" className={picking ? 'btn btn-sm btn-ghost on' : 'btn btn-sm btn-ghost'}
                  onClick={togglePick} title={t('pickTitle')}>
                  <IconTarget size={16} />{picking ? tc('cancel') : t('pickPlace')}
                </button>
                <button type="button" className={exemplar ? 'btn btn-sm btn-ghost on' : 'btn btn-sm btn-ghost'}
                  onClick={toggleExemplar} aria-pressed={exemplar}
                  title={t('exemplarTitle')}>
                  <IconSpark size={16} />{exemplar ? t('exemplar') : t('makeExemplar')}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setQualityOpen(true)}
                  title={t('checkTitle')}>
                  <IconCheck size={16} />{t('check')}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowConfig(true)}
                  title={t('settingsTitle')}>
                  <IconSliders size={16} />{t('settings')}
                </button>
              </>
            )}
            <span className="spacer" />
            {history.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCompareOpen(true)}>
                <IconSwap size={16} />{t('compare')}
              </button>
            )}
            {history.length > 0 && (
              <details className="history-dropdown">
                <summary><IconHistory size={16} />&nbsp;{t('versions', { n: history.length })}</summary>
                <ul>
                  {history.map((name) => (
                    <li key={name}>
                      <span>{historyLabel(name, locale)}</span>
                      <button disabled={busy} onClick={() => restoreVersion(name)}>{t('restore')}</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {showConfig && simId && (
        <SimSettings simId={simId} onClose={() => setShowConfig(false)}
          onSaved={(next) => { setHtml(next); loadHistory(simId); say('bot', t('settingsSaved')); }} />
      )}
      {qualityOpen && simId && (
        <QualityPanel simId={simId} busy={busy} onClose={() => setQualityOpen(false)}
          onFix={(instruction) => refine(instruction, true)} />
      )}
      {compareOpen && simId && history.length > 0 && (
        <CompareVersions simId={simId} current={html} history={history} busy={busy}
          onRestore={restoreVersion} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  );
}

/**
 * Запрос, собранный стендом, длинный: за прозой идёт структурный блок. Целиком
 * он занимал бы половину ленты, поэтому свёрнут до нескольких строк и
 * разворачивается по клику — видеть отправленное целиком человек вправе.
 */
function Bubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const t = useT(workbench);
  const long = text.length > 220;
  if (!long) return <div className="bubble">{text}</div>;
  return (
    <div className={open ? 'bubble' : 'bubble bubble-clamped'} role="button" tabIndex={0}
      title={open ? t('collapse') : t('showAll')}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}>
      {text}
    </div>
  );
}
