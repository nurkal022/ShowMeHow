/**
 * Telegram-бот отдельным процессом: `npm run bot`. Нужен, если веб запущен с
 * TELEGRAM_BOT_EMBEDDED=0 — иначе бот уже работает внутри веб-процесса.
 */
import { startPoller } from '../src/lib/telegram/poller';
import { botToken } from '../src/lib/telegram/api';
import { closeDb } from '../src/lib/db/client';

if (!botToken()) {
  console.error('TELEGRAM_BOT_TOKEN не задан');
  process.exit(1);
}
const poller = startPoller();
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await poller.stop();
    await closeDb();
    process.exit(0);
  });
}
