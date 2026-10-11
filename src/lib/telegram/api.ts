/**
 * Тонкий клиент Bot API на fetch: нам нужен десяток методов, библиотека ради них
 * не окупается. Типы описывают только поля, которые бот действительно читает.
 */

export interface TgUser { id: number; is_bot: boolean; first_name: string; username?: string; language_code?: string }
export interface TgChat { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string; is_forum?: boolean }
export interface TgMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  new_chat_members?: TgUser[];
  reply_to_message?: TgMessage;
}
export interface TgCallbackQuery { id: string; from: TgUser; message?: TgMessage; data?: string }
export interface TgChatMemberUpdated {
  chat: TgChat;
  from: TgUser;
  old_chat_member: { status: string; user: TgUser };
  new_chat_member: { status: string; user: TgUser; is_member?: boolean };
}
export interface TgJoinRequest { chat: TgChat; from: TgUser; user_chat_id: number }
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: TgChatMemberUpdated;
  chat_member?: TgChatMemberUpdated;
  chat_join_request?: TgJoinRequest;
}

export type InlineButton = { text: string; url: string } | { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export class TelegramError extends Error {
  constructor(public method: string, public code: number, description: string) {
    super(`Telegram ${method}: ${code} ${description}`);
  }
}

export function botToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const t = env.TELEGRAM_BOT_TOKEN?.trim();
  return t ? t : null;
}

export async function tg<T = unknown>(
  method: string, params: Record<string, unknown> = {}, opts: { signal?: AbortSignal; token?: string } = {},
): Promise<T> {
  const token = opts.token ?? botToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    // Без таймаута повисшее соединение держит запрос страницы минутами. getUpdates
    // сам ждёт до timeout секунд — ему запас сверху.
    signal: opts.signal ?? AbortSignal.timeout(((params.timeout as number | undefined) ?? 0) * 1000 + 15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; error_code?: number; description?: string };
  if (!body.ok) throw new TelegramError(method, body.error_code ?? res.status, body.description ?? res.statusText);
  return body.result as T;
}

/** Отправка, которая не роняет обработчик: человек мог заблокировать бота. */
export async function trySend(chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<boolean> {
  try {
    await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
    return true;
  } catch (e) {
    console.warn('[telegram]', (e as Error).message);
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
