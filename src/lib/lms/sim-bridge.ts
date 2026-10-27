import type { Locale } from '@/i18n/config';
import { parseBridgeReply, type BridgeReply } from './sim-state';

/**
 * Клиентская половина моста: спрашивает у iframe симуляции значения контролов
 * (на запрос отвечает harness, см. src/lib/runtime/harness.ts). Только для браузера.
 */

let nextRequest = 1;

export const BRIDGE_TIMEOUT_MS = 2500;

export function requestSimState(frame: HTMLIFrameElement | null, timeoutMs = BRIDGE_TIMEOUT_MS): Promise<BridgeReply> {
  return new Promise((resolve) => {
    const target = frame?.contentWindow;
    if (!target) return resolve({ ok: false, hasExpose: false, reason: 'no-frame', controls: [] });
    const id = nextRequest++;
    const done = (reply: BridgeReply) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(reply);
    };
    function onMessage(e: MessageEvent) {
      if (e.source !== target || e.data?.type !== 'sim-state' || e.data.id !== id) return;
      done(parseBridgeReply(e.data));
    }
    const timer = setTimeout(() => done({ ok: false, hasExpose: false, reason: 'timeout', controls: [] }), timeoutMs);
    window.addEventListener('message', onMessage);
    target.postMessage({ type: 'sim-state-request', id }, '*');
  });
}

const BRIDGE_PROBLEM: Record<Locale, { busy: string; mute: string }> = {
  ru: {
    busy: 'Симуляция ещё загружается или не отвечает. Подождите пару секунд и попробуйте снова.',
    mute: 'Эта симуляция не сообщает значения своих параметров.',
  },
  kk: {
    busy: 'Симуляция әлі жүктелуде немесе жауап бермей тұр. Бірнеше секунд күтіп, қайталап көріңіз.',
    mute: 'Бұл симуляция өз параметрлерінің мәндерін хабарламайды.',
  },
  en: {
    busy: 'The simulation is still loading or not responding. Wait a couple of seconds and try again.',
    mute: 'This simulation does not report its parameter values.',
  },
};

/** Почему состояние не снялось — словами для человека. */
export function bridgeProblem(reply: BridgeReply, locale: Locale = 'ru'): string {
  const t = BRIDGE_PROBLEM[locale] ?? BRIDGE_PROBLEM.ru;
  return reply.reason === 'no-frame' || reply.reason === 'timeout' ? t.busy : t.mute;
}

function ask<T>(frame: HTMLIFrameElement | null, message: Record<string, unknown>, replyType: string, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const target = frame?.contentWindow;
    if (!target) return resolve(null);
    const id = nextRequest++;
    const done = (v: T | null) => { clearTimeout(timer); window.removeEventListener('message', onMessage); resolve(v); };
    function onMessage(e: MessageEvent) {
      if (e.source !== target || e.data?.type !== replyType || e.data.id !== id) return;
      done(e.data as T);
    }
    const timer = setTimeout(() => done(null), timeoutMs);
    window.addEventListener('message', onMessage);
    target.postMessage({ ...message, id }, '*');
  });
}

/**
 * Стартовые значения и закрытые ползунки. Кит симуляции поднимается не сразу,
 * поэтому пробуем несколько раз, пока он не ответит, что контролы на месте.
 */
export async function applySimPreset(
  frame: HTMLIFrameElement | null, controls: Record<string, number>, locked: string[],
): Promise<boolean> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const reply = await ask<{ ok: boolean }>(frame, { type: 'sim-apply', controls, locked }, 'sim-applied', 500);
    if (reply?.ok) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

export interface SimReadout { label: string; text: string; value: number | null }

/** «12,5 м/с» → 12.5; нечисловое показание — null. */
export function readoutNumber(text: string): number | null {
  const m = /-?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/i.exec(text.replace(/\s(?=\d{3}\b)/g, '').replace('−', '-'));
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Всё, что можно «взять из тренажёра»: показания приборов и текущие значения ползунков. */
export async function requestSimValues(frame: HTMLIFrameElement | null, timeoutMs = BRIDGE_TIMEOUT_MS): Promise<SimReadout[]> {
  const [readouts, state] = await Promise.all([
    ask<{ readouts: { label: string; text: string }[] }>(frame, { type: 'sim-readouts-request' }, 'sim-readouts', timeoutMs),
    requestSimState(frame, timeoutMs),
  ]);
  const out: SimReadout[] = (readouts?.readouts ?? []).map((r) => ({ label: r.label, text: r.text, value: readoutNumber(r.text) }));
  for (const c of state.controls) out.push({ label: c.label, text: String(c.value), value: c.value });
  return out.filter((r) => r.value !== null);
}

/**
 * Что сейчас на экране тренажёров шага — строками «подпись: значение» для наставника,
 * плюс текстовое состояние (фаза, отклик задания). Тренажёр, который не ответил быстро,
 * просто пропускаем: вопрос важнее контекста.
 */
export async function describeSimScreens(frames: HTMLIFrameElement[], timeoutMs = 900): Promise<string> {
  const screens = await Promise.all(frames.slice(0, 3).map(async (f) => {
    const [r, state] = await Promise.all([
      ask<{ readouts: { label: string; text: string }[]; notes?: string[] }>(f, { type: 'sim-readouts-request' }, 'sim-readouts', timeoutMs),
      requestSimState(f, timeoutMs),
    ]);
    const lines = [
      ...(r?.notes ?? []).map((n) => `Сейчас: ${n}`),
      ...state.controls.map((c) => `${c.label}: ${c.value}`),
      ...(r?.readouts ?? []).slice(0, 24).map((x) => `${x.label}: ${x.text}`),
    ];
    return lines.join('\n');
  }));
  const shown = screens.filter(Boolean);
  const text = shown.length > 1 ? shown.map((s, i) => `Тренажёр ${i + 1}:\n${s}`).join('\n\n') : shown[0] ?? '';
  return text.slice(0, 1500);
}

/** Подсветить ползунок или прибор по подписи во всех тренажёрах шага; true — нашёлся хотя бы в одном. */
export async function highlightInSims(frames: HTMLIFrameElement[], target: string, note: string): Promise<boolean> {
  const replies = await Promise.all(frames.map((f) =>
    ask<{ ok: boolean }>(f, { type: 'sim-highlight', target, note }, 'sim-highlighted', 900)));
  return replies.some((r) => r?.ok);
}

/**
 * «Покажи и спроси»: следующий клик по тренажёру не уходит в него, а возвращает, что там лежит
 * («контрол «Масса» на панели параметров», «сцена»). null — студент передумал (Esc) или тренажёр молчит.
 */
export function pickInSim(frame: HTMLIFrameElement | null, timeoutMs = 60_000): Promise<string | null> {
  return new Promise((resolve) => {
    const target = frame?.contentWindow;
    if (!target) return resolve(null);
    const done = (v: string | null) => { clearTimeout(timer); window.removeEventListener('message', onMessage); resolve(v); };
    function onMessage(e: MessageEvent) {
      if (e.source !== target || e.data?.type !== 'smh-pick') return;
      done(e.data.cancelled ? null : String(e.data.target || ''));
    }
    const timer = setTimeout(() => { target.postMessage({ type: 'smh-pick-stop' }, '*'); done(null); }, timeoutMs);
    window.addEventListener('message', onMessage);
    target.postMessage({ type: 'smh-pick-start' }, '*');
  });
}
