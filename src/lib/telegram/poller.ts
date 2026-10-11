import { botToken, tg, TelegramError, type TgUpdate } from './api';
import { handleUpdate, registerProfile } from './bot';
import { getState, setState } from './store';

// chat_member приходит, только если его перечислить явно (и бот — админ группы).
const ALLOWED = ['message', 'callback_query', 'chat_join_request', 'my_chat_member', 'chat_member'];

export interface Poller { stop(): Promise<void> }

/**
 * Long polling: webhook требует HTTPS, которого на сервере пока нет. offset хранится
 * в базе, чтобы после рестарта не обработать старые апдейты повторно. Telegram отдаёт
 * апдейты только одному getUpdates на токен — второй процесс получит 409.
 */
export function startPoller(): Poller {
  const ctrl = new AbortController();
  let running = true;

  const loop = (async () => {
    await registerProfile().catch((e) => console.warn('[telegram] профиль бота:', (e as Error).message));
    const me = await tg<{ username: string }>('getMe').catch(() => null);
    if (me) await setState('bot', me.username).catch(() => {});
    console.log(`[telegram] бот @${me?.username ?? '?'} запущен`);
    // База может быть ещё не готова (рестарт сервера) — ждём, а не умираем молча.
    let offset = 0;
    for (;;) {
      if (!running) return;
      try { offset = (await getState<number>('offset')) ?? 0; break; } catch (e) {
        console.warn('[telegram] база недоступна, повтор через 10 с:', (e as Error).message);
        await new Promise((r) => setTimeout(r, 10_000));
      }
    }
    while (running) {
      try {
        // Остановка или повисшее соединение. AbortSignal.any нет в Node 18 на сервере — собираем вручную.
        const req = new AbortController();
        const stopReq = () => req.abort();
        ctrl.signal.addEventListener('abort', stopReq, { once: true });
        const timer = setTimeout(stopReq, 45_000);
        const updates = await tg<TgUpdate[]>('getUpdates', { offset, timeout: 30, allowed_updates: ALLOWED }, { signal: req.signal })
          .finally(() => { clearTimeout(timer); ctrl.signal.removeEventListener('abort', stopReq); });
        for (const u of updates) {
          try {
            await handleUpdate(u);
          } catch (e) {
            console.error('[telegram] update', u.update_id, e);
          }
          offset = u.update_id + 1;
          // Не сохранили offset — не страшно: в памяти он верный, а после рестарта повтор безвреден.
          await setState('offset', offset).catch(() => {});
        }
      } catch (e) {
        if (!running) break;
        const conflict = e instanceof TelegramError && e.code === 409;
        console.warn('[telegram]', conflict ? 'другой процесс уже читает апдейты этого бота' : (e as Error).message);
        await new Promise((r) => setTimeout(r, conflict ? 30_000 : 5_000));
      }
    }
  })();

  return {
    async stop() {
      running = false;
      ctrl.abort();
      await loop.catch(() => {});
    },
  };
}

// next dev может загрузить модуль несколько раз; поллер на процесс нужен один.
const KEY = Symbol.for('tesseract.telegramPoller');

/** Встроенный бот: запускается в веб-процессе, если задан токен и не выключен явно. */
export function startEmbeddedBot(env: NodeJS.ProcessEnv = process.env): Poller | null {
  if (env.NEXT_PHASE === 'phase-production-build') return null;
  if (!botToken(env) || env.TELEGRAM_BOT_EMBEDDED === '0') return null;
  const g = globalThis as unknown as Record<symbol, Poller | undefined>;
  g[KEY] ??= startPoller();
  return g[KEY]!;
}
