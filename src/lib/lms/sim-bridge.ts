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

/** Почему состояние не снялось — словами для человека. */
export function bridgeProblem(reply: BridgeReply): string {
  if (reply.reason === 'no-frame' || reply.reason === 'timeout') {
    return 'Симуляция ещё загружается или не отвечает. Подождите пару секунд и попробуйте снова.';
  }
  return 'Эта симуляция не сообщает значения своих параметров.';
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
export async function requestSimValues(frame: HTMLIFrameElement | null): Promise<SimReadout[]> {
  const [readouts, state] = await Promise.all([
    ask<{ readouts: { label: string; text: string }[] }>(frame, { type: 'sim-readouts-request' }, 'sim-readouts', BRIDGE_TIMEOUT_MS),
    requestSimState(frame),
  ]);
  const out: SimReadout[] = (readouts?.readouts ?? []).map((r) => ({ label: r.label, text: r.text, value: readoutNumber(r.text) }));
  for (const c of state.controls) out.push({ label: c.label, text: String(c.value), value: c.value });
  return out.filter((r) => r.value !== null);
}
