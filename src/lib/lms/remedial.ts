import crypto from 'node:crypto';
import { db } from '../db/client';
import { askJson, BLOCK_FORMAT } from './ai';
import { answerText } from './debrief';
import { assignmentTitle, bodyFromRow, sanitizeBlockBody, type AssignmentPayload } from './block-schema';
import { VISIBLE_TO_STUDENT } from './courses';
import { isUuid } from '../org/access';
import { getInterests } from './interests-store';
import { interestsBrief, interestsEmpty } from './interests';
import { LmsError } from './types';
import type { Answer } from './answers';

/**
 * Работа над ошибками: персональный мини-урок по заданию, которое ученик не сдал.
 * Помощник объясняет ту же идею заново — на сюжетах из интересов ученика — и даёт
 * свои задания нарастающей сложности. Разбор принадлежит ученику: учителю он не виден,
 * баллы за него не ставятся, проверка происходит прямо на странице.
 */

export type RemedialStatus = 'new' | 'in_progress' | 'done';

export interface RemedialSection { title: string; body: string }

export interface RemedialBody {
  sections: RemedialSection[];
  /** Мини-задания разбора: полные payload'ы — проверка идёт на клиенте тем же autoScore. */
  tasks: AssignmentPayload[];
  /** Собран ли разбор по интересам: если нет, интерфейс предлагает заполнить профиль. */
  personal: boolean;
}

export interface Remedial {
  id: string;
  topicId: string | null;
  blockId: string | null;
  topicTitle: string | null;
  courseTitle: string | null;
  title: string;
  reason: string;
  body: RemedialBody;
  status: RemedialStatus;
  createdAt: string;
  updatedAt: string;
}

const STATUSES: readonly string[] = ['new', 'in_progress', 'done'];

export function isRemedialStatus(v: unknown): v is RemedialStatus {
  return typeof v === 'string' && STATUSES.includes(v);
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Типы, которые ученик проверит сам, не дожидаясь учителя. Развёрнутый ответ,
 * таблицу измерений и состояние тренажёра в разборе оставлять нельзя: проверить
 * их некому, а разбор ошибок должен закрываться здесь и сейчас.
 */
const SELF_CHECKED: readonly string[] = ['choice', 'number', 'short', 'gaps', 'match', 'order'];

export interface RemedialDraft { title: string; why: string; sections: RemedialSection[]; tasks: AssignmentPayload[] }

/**
 * Разбор ответа модели. Задания проходят ту же санацию, что и ручной ввод учителя:
 * что не прошло — молча выбрасываем, разбор без единого задания не сохраняем.
 * Функция чистая, поэтому её проверяют тесты без базы и без провайдера.
 */
export function parseRemedial(raw: unknown, fallbackTitle: string): RemedialDraft {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const sections = (Array.isArray(o.sections) ? o.sections : []).slice(0, 6).flatMap((s): RemedialSection[] => {
    const item = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
    const body = clip(item.body, 4000);
    return body ? [{ title: clip(item.title, 200), body }] : [];
  });
  const tasks: AssignmentPayload[] = [];
  for (const item of (Array.isArray(o.blocks) ? o.blocks : []).slice(0, 8)) {
    if (typeof item !== 'object' || item === null) continue;
    const { kind, payload } = item as { kind?: unknown; payload?: unknown };
    if (kind !== 'assignment') continue;
    try {
      const body = sanitizeBlockBody('assignment', payload);
      if (body.kind !== 'assignment' || !SELF_CHECKED.includes(body.payload.spec.type)) continue;
      // Тренажёр модель выдумать не может: он указывает на реальные симуляции.
      body.payload.stand = null;
      // Разбор не оценивается, попытки в нём не ограничены.
      body.payload.allowRetry = true;
      tasks.push(body.payload);
    } catch { /* задание не прошло проверку — пропускаем */ }
  }
  if (tasks.length === 0) {
    throw new LmsError('Помощник не смог собрать задания для разбора. Попробуйте ещё раз через минуту.');
  }
  return { title: clip(o.title, 200) || fallbackTitle, why: clip(o.why, 800), sections, tasks };
}

const SYSTEM = `Ты — внимательный репетитор. Ученик ошибся, и ты объясняешь ему тему заново — спокойно,
без упрёков, через то, что ему самому интересно. Пишешь по-русски, короткими предложениями,
обращаешься на «вы» — так с учеником говорит весь остальной интерфейс.
Факты и числа проверяй: ошибка в объяснении недопустима. Отвечай только JSON без пояснений вокруг.
${BLOCK_FORMAT}`;

interface TaskRow {
  payload: unknown; topic_id: string; topic: string; course: string; subject: string; grade: string;
  answer: Answer | null; score: string | null; status: string | null; comment: string | null;
}

/** Задание вместе с темой, курсом и последним ответом ученика — только из курсов, открытых ему. */
async function failedTask(userId: string, blockId: string): Promise<TaskRow | null> {
  const { rows } = await db().query<TaskRow>(
    `SELECT b.payload, t.id AS topic_id, t.title AS topic, c.title AS course, c.subject, c.grade,
       s.answer, coalesce(s.score, s.auto_score) AS score, s.status, s.comment
     FROM blocks b
     JOIN topics t ON t.id = b.topic_id
     JOIN courses c ON c.id = t.course_id
     LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = $1
     WHERE b.id = $2 AND b.kind = 'assignment' AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})`,
    [userId, blockId]);
  return rows[0] ?? null;
}

export async function createRemedial(userId: string, blockId: string): Promise<Remedial> {
  if (!isUuid(blockId)) throw new LmsError('Задание не найдено.');
  const row = await failedTask(userId, blockId);
  if (!row) throw new LmsError('Задание недоступно — возможно, курс закрыли.');
  const block = bodyFromRow('assignment', row.payload);
  if (block.kind !== 'assignment') throw new LmsError('Это не задание — разбирать нечего.');
  const p = block.payload;
  const interests = await getInterests(userId);
  const personal = !interestsEmpty(interests);
  const given = row.answer ? answerText(p, row.answer).slice(0, 2000) : '';

  const raw = await askJson(`Ученик не справился с заданием. Собери ему персональный разбор.
Предмет: ${row.subject || 'не указан'}
Класс: ${row.grade || 'средняя школа'}
Курс: ${row.course}
Тема: ${row.topic}
Задание: ${p.prompt.slice(0, 3000)}
Правильный ответ и схема проверки: ${JSON.stringify(p.spec).slice(0, 3000)}
${p.explanation ? `Пояснение учителя: ${p.explanation.slice(0, 1500)}` : ''}
${p.reference ? `Эталонный ответ: ${p.reference.slice(0, 2000)}` : ''}
${given ? `Что ответил ученик: "${given}"` : 'Ученик ничего не ответил.'}
${row.score !== null ? `Набрано баллов: ${row.score} из ${p.points}` : `Работа возвращена на доработку${row.comment ? `: ${row.comment.slice(0, 500)}` : ''}`}
${personal ? `Чем живёт ученик — ${interestsBrief(interests)}. Придумывай примеры и сюжеты заданий только про это.`
    : 'Про интересы ученика ничего не известно — бери обычные понятные примеры из школьной жизни.'}

Верни JSON:
{"title": "короткое название разбора",
 "why": "в чём была ошибка, 1–2 предложения, без упрёков",
 "sections": [{"title": "подзаголовок", "body": "объяснение"}] (2–4 секции: как думать правильно, разбор шага, где ошибаются),
 "blocks": [...]}
Поле "body" секции — простая разметка: абзацы через пустую строку, **жирный**, "- " для списка, формулы $...$.
В "blocks" — 3–4 блока "assignment" нарастающей сложности: та же проверяемая идея, что и в проваленном задании,
но другие числа и другой сюжет. Тип spec — только "choice", "number", "short", "gaps", "match" или "order":
ученик проверяет себя сам, учителя рядом нет. У каждого задания заполни "explanation" — почему ответ такой.`, SYSTEM);

  const draft = parseRemedial(raw, `Разбор: ${assignmentTitle(p.prompt) || row.topic}`);
  const body: RemedialBody = { sections: draft.sections, tasks: draft.tasks, personal };
  const id = crypto.randomUUID();
  const { rows } = await db().query<{ created_at: Date; updated_at: Date }>(
    `INSERT INTO remedial_lessons (id, user_id, topic_id, block_id, title, reason, body)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at, updated_at`,
    [id, userId, row.topic_id, blockId, draft.title, draft.why, JSON.stringify(body)]);
  return {
    id, topicId: row.topic_id, blockId, topicTitle: row.topic, courseTitle: row.course,
    title: draft.title, reason: draft.why, body, status: 'new',
    createdAt: rows[0].created_at.toISOString(), updatedAt: rows[0].updated_at.toISOString(),
  };
}

interface RemedialRow {
  id: string; topic_id: string | null; block_id: string | null; topic: string | null; course: string | null;
  title: string; reason: string; body: RemedialBody; status: RemedialStatus; created_at: Date; updated_at: Date;
}

const REMEDIAL_SELECT = `SELECT r.id, r.topic_id, r.block_id, t.title AS topic, c.title AS course,
    r.title, r.reason, r.body, r.status, r.created_at, r.updated_at
  FROM remedial_lessons r
  LEFT JOIN topics t ON t.id = r.topic_id
  LEFT JOIN courses c ON c.id = t.course_id`;

function toRemedial(r: RemedialRow): Remedial {
  return {
    id: r.id, topicId: r.topic_id, blockId: r.block_id, topicTitle: r.topic, courseTitle: r.course,
    title: r.title, reason: r.reason, body: r.body, status: r.status,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export async function listRemedials(userId: string): Promise<Remedial[]> {
  const { rows } = await db().query<RemedialRow>(
    `${REMEDIAL_SELECT} WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [userId]);
  return rows.map(toRemedial);
}

/** Чужой разбор неотличим от несуществующего: наружу и там, и там null. */
export async function getRemedial(userId: string, id: string): Promise<Remedial | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<RemedialRow>(`${REMEDIAL_SELECT} WHERE r.user_id = $1 AND r.id = $2`, [userId, id]);
  return rows[0] ? toRemedial(rows[0]) : null;
}

export async function setRemedialStatus(userId: string, id: string, status: RemedialStatus): Promise<Remedial | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<{ id: string }>(
    'UPDATE remedial_lessons SET status = $3, updated_at = now() WHERE user_id = $1 AND id = $2 RETURNING id',
    [userId, id, status]);
  return rows[0] ? getRemedial(userId, id) : null;
}

/** Открытый разбор перестаёт быть новым: в списке видно, за что ученик уже взялся. */
export async function markRemedialOpened(userId: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await db().query(
    `UPDATE remedial_lessons SET status = 'in_progress', updated_at = now()
     WHERE user_id = $1 AND id = $2 AND status = 'new'`, [userId, id]);
}

/** Для каких заданий разбор уже есть: кнопка «Разобрать» превращается в ссылку на него. */
export async function remedialsByBlock(userId: string): Promise<Map<string, string>> {
  const { rows } = await db().query<{ block_id: string; id: string }>(
    `SELECT DISTINCT ON (block_id) block_id, id FROM remedial_lessons
     WHERE user_id = $1 AND block_id IS NOT NULL ORDER BY block_id, created_at DESC`, [userId]);
  return new Map(rows.map((r) => [r.block_id, r.id]));
}
