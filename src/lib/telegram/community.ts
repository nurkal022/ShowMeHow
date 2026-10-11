import { botToken, tg, trySend } from './api';
import { getGroup, kickFromGroup } from './group';
import { getAccountByUser, getState, issueSiteLink, setState, unlinkUser } from './store';

let cachedUsername: string | null = null;

/** Username бота для ссылок t.me с сайта. null — бот не настроен. */
export async function botUsername(): Promise<string | null> {
  if (!botToken()) return null;
  // Поллер записывает username при старте — страницы не ходят за ним в Telegram.
  cachedUsername ??= await getState<string>('bot');
  if (!cachedUsername) {
    cachedUsername = (await tg<{ username: string }>('getMe')).username;
    await setState('bot', cachedUsername);
  }
  return cachedUsername;
}

/** Ссылка «Подключить Telegram»: бот получит /start link_<токен> и привяжет аккаунт. */
export async function connectUrl(userId: string): Promise<string | null> {
  const bot = await botUsername();
  if (!bot) return null;
  return `https://t.me/${bot}?start=link_${await issueSiteLink(userId)}`;
}

/** Отвязка Telegram: человек выходит и из группы — вход в неё только с аккаунтом. */
export async function revokeTelegram(userId: string, reason: 'self' | 'admin'): Promise<boolean> {
  const tgUserId = await unlinkUser(userId);
  if (tgUserId === null) return false;
  if (botToken()) {
    await kickFromGroup(tgUserId);
    await trySend(tgUserId, reason === 'self'
      ? 'Telegram отвязан от аккаунта Tesseract. Вернуться можно в любой момент: /start.'
      : 'Администратор отключил доступ к сообществу Tesseract.');
  }
  return true;
}

/** Блокировка аккаунта на платформе убирает человека и из группы. Ошибки Telegram не мешают блокировке. */
export function onUserDisabled(userId: string): void {
  if (!botToken()) return;
  (async () => {
    const acc = await getAccountByUser(userId);
    if (acc && (await getGroup())) await kickFromGroup(acc.tgUserId);
  })().catch((e) => console.warn('[telegram] kick:', (e as Error).message));
}
