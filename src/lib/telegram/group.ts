import { tg, TelegramError } from './api';
import { getState, setState } from './store';

/** Темы форума. Ключ стабилен — по нему хранится id темы; название можно менять. */
export interface TopicDef { key: string; name: string; color: number; closed?: boolean }

// Telegram принимает только эти шесть цветов значка темы.
const BLUE = 0x6FB9F0, YELLOW = 0xFFD67E, VIOLET = 0xCB86DB, GREEN = 0x8EEE98, PINK = 0xFF93B2, RED = 0xFB6F5F;

export const TOPICS: TopicDef[] = [
  { key: 'announce', name: '📢 Анонсы', color: RED, closed: true },
  { key: 'rules', name: '📜 Правила', color: YELLOW, closed: true },
  { key: 'biology', name: '🧬 Биология', color: GREEN },
  { key: 'chemistry', name: '⚗️ Химия', color: VIOLET },
  { key: 'physics', name: '⚛️ Физика', color: BLUE },
  { key: 'math', name: '➗ Математика', color: PINK },
  { key: 'cs', name: '💻 Информатика', color: BLUE },
  { key: 'geography', name: '🌍 География', color: GREEN },
  { key: 'trainers', name: '🛠 Тренажёры', color: YELLOW },
  { key: 'ideas', name: '💡 Идеи', color: VIOLET },
  { key: 'help', name: '❓ Помощь', color: RED },
];

const RULES = [
  '<b>Правила сообщества Tesseract</b>',
  '',
  '1. Пишите в тему своего предмета: биология — в «Биологию», общие вопросы — в «Помощь».',
  '2. Делитесь тренажёрами, идеями уроков и опытом. Ссылка на свой тренажёр — в «Тренажёры» или через /share в личке бота.',
  '3. Уважайте друг друга: без оскорблений, политики и рекламы.',
  '4. Не публикуйте личные данные студентов.',
  '5. Доступ к платформе и вход — только через бота, в личных сообщениях.',
  '',
  '<b>Қауымдастық ережелері:</b> өз пәніңіздің тақырыбында жазыңыз, бір-біріңізді құрметтеңіз, жарнамасыз. Платформаға кіру — бот арқылы.',
  '<b>Rules:</b> post in your subject topic, be respectful, no ads. Platform access is via the bot.',
].join('\n');

export interface GroupState {
  chatId: number; title?: string; inviteLink?: string; topics: Record<string, number>;
  /** Приветственный пост с кнопкой бота уже опубликован и закреплён. */
  welcomed?: boolean;
}

export async function getGroup(): Promise<GroupState | null> {
  const saved = await getState<GroupState>('group');
  const envId = Number(process.env.TELEGRAM_GROUP_ID);
  if (Number.isFinite(envId) && envId !== 0) {
    return saved && saved.chatId === envId ? saved : { chatId: envId, topics: saved?.topics ?? {} };
  }
  return saved;
}

/** Жива ли тема: правка с тем же названием отвечает TOPIC_NOT_MODIFIED, если тема на месте. */
async function topicAlive(chatId: number, threadId: number, name: string): Promise<boolean> {
  try {
    await tg('editForumTopic', { chat_id: chatId, message_thread_id: threadId, name });
    return true;
  } catch (e) {
    return e instanceof TelegramError && /NOT_MODIFIED/i.test(e.message);
  }
}

/**
 * Настраивает группу: запоминает её, создаёт недостающие темы, закрывает служебные
 * (в закрытой теме пишут только админы), публикует правила и делает ссылку-заявку.
 * Повторный запуск безопасен — создаётся только то, чего нет.
 */
export async function setupGroup(chatId: number, title?: string): Promise<{ created: string[]; group: GroupState }> {
  const prev = await getState<GroupState>('group');
  const group: GroupState = prev && prev.chatId === chatId ? prev : { chatId, topics: {} };
  group.title = title ?? group.title;
  const created: string[] = [];
  for (const t of TOPICS) {
    const existing = group.topics[t.key];
    if (existing && (await topicAlive(chatId, existing, t.name))) continue;
    const topic = await tg<{ message_thread_id: number }>('createForumTopic', { chat_id: chatId, name: t.name, icon_color: t.color });
    group.topics[t.key] = topic.message_thread_id;
    created.push(t.name);
    if (t.key === 'rules') {
      const msg = await tg<{ message_id: number }>('sendMessage', {
        chat_id: chatId, message_thread_id: topic.message_thread_id, text: RULES, parse_mode: 'HTML',
      });
      await tg('pinChatMessage', { chat_id: chatId, message_id: msg.message_id, disable_notification: true }).catch(() => {});
    }
    if (t.closed) await tg('closeForumTopic', { chat_id: chatId, message_thread_id: topic.message_thread_id }).catch(() => {});
    await setState('group', group);
  }
  // Ссылку могли отозвать вручную в настройках группы — проверяем, что она жива.
  if (group.inviteLink) {
    const alive = await tg('editChatInviteLink', { chat_id: chatId, invite_link: group.inviteLink, name: 'Tesseract bot', creates_join_request: true })
      .then(() => true, (e) => !(e instanceof TelegramError && /INVITE|not found|revoked/i.test(e.message)));
    if (!alive) group.inviteLink = undefined;
  }
  if (!group.inviteLink) {
    const link = await tg<{ invite_link: string }>('createChatInviteLink', {
      chat_id: chatId, name: 'Tesseract bot', creates_join_request: true,
    });
    group.inviteLink = link.invite_link;
  }
  await applyGroupPolicy(chatId);
  if (!group.welcomed && group.topics.announce) {
    await postWelcome(chatId, group.topics.announce);
    group.welcomed = true;
  }
  await setState('group', group);
  return { created, group };
}

async function botUsername(): Promise<string> {
  return (await tg<{ username: string }>('getMe')).username;
}

/**
 * Участник пишет и реагирует, но не меняет группу, темы и закрепы и не создаёт
 * своих приглашений: вход в сообщество идёт только через бота.
 */
async function applyGroupPolicy(chatId: number): Promise<void> {
  await tg('setChatPermissions', {
    chat_id: chatId,
    use_independent_chat_permissions: true,
    permissions: {
      can_send_messages: true, can_send_audios: true, can_send_documents: true, can_send_photos: true,
      can_send_videos: true, can_send_video_notes: true, can_send_voice_notes: true, can_send_polls: true,
      can_send_other_messages: true, can_add_web_page_previews: true,
      can_change_info: false, can_invite_users: false, can_pin_messages: false, can_manage_topics: false,
    },
  });
  const description = `Сообщество преподавателей, студентов и исследователей Tesseract: обсуждения по предметам, обмен тренажёрами и идеями. `
    + `Вступление и доступ к платформе — через @${await botUsername()}`;
  await tg('setChatDescription', { chat_id: chatId, description }).catch(() => {}); // «not modified» — не ошибка
}

async function postWelcome(chatId: number, threadId: number): Promise<void> {
  const bot = await botUsername();
  const text = [
    '👋 <b>Добро пожаловать в сообщество Tesseract!</b>',
    '',
    'Здесь преподаватели, студенты и исследователи обсуждают предметы, делятся тренажёрами и идеями уроков.',
    'Каждая тема — свой предмет. Правила — в теме «📜 Правила».',
    '',
    `Доступ к платформе, вход без пароля и публикация тренажёров — через бота @${bot}.`,
  ].join('\n');
  const msg = await tg<{ message_id: number }>('sendMessage', {
    chat_id: chatId, message_thread_id: threadId, text, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🚀 Получить доступ', url: `https://t.me/${bot}?start=group` }]] },
  });
  await tg('pinChatMessage', { chat_id: chatId, message_id: msg.message_id, disable_notification: true }).catch(() => {});
}

/** Ссылка на тему: t.me/c/<id группы без -100>/<id темы>. Открывается у участников группы. */
export function topicUrl(group: GroupState, key: string): string | null {
  const thread = group.topics[key];
  if (!thread) return null;
  return `https://t.me/c/${String(group.chatId).replace(/^-100/, '')}/${thread}`;
}

/** Одобряет заявку, если она висит. Нет заявки — Telegram ответит ошибкой, это нормально. */
export async function approveJoin(tgUserId: number): Promise<boolean> {
  const group = await getGroup();
  if (!group) return false;
  try {
    await tg('approveChatJoinRequest', { chat_id: group.chatId, user_id: tgUserId });
    return true;
  } catch {
    return false;
  }
}

export async function postToTopic(key: string, text: string): Promise<boolean> {
  const group = await getGroup();
  const thread = group?.topics[key];
  if (!group || !thread) return false;
  await tg('sendMessage', {
    chat_id: group.chatId, message_thread_id: thread, text, parse_mode: 'HTML',
    link_preview_options: { is_disabled: false },
  });
  return true;
}

/** Убирает человека из группы (бан и сразу разбан — можно будет вернуться по новой заявке). */
export async function kickFromGroup(tgUserId: number): Promise<void> {
  const group = await getGroup();
  if (!group) return;
  // Не в группе — делать нечего. Уже забанен модератором — не трогаем: разбан ниже снял бы этот бан.
  const status = await tg<{ status: string }>('getChatMember', { chat_id: group.chatId, user_id: tgUserId })
    .then((m) => m.status, () => null);
  if (status === 'left' || status === 'kicked' || status === 'creator' || status === 'administrator') return;
  await tg('banChatMember', { chat_id: group.chatId, user_id: tgUserId }).catch(() => {});
  await tg('unbanChatMember', { chat_id: group.chatId, user_id: tgUserId, only_if_banned: true }).catch(() => {});
}
