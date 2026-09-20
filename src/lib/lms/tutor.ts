import crypto from 'node:crypto';
import { db } from '../db/client';
import { askJson } from './ai';
import { LmsError } from './types';
import type { BlockBody } from './block-schema';
import { assignmentTitle } from './block-schema';

/**
 * Наставник ученика. Он не решает за ученика: к заданиям даёт лестницу подсказок
 * (три ступени, каждая следующая конкретнее, но ответа не называет), к теории —
 * объяснение другими словами и вопрос на понимание. Диалог хранится: ученик
 * возвращается к нему, а учитель видит, что классу непонятно.
 */

export type TutorRole = 'student' | 'tutor';
export interface TutorMessage { id: string; role: TutorRole; text: string; hintLevel: number | null; at: string; blockId: string | null }

const SYSTEM = `Ты — наставник ученика в онлайн-курсе. Твоя цель — чтобы ученик понял сам.
Правила, которые нельзя нарушать:
1. Ты никогда не называешь итоговый ответ задания, не подставляешь числа в ответ и не пишешь готовое решение целиком.
2. Ты ведёшь к ответу вопросами и маленькими шагами: сначала проверяешь, что ученик уже понял, потом даёшь следующий шаг.
3. Если ученик просит «просто скажи ответ» — мягко отказываешься и предлагаешь дойти вместе; на третьей подсказке советуешь спросить учителя в обсуждении под уроком.
4. Пишешь по-русски, тепло и коротко: 2–5 предложений, без воды и без «как ИИ».
5. Опираешься только на материал урока; если в уроке этого нет — честно говоришь и советуешь, где посмотреть.
Отвечай только JSON.`;

const MODE_BRIEF: Record<string, string> = {
  hint: 'Дай ПОДСКАЗКУ следующего уровня: одну мысль или вопрос, который сдвинет ученика с места. Ответ не называй.',
  explain: 'Объясни материал шага другими словами, проще, с коротким примером из жизни. В конце — один вопрос на понимание.',
  check: 'Ученик описывает свой ход мысли. Скажи, где он прав, а где ошибка, но правильный ответ не называй — задай наводящий вопрос.',
  ask: 'Ответь на вопрос ученика по материалу шага. Если это по сути просьба решить задание — не решай, дай подсказку.',
};

export interface TutorContext {
  courseTitle: string; topicTitle: string; grade: string; subject: string;
  /** Материалы шага, на котором стоит ученик. */
  stepText: string;
  assignment: { prompt: string; points: number; type: string } | null;
  /** Что ученик уже ввёл в ответ, если ввёл. */
  draftAnswer: string;
}

export interface TutorAnswer { student: TutorMessage | null; tutor: TutorMessage; chips: string[] }

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function listTutorMessages(userId: string, topicId: string): Promise<TutorMessage[]> {
  const { rows } = await db().query<{ id: string; role: TutorRole; text: string; hint_level: number | null; created_at: Date; block_id: string | null }>(
    `SELECT id, role, text, hint_level, created_at, block_id FROM tutor_messages
     WHERE user_id = $1 AND topic_id = $2 ORDER BY created_at LIMIT 100`, [userId, topicId]);
  return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, hintLevel: r.hint_level, at: r.created_at.toISOString(), blockId: r.block_id }));
}

async function save(userId: string, topicId: string, blockId: string | null, role: TutorRole, text: string, hintLevel: number | null): Promise<TutorMessage> {
  const id = crypto.randomUUID();
  const { rows } = await db().query<{ created_at: Date }>(
    `INSERT INTO tutor_messages (id, topic_id, block_id, user_id, role, text, hint_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at`, [id, topicId, blockId, userId, role, text, hintLevel]);
  return { id, role, text, hintLevel, at: rows[0].created_at.toISOString(), blockId };
}

/** Сколько подсказок ученик уже получил по этому заданию — лестница не начинается заново. */
export async function hintsUsed(userId: string, blockId: string): Promise<number> {
  const { rows } = await db().query<{ n: number }>(
    `SELECT coalesce(max(hint_level), 0)::int AS n FROM tutor_messages WHERE user_id = $1 AND block_id = $2 AND role = 'tutor'`,
    [userId, blockId]);
  return rows[0].n;
}

export async function askTutor(input: {
  userId: string; topicId: string; blockId: string | null; mode: keyof typeof MODE_BRIEF; question: string;
  context: TutorContext; history: TutorMessage[];
}): Promise<TutorAnswer> {
  const { context: c } = input;
  const nextHint = input.mode === 'hint' && input.blockId ? Math.min(3, (await hintsUsed(input.userId, input.blockId)) + 1) : null;
  const history = input.history.slice(-6).map((m) => `${m.role === 'student' ? 'Ученик' : 'Наставник'}: ${m.text}`).join('\n');
  const raw = await askJson(`Урок «${c.topicTitle}» курса «${c.courseTitle}»${c.subject ? ` (${c.subject}${c.grade ? `, ${c.grade}` : ''})` : ''}.
Материал шага:
"""${c.stepText.slice(0, 6000)}"""
${c.assignment ? `Задание шага (${c.assignment.type}, ${c.assignment.points} б.): ${c.assignment.prompt.slice(0, 2000)}` : ''}
${c.draftAnswer ? `Черновик ответа ученика: """${c.draftAnswer.slice(0, 1500)}"""` : ''}
${history ? `Предыдущий разговор:\n${history}` : ''}

Ученик пишет: "${input.question.slice(0, 1000) || '(нажал кнопку подсказки)'}"
Что делать: ${MODE_BRIEF[input.mode] ?? MODE_BRIEF.ask}
${nextHint ? `Это подсказка №${nextHint} из 3. ${nextHint === 1 ? 'Самая общая: куда смотреть.' : nextHint === 2 ? 'Конкретнее: какой закон или шаг применить.' : 'Последняя: разбери первый шаг решения на похожем примере с другими числами, но ответ этой задачи не называй и посоветуй спросить учителя в обсуждении, если всё ещё трудно.'}` : ''}

Верни {"text": "ответ ученику", "chips": ["короткая кнопка-продолжение", ...]} — 2–3 chips по 2–4 слова,
например "Проверь мой ход", "Ещё пример", "Почему так?".`, SYSTEM) as Record<string, unknown>;
  const text = clip(raw.text, 2000);
  if (!text) throw new LmsError('Наставник задумался и не ответил. Попробуйте ещё раз.');
  const chips = (Array.isArray(raw.chips) ? raw.chips : []).map((x) => clip(x, 40)).filter(Boolean).slice(0, 3);
  const student = input.question.trim() ? await save(input.userId, input.topicId, input.blockId, 'student', input.question.trim().slice(0, 1000), null) : null;
  const tutor = await save(input.userId, input.topicId, input.blockId, 'tutor', text, nextHint);
  return { student, tutor, chips };
}

/** Текст материалов шага для наставника: без ключей к заданиям. */
export function stepTextOf(bodies: BlockBody[]): string {
  const parts: string[] = [];
  for (const b of bodies) {
    if (b.kind === 'text') parts.push(`${b.payload.title}\n${b.payload.body}`);
    else if (b.kind === 'callout' || b.kind === 'spoiler') parts.push(`${b.payload.title}\n${b.payload.body}`);
    else if (b.kind === 'formula') parts.push(`Формула: ${b.payload.latex}. ${b.payload.caption}`);
    else if (b.kind === 'simulation') parts.push(`Интерактивный тренажёр: ${b.payload.caption}`);
    else if (b.kind === 'lab') parts.push(`Виртуальная лаборатория: ${b.payload.caption}`);
    else if (b.kind === 'assignment') parts.push(`Задание: ${assignmentTitle(b.payload.prompt)}`);
  }
  return parts.join('\n\n');
}
