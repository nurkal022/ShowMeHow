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
