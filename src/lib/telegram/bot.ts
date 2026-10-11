import { translator } from '@/i18n/core';
import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, LOCALES, type Locale } from '@/i18n/config';
import { findActiveUserById, type AuthUser } from '../auth/users';
import { userLabel } from '../auth/identifier';
import { escapeHtml, tg, trySend, type InlineKeyboard, type TgCallbackQuery, type TgChatMemberUpdated, type TgJoinRequest, type TgMessage, type TgUpdate, type TgUser } from './api';
import { approveJoin, getGroup, kickFromGroup, postToTopic, setupGroup, topicUrl, TOPICS } from './group';
import { botTexts, COMMANDS } from './texts';
import {
  CLAIM_TTL_MS, consumeSiteLink, isPersona, issueClaim, linkAccount, setLang, setPersona, stats, TelegramTakenError,
  touchAccount, userStatus, type TgAccount,
} from './store';
import { claimUrl, loginUrl, siteUrl, canUseUrlButton } from './urls';
import { RateLimiter } from './rate';

function langOf(acc: TgAccount | null, u?: TgUser): Locale {
  if (acc?.lang) return acc.lang;
  const code = u?.language_code?.slice(0, 2);
  return isLocale(code) ? code : DEFAULT_LOCALE;
}

function tt(lang: Locale) {
  return translator(botTexts, lang);
}

/** Живой аккаунт платформы, к которому привязан Telegram, или null. */
async function activeUser(acc: TgAccount): Promise<AuthUser | null> {
  return acc.userId ? findActiveUserById(acc.userId) : null;
}

// ── Лимиты (в памяти процесса: после рестарта обнуляются, и это не страшно) ──
/** Поток сообщений в личке: больше 20 в минуту — отвечаем один раз и молчим. */
const privateFlood = new RateLimiter(20, 60_000);
/** Публикации в группу через /share: 5 в час. */
const SHARE_PER_HOUR = 5;
const shareLimit = new RateLimiter(SHARE_PER_HOUR, 60 * 60_000);
const SHARE_COMMENT_MAX = 500;

/** Кнопка со ссылкой, а для localhost — текст: Telegram не принимает такие адреса в кнопках. */
async function sendLink(chatId: number, intro: string, url: string, buttonText: string): Promise<void> {
  if (canUseUrlButton(url)) {
    await trySend(chatId, intro, { reply_markup: { inline_keyboard: [[{ text: buttonText, url }]] } satisfies InlineKeyboard });
  } else {
    await trySend(chatId, `${intro}\n\n<code>${escapeHtml(url)}</code>`);
  }
}

async function sendGroupInvite(chatId: number, lang: Locale): Promise<void> {
  const t = tt(lang);
  const group = await getGroup();
  if (!group?.inviteLink) { await trySend(chatId, t('noGroup')); return; }
  await trySend(chatId, t('joinGroup'), {
    reply_markup: { inline_keyboard: [[{ text: t('groupBtn'), url: group.inviteLink }]] } satisfies InlineKeyboard,
  });
}

async function askLang(chatId: number): Promise<void> {
  await trySend(chatId, tt(DEFAULT_LOCALE)('hello'), {
    reply_markup: { inline_keyboard: [LOCALES.map((l) => ({ text: LOCALE_NAMES[l], callback_data: `lang:${l}` }))] },
  });
}

/** Роли — по одной в строке: на телефоне три кнопки в ряд обрезают подписи. */
async function askPersona(chatId: number, lang: Locale): Promise<void> {
  const t = tt(lang);
  await trySend(chatId, t('choosePersona'), {
    reply_markup: {
      inline_keyboard: (['teacher', 'student', 'researcher'] as const).map((p) => [{ text: t(p), callback_data: `persona:${p}` }]),
    },
  });
}

async function sendClaim(chatId: number, acc: TgAccount): Promise<void> {
  const t = tt(langOf(acc));
  const token = await issueClaim(acc.tgUserId);
  await sendLink(chatId, t('claimIntro', { minutes: CLAIM_TTL_MS / 60000 }), claimUrl(token), t('openSite'));
}

/**
 * Следующий шаг анкеты для непривязанного. Заблокированному — отказ: иначе он завёл бы
 * через бота новый аккаунт в обход блокировки.
 */
async function continueOnboarding(chatId: number, acc: TgAccount): Promise<void> {
  const lang = langOf(acc);
  if ((await userStatus(acc.userId)) === 'disabled') { await trySend(chatId, tt(lang)('blocked')); return; }
  if (!acc.lang) return askLang(chatId);
  if (!acc.persona) return askPersona(chatId, lang);
  return sendClaim(chatId, acc);
}

/** Привязанному — ссылка входа без пароля, остальным — анкета. Админу вход по ссылке не даём. */
async function sendLogin(chatId: number, acc: TgAccount): Promise<void> {
  const t = tt(langOf(acc));
  const user = await activeUser(acc);
  if (!user) return continueOnboarding(chatId, acc);
  if (user.role === 'admin') { await trySend(chatId, t('loginAdmin')); return; }
  const token = await issueClaim(acc.tgUserId);
  await sendLink(chatId, t('loginIntro', { minutes: CLAIM_TTL_MS / 60000 }), loginUrl(token), t('openSite'));
}

async function isGroupAdmin(chatId: number, userId: number): Promise<boolean> {
  try {
    const m = await tg<{ status: string }>('getChatMember', { chat_id: chatId, user_id: userId });
    return m.status === 'creator' || m.status === 'administrator';
  } catch {
    return false;
  }
}

/** Админы группы меняются редко, а проверка нужна на каждое сообщение — кэш на 5 минут. */
const adminCache = new Map<number, { ids: Set<number>; at: number }>();
/** null — список не получен: тогда лучше никого не трогать, чем удалить сообщение админа. */
async function groupAdminIds(chatId: number): Promise<Set<number> | null> {
  const hit = adminCache.get(chatId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ids;
  try {
    const list = await tg<{ user: TgUser }[]>('getChatAdministrators', { chat_id: chatId });
    const ids = new Set(list.map((m) => m.user.id));
    adminCache.set(chatId, { ids, at: Date.now() });
    return ids;
  } catch {
    return hit?.ids ?? null;
  }
}

export function parseCommand(text: string): { cmd: string; args: string } | null {
  const m = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return m ? { cmd: m[1].toLowerCase(), args: (m[2] ?? '').trim() } : null;
}

async function onPrivate(msg: TgMessage): Promise<void> {
  const from = msg.from!;
  const chatId = msg.chat.id;
  const flood = privateFlood.hit(from.id);
  if (flood === 'over') return;
  const acc = await touchAccount(from);
  const lang = langOf(acc, from);
  const t = tt(lang);
  if (flood === 'limit') { await trySend(chatId, t('slowDown')); return; }
  const c = parseCommand(msg.text ?? '');
  if (!c) {
    // Текст, фото, стикер. Непривязанного возвращаем в анкету (без новой ссылки — она бы погасила прежнюю).
    if (!(await activeUser(acc)) && (!acc.lang || !acc.persona)) return continueOnboarding(chatId, acc);
    await trySend(chatId, t('textHint'));
    return;
  }

  switch (c.cmd) {
    case 'start':
      if (c.args.startsWith('link_')) return linkFromSite(chatId, acc, c.args.slice(5));
      if (await activeUser(acc)) {
        await cmdMe(chatId, acc);
        await sendGroupInvite(chatId, lang);
        return;
      }
      return continueOnboarding(chatId, acc);
    case 'login':
      return sendLogin(chatId, acc);
    case 'lang':
      return askLang(chatId);
    case 'role':
      return askPersona(chatId, lang);
    case 'me':
      return cmdMe(chatId, acc);
    case 'group':
      if (!(await activeUser(acc))) return needAccount(chatId, acc);
      return sendGroupInvite(chatId, lang);
    case 'share':
      return cmdShare(chatId, acc, from, c.args);
    case 'topics':
      return sendTopics(chatId, acc);
    case 'help':
      await trySend(chatId, t('help'));
      return;
    // Команды администратора платформы — в меню не показываются, остальным отвечаем как на неизвестную.
    case 'stats': {
      if ((await activeUser(acc))?.role !== 'admin') break;
      const s = await stats();
      const group = await getGroup();
      await trySend(chatId, `Telegram: ${s.total}, привязано: ${s.linked}\nГруппа: ${group ? escapeHtml(group.title ?? String(group.chatId)) : '—'}`);
      return;
    }
    case 'announce': {
      if ((await activeUser(acc))?.role !== 'admin') break;
      if (!c.args) { await trySend(chatId, '/announce текст анонса'); return; }
      if (c.args.length > 3500) { await trySend(chatId, 'Анонс длиннее 3500 символов — сократите.'); return; }
      const ok = await postToTopic('announce', escapeHtml(c.args)).catch(() => false);
      await trySend(chatId, ok ? 'Опубликовано в «Анонсах».' : 'Не получилось: группа не настроена (/setup) или у бота нет прав.');
      return;
    }
  }
  await trySend(chatId, t('unknown'));
}

/** Для команд, которым нужен аккаунт: заблокированному — «заблокирован», остальным — «сначала /start». */
async function needAccount(chatId: number, acc: TgAccount): Promise<void> {
  const t = tt(langOf(acc));
  const status = await userStatus(acc.userId);
  await trySend(chatId, status === 'disabled' ? t('blocked') : t('joinNeedsAccount'));
}

async function cmdMe(chatId: number, acc: TgAccount): Promise<void> {
  const t = tt(langOf(acc));
  const user = await activeUser(acc);
  if (!user) return needAccount(chatId, acc);
  const persona = acc.persona ? t(acc.persona) : '—';
  await trySend(chatId, t('me', { who: escapeHtml(userLabel(user)), persona }));
}

/** Разбор /share: ссылка только на наш сайт, комментарий ограничен. Экспорт — для тестов. */
export function parseShare(args: string, site: string): { url: string; comment: string } | 'usage' | 'bad-url' {
  const [raw, ...rest] = args.split(/\s+/).filter(Boolean);
  if (!raw) return 'usage';
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return 'bad-url'; }
  if (parsed.origin !== new URL(site).origin) return 'bad-url';
  return { url: parsed.toString(), comment: rest.join(' ').trim() };
}

async function cmdShare(chatId: number, acc: TgAccount, from: TgUser, args: string): Promise<void> {
  const t = tt(langOf(acc));
  const user = await activeUser(acc);
  if (!user) return needAccount(chatId, acc);
  const site = siteUrl();
  const parsed = parseShare(args, site);
  if (parsed === 'usage') { await trySend(chatId, t('shareUsage')); return; }
  if (parsed === 'bad-url') { await trySend(chatId, t('shareBadUrl', { site })); return; }
  if (parsed.comment.length > SHARE_COMMENT_MAX) { await trySend(chatId, t('shareTooLong', { n: SHARE_COMMENT_MAX })); return; }
  const group = await getGroup();
  if (!group) { await trySend(chatId, t('noGroup')); return; }
  const name = escapeHtml(user.displayName || from.first_name);
  // Карточка в теме пишется по-русски: группа общая.
  const card = translator(botTexts, 'ru')('shareCard', {
    name, comment: parsed.comment ? `:\n${escapeHtml(parsed.comment)}` : '', url: escapeHtml(parsed.url),
  });
  pendingShares.set(acc.tgUserId, { card, at: Date.now() });
  const keys = SHARE_TOPICS.filter((k) => group.topics[k]);
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < keys.length; i += 2) {
    rows.push(keys.slice(i, i + 2).map((k) => ({ text: TOPICS.find((x) => x.key === k)!.name, callback_data: `share:${k}` })));
  }
  await trySend(chatId, t('shareWhere'), { reply_markup: { inline_keyboard: rows } });
}

/** Куда можно публиковать тренажёр: темы предметов и общая «Тренажёры». */
const SHARE_TOPICS = ['trainers', 'biology', 'chemistry', 'physics', 'math', 'cs', 'geography', 'ideas'];
/** Карточка ждёт выбора темы 10 минут; хранится в памяти процесса — после рестарта /share заново. */
const pendingShares = new Map<number, { card: string; at: number }>();
const SHARE_TTL_MS = 10 * 60 * 1000;

async function sendTopics(chatId: number, acc: TgAccount): Promise<void> {
  const t = tt(langOf(acc));
  if (!(await activeUser(acc))) return needAccount(chatId, acc);
  const group = await getGroup();
  if (!group) { await trySend(chatId, t('noGroup')); return; }
  const buttons = TOPICS.map((x) => ({ text: x.name, url: topicUrl(group, x.key) })).filter((b): b is { text: string; url: string } => !!b.url);
  const rows: { text: string; url: string }[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  await trySend(chatId, t('topics'), { reply_markup: { inline_keyboard: rows } });
}

/** /start link_<токен>: человек нажал «Подключить Telegram» в профиле на сайте. */
async function linkFromSite(chatId: number, acc: TgAccount, token: string): Promise<void> {
  const t = tt(langOf(acc));
  const userId = await consumeSiteLink(token);
  const user = userId ? await findActiveUserById(userId) : null;
  if (!user) { await trySend(chatId, t('siteLinkExpired')); return; }
  // Этот Telegram уже у другого аккаунта, и тот заблокирован — не даём «перепрыгнуть».
  if (acc.userId && acc.userId !== user.id && (await userStatus(acc.userId)) === 'disabled') {
    await trySend(chatId, t('blocked'));
    return;
  }
  try {
    await linkAccount(acc.tgUserId, user.id);
  } catch (e) {
    if (e instanceof TelegramTakenError) { await trySend(chatId, escapeHtml(e.message)); return; }
    throw e;
  }
  await notifyLinked({ ...acc, userId: user.id }, userLabel(user), 'linkedSite');
}

let setupRunning = false;

async function onGroup(msg: TgMessage): Promise<void> {
  const group = await getGroup();
  const ours = !!group && group.chatId === msg.chat.id;
  // Служебные «X вступил в группу» засоряют общую тему — убираем.
  if (msg.new_chat_members?.length) {
    if (ours) await tg('deleteMessage', { chat_id: msg.chat.id, message_id: msg.message_id }).catch(() => {});
    return;
  }
  if (!msg.from) return;
  const c = parseCommand(msg.text ?? '');
  if (c?.cmd === 'setup') return cmdSetup(msg, group?.chatId ?? null);
  if (!ours) return;
  if (c && (c.cmd === 'ban' || c.cmd === 'mute' || c.cmd === 'unmute')) return moderate(msg, c.cmd, c.args);
  return guardAuthor(msg);
}

/**
 * Бот обслуживает одну группу. Первую настраивает любой её админ; после этого /setup
 * в другой группе отклоняется, а бот её покидает — иначе любой мог бы увести бота к себе.
 */
async function cmdSetup(msg: TgMessage, currentId: number | null): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from!;
  if (!(await isGroupAdmin(chatId, from.id))) return;
  await tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
  if (currentId !== null && currentId !== chatId) {
    await trySend(chatId, 'Этот бот уже обслуживает другую группу и не может работать здесь.');
    await tg('leaveChat', { chat_id: chatId }).catch(() => {});
    return;
  }
  if (msg.chat.type !== 'supergroup' || !msg.chat.is_forum) {
    await trySend(chatId, 'Включите «Темы» в настройках группы и повторите /setup.');
    return;
  }
  if (setupRunning) return; // двойной /setup подряд создал бы темы дважды
  setupRunning = true;
  try {
    const { created } = await setupGroup(chatId, msg.chat.title);
    await trySend(from.id, created.length
      ? `Группа «${escapeHtml(msg.chat.title ?? '')}» настроена. Созданы темы:\n${created.join('\n')}`
      : `Группа «${escapeHtml(msg.chat.title ?? '')}» проверена: темы, права и ссылка на месте.`);
  } catch (e) {
    await trySend(chatId, `Не удалось настроить: ${escapeHtml((e as Error).message)}\nПроверьте, что бот — администратор с правами «Управление темами», «Удаление», «Блокировка» и «Пригласительные ссылки».`);
  } finally {
    setupRunning = false;
  }
}

/**
 * Пишет в группе человек без живого аккаунта (вступил до появления проверки, аккаунт
 * заблокировали, Telegram отвязали): сообщение удаляем, человека исключаем.
 */
async function guardAuthor(msg: TgMessage): Promise<void> {
  const from = msg.from!;
  // Анонимный админ и каналы приходят от служебных ботов.
  if (from.is_bot) return;
  const admins = await groupAdminIds(msg.chat.id);
  if (!admins || admins.has(from.id)) return;
  const acc = await touchAccount(from);
  if (await activeUser(acc)) return;
  await tg('deleteMessage', { chat_id: msg.chat.id, message_id: msg.message_id }).catch(() => {});
  await kickFromGroup(from.id);
  const t = tt(langOf(acc, from));
  await trySend(from.id, (await userStatus(acc.userId)) === 'disabled' ? t('blocked') : t('removedNoAccount'));
}

/**
 * Модерация ответом на сообщение: /ban — убрать из группы и удалить сообщение,
 * /mute [часы] — запретить писать (по умолчанию сутки), /unmute — вернуть.
 */
async function moderate(msg: TgMessage, cmd: string, args: string): Promise<void> {
  const chatId = msg.chat.id;
  if (!(await isGroupAdmin(chatId, msg.from!.id))) return;
  await tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
  const target = msg.reply_to_message;
  // Ответ «в тему» без цитаты — это ответ на служебное сообщение создания темы: в нём нет автора.
  if (!target?.from || target.from.is_bot) return;
  const victim = target.from.id;
  if (await isGroupAdmin(chatId, victim)) return;
  if (cmd === 'ban') {
    await tg('banChatMember', { chat_id: chatId, user_id: victim, revoke_messages: false }).catch(() => {});
    await tg('deleteMessage', { chat_id: chatId, message_id: target.message_id }).catch(() => {});
    return;
  }
  const hours = Math.min(Math.max(Math.round(Number(args)) || 24, 1), 24 * 30);
  const mute = cmd === 'mute';
  await tg('restrictChatMember', {
    chat_id: chatId, user_id: victim, use_independent_chat_permissions: true,
    permissions: Object.fromEntries(['can_send_messages', 'can_send_audios', 'can_send_documents', 'can_send_photos', 'can_send_videos',
      'can_send_video_notes', 'can_send_voice_notes', 'can_send_polls', 'can_send_other_messages', 'can_add_web_page_previews']
      .map((k) => [k, !mute])),
    ...(mute ? { until_date: Math.floor(Date.now() / 1000) + hours * 3600 } : {}),
  }).catch(() => {});
  const note = mute ? `🔇 ${escapeHtml(target.from.first_name)}: только чтение на ${hours} ч.` : `🔈 ${escapeHtml(target.from.first_name)} снова может писать.`;
  await trySend(chatId, note, target.message_thread_id ? { message_thread_id: target.message_thread_id } : {});
}

async function onCallback(q: TgCallbackQuery): Promise<void> {
  await tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  // Наши кнопки с callback живут только в личке.
  if (q.message && q.message.chat.type !== 'private') return;
  if (privateFlood.hit(q.from.id) === 'over') return;
  const acc = await touchAccount(q.from);
  const chatId = q.message?.chat.id ?? q.from.id;
  const [kind, value = ''] = (q.data ?? '').split(':');
  // Кнопки одноразовые: убираем их, чтобы повторное нажатие не выдавало новых ссылок.
  if (q.message) await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});

  if (kind === 'share') {
    const t = tt(langOf(acc));
    const pending = pendingShares.get(acc.tgUserId);
    pendingShares.delete(acc.tgUserId);
    if (!pending || Date.now() - pending.at > SHARE_TTL_MS || !SHARE_TOPICS.includes(value)) {
      await trySend(chatId, t('shareUsage'));
      return;
    }
    if (!(await activeUser(acc))) return needAccount(chatId, acc);
    if (shareLimit.hit(acc.tgUserId) !== 'ok') { await trySend(chatId, t('shareLimit', { n: SHARE_PER_HOUR })); return; }
    const ok = await postToTopic(value, pending.card).catch(() => false);
    const name = TOPICS.find((x) => x.key === value)?.name ?? '';
    await trySend(chatId, ok ? t('shareDone', { topic: name }) : t('noGroup'));
    return;
  }
  if (kind === 'lang' && isLocale(value)) {
    await setLang(acc.tgUserId, value);
    const next = { ...acc, lang: value };
    if (await activeUser(next)) { await trySend(chatId, tt(value)('langSaved')); return; }
    return continueOnboarding(chatId, next);
  }
  if (kind === 'persona' && isPersona(value)) {
    await setPersona(acc.tgUserId, value);
    const next = { ...acc, persona: value };
    if (await activeUser(next)) { await trySend(chatId, tt(langOf(next))('personaSaved')); return; }
    return continueOnboarding(chatId, next);
  }
}

/** Заявка в группу: одобряем сразу, если Telegram привязан к живому аккаунту, иначе зовём в бота. */
async function onJoinRequest(r: TgJoinRequest): Promise<void> {
  const group = await getGroup();
  if (!group || r.chat.id !== group.chatId) return;
  const acc = await touchAccount(r.from);
  if (await activeUser(acc)) {
    await approveJoin(r.from.id);
    return;
  }
  // Заявка остаётся висеть: после привязки на сайте бот одобрит её сам.
  const t = tt(langOf(acc, r.from));
  await trySend(r.user_chat_id, (await userStatus(acc.userId)) === 'disabled' ? t('blocked') : t('joinNeedsAccount'));
}

const OUTSIDE = ['left', 'kicked'];

/**
 * Вход в группу в обход бота (основная ссылка группы и т. п.): без живого аккаунта
 * человека убираем и зовём в бота. Не трогаем админов и тех, кого добавил админ.
 */
async function onMemberChange(m: TgChatMemberUpdated): Promise<void> {
  const group = await getGroup();
  if (!group || m.chat.id !== group.chatId) return;
  const joined = OUTSIDE.includes(m.old_chat_member.status)
    && (m.new_chat_member.status === 'member' || (m.new_chat_member.status === 'restricted' && m.new_chat_member.is_member));
  const who = m.new_chat_member.user;
  if (!joined || who.is_bot) return;
  if (m.from.id !== who.id && (await isGroupAdmin(m.chat.id, m.from.id))) return;
  const acc = await touchAccount(who);
  if (await activeUser(acc)) return;
  await kickFromGroup(who.id);
  const t = tt(langOf(acc, who));
  await trySend(who.id, (await userStatus(acc.userId)) === 'disabled' ? t('blocked') : t('removedNoAccount'));
}

/** Бота добавили или убрали. Чужие группы покидаем, если своя уже есть. */
async function onMyMember(m: TgChatMemberUpdated): Promise<void> {
  if (m.chat.type === 'private' || m.chat.type === 'channel') return;
  const group = await getGroup();
  const status = m.new_chat_member.status;
  if (group && group.chatId !== m.chat.id) {
    if (status === 'member' || status === 'administrator') await tg('leaveChat', { chat_id: m.chat.id }).catch(() => {});
    return;
  }
  if (group && OUTSIDE.includes(status)) {
    console.warn(`[telegram] бота убрали из группы «${m.chat.title ?? m.chat.id}» — сообщество не работает`);
    return;
  }
  if (status === 'administrator' && !group) {
    await trySend(m.from.id, `Бот — администратор в «${escapeHtml(m.chat.title ?? '')}». Напишите в группе /setup, чтобы создать темы.`);
  }
}

export async function handleUpdate(u: TgUpdate): Promise<void> {
  if (u.chat_member) return onMemberChange(u.chat_member);
  if (u.my_chat_member) return onMyMember(u.my_chat_member);
  if (u.message) {
    if (u.message.chat.type === 'private' && u.message.from) return onPrivate(u.message);
    if (u.message.chat.type === 'supergroup' || u.message.chat.type === 'group') return onGroup(u.message);
    return;
  }
  if (u.callback_query) return onCallback(u.callback_query);
  if (u.chat_join_request) return onJoinRequest(u.chat_join_request);
}

/** Меню команд и описание бота на трёх языках. Вызывается при старте. */
export async function registerProfile(): Promise<void> {
  for (const lang of [null, ...LOCALES] as (Locale | null)[]) {
    const t = tt(lang ?? DEFAULT_LOCALE);
    const lc = lang ? { language_code: lang } : {};
    await tg('setMyDescription', { description: t('about'), ...lc });
    await tg('setMyShortDescription', { short_description: t('aboutShort'), ...lc });
  }
  const list = (lang: Locale) => COMMANDS[lang].map(([command, description]) => ({ command, description }));
  const scope = { type: 'all_private_chats' };
  // Без language_code — меню для всех прочих языков клиента.
  await tg('setMyCommands', { commands: list(DEFAULT_LOCALE), scope });
  for (const lang of LOCALES) await tg('setMyCommands', { commands: list(lang), scope, language_code: lang });
  // В группах меню команд не нужно: там пишут люди, а не боту.
  await tg('deleteMyCommands', { scope: { type: 'all_group_chats' } }).catch(() => {});
}

/** Сообщения после привязки: подтверждение, одобрение висящей заявки или ссылка на группу. */
export async function notifyLinked(acc: TgAccount, who: string, key: 'linked' | 'linkedSite' = 'linked'): Promise<void> {
  const lang = langOf(acc);
  const t = tt(lang);
  const tips = acc.persona ? `\n\n${t(`tips_${acc.persona}`)}` : '';
  await trySend(acc.tgUserId, t(key, { who: escapeHtml(who) }) + tips);
  if (await approveJoin(acc.tgUserId)) {
    await trySend(acc.tgUserId, t('approved'));
    await sendTopics(acc.tgUserId, acc);
    return;
  }
  await sendGroupInvite(acc.tgUserId, lang);
}
