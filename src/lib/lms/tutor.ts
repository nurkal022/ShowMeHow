import crypto from 'node:crypto';
import { db } from '../db/client';
import { askJson } from './ai';
import { LmsError } from './types';
import type { BlockBody } from './block-schema';
import { assignmentTitle } from './block-schema';
import type { Locale } from '@/i18n/config';
import { parseTutorPlot, type TutorPlot } from './tutor-plot';

/**
 * Наставник студента. Он не решает за студента: к заданиям даёт лестницу подсказок
 * (три ступени, каждая следующая конкретнее, но ответа не называет), к теории —
 * объяснение другими словами и вопрос на понимание. Диалог хранится: студент
 * возвращается к нему, а преподаватель видит, что группе непонятно.
 */

export type TutorRole = 'student' | 'tutor';
export interface TutorMessage {
  id: string; role: TutorRole; text: string; hintLevel: number | null; at: string; blockId: string | null;
  /** Живой график к ответу, если наставник решил, что зависимость лучше показать. */
  plot?: TutorPlot | null;
}

const SYSTEM = `Ты — наставник студента в онлайн-курсе. Твоя цель — чтобы студент понял сам.
Правила, которые нельзя нарушать:
1. Ты никогда не называешь итоговый ответ задания, не подставляешь числа в ответ и не пишешь готовое решение целиком.
2. Ты ведёшь к ответу вопросами и маленькими шагами: сначала проверяешь, что студент уже понял, потом даёшь следующий шаг.
3. Если студент просит «просто скажи ответ» — мягко отказываешься и предлагаешь дойти вместе; на третьей подсказке советуешь спросить преподавателя в обсуждении под уроком.
4. Пишешь по-русски, тепло и коротко: 2–5 предложений, без воды и без «как ИИ».
5. Опираешься только на материал урока; если в уроке этого нет — честно говоришь и советуешь, где посмотреть.
6. Числа тренажёра берёшь только из присланных показаний. Чего в них нет — того не знаешь: так и говоришь, а не придумываешь.
7. Не задаёшь вопрос после каждой реплики и не переспрашиваешь то, на что студент уже ответил.
   Не спрашиваешь «А или Б?», если верны оба варианта. Показал один случай — дождись реакции, прежде чем идти дальше.
Отвечай только JSON.`;

const MODE_BRIEF: Record<string, string> = {
  hint: 'Дай ПОДСКАЗКУ следующего уровня: одну мысль или вопрос, который сдвинет студента с места. Ответ не называй.',
  explain: 'Объясни материал шага другими словами, проще, с коротким примером из жизни. В конце — один вопрос на понимание.',
  check: 'Студент описывает свой ход мысли. Скажи, где он прав, а где ошибка, но правильный ответ не называй — задай наводящий вопрос.',
  ask: 'Ответь на вопрос студента по материалу шага. Если это по сути просьба решить задание — не решай, дай подсказку.',
};

export interface TutorContext {
  courseTitle: string; topicTitle: string; grade: string; subject: string;
  /** Материалы шага, на котором стоит студент. */
  stepText: string;
  assignment: { prompt: string; points: number; type: string } | null;
  /** Что студент уже ввёл в ответ, если ввёл. */
  draftAnswer: string;
  /** Что сейчас на экране тренажёра: ползунки и приборы строками «подпись: значение». */
  simState?: string;
}

export interface TutorAnswer {
  student: TutorMessage | null; tutor: TutorMessage; chips: string[];
  /** Варианты ответа на вопрос наставника — студент отвечает нажатием. */
  options: string[];
  /** Куда смотреть в тренажёре: подпись ползунка или прибора и короткая пометка. */
  point: { target: string; note: string } | null;
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function listTutorMessages(userId: string, topicId: string): Promise<TutorMessage[]> {
  const { rows } = await db().query<{ id: string; role: TutorRole; text: string; hint_level: number | null; created_at: Date; block_id: string | null; plot: unknown }>(
    `SELECT id, role, text, hint_level, created_at, block_id, plot FROM tutor_messages
     WHERE user_id = $1 AND topic_id = $2 ORDER BY created_at LIMIT 100`, [userId, topicId]);
  return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, hintLevel: r.hint_level, at: r.created_at.toISOString(), blockId: r.block_id, plot: parseTutorPlot(r.plot) }));
}

async function save(
  userId: string, topicId: string, blockId: string | null, role: TutorRole, text: string, hintLevel: number | null, plot: TutorPlot | null = null,
): Promise<TutorMessage> {
  const id = crypto.randomUUID();
  const { rows } = await db().query<{ created_at: Date }>(
    `INSERT INTO tutor_messages (id, topic_id, block_id, user_id, role, text, hint_level, plot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING created_at`, [id, topicId, blockId, userId, role, text, hintLevel, plot ? JSON.stringify(plot) : null]);
  return { id, role, text, hintLevel, at: rows[0].created_at.toISOString(), blockId, plot };
}

/** Сколько подсказок студент уже получил по этому заданию — лестница не начинается заново. */
export async function hintsUsed(userId: string, blockId: string): Promise<number> {
  const { rows } = await db().query<{ n: number }>(
    `SELECT coalesce(max(hint_level), 0)::int AS n FROM tutor_messages WHERE user_id = $1 AND block_id = $2 AND role = 'tutor'`,
    [userId, blockId]);
  return rows[0].n;
}

/**
 * Насколько уверенно студент решает задания курса: скользящее среднее (EWMA) долей баллов,
 * от старых к новым, свежие весят больше. null — оценок ещё нет.
 */
export function masteryOf(ratios: number[], alpha = 0.4): number | null {
  let m: number | null = null;
  for (const r of ratios) {
    if (!Number.isFinite(r)) continue;
    const v = Math.min(1, Math.max(0, r));
    m = m === null ? v : alpha * v + (1 - alpha) * m;
  }
  return m;
}

export type TutorLevel = 'struggling' | 'steady' | 'strong' | null;
export function levelOf(mastery: number | null): TutorLevel {
  if (mastery === null) return null;
  return mastery < 0.5 ? 'struggling' : mastery >= 0.8 ? 'strong' : 'steady';
}

const LEVEL_BRIEF: Record<Exclude<TutorLevel, null>, string> = {
  struggling: 'По последним оценкам студенту сейчас трудно. Объясняй мельче, по одному шагу, с простым бытовым примером; подсказки делай конкретнее обычного (но ответ не называй); подбодри без сюсюканья.',
  steady: '',
  strong: 'По последним оценкам студент решает уверенно. Отвечай коротко, наводящими вопросами, не разжёвывай; первая подсказка — только намёк.',
};

/** Последние 20 проверенных ответов студента по курсу этой темы — доли баллов от старых к новым. */
export async function recentScoreRatios(userId: string, topicId: string): Promise<number[]> {
  const { rows } = await db().query<{ r: string }>(
    `SELECT r FROM (
       SELECT coalesce(s.score, s.auto_score) / nullif((b.payload->>'points')::numeric, 0) AS r,
              coalesce(s.graded_at, s.submitted_at, s.updated_at) AS at
         FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
        WHERE s.student_id = $1 AND t.course_id = (SELECT course_id FROM topics WHERE id = $2)
          AND s.status IN ('graded', 'returned', 'submitted') AND coalesce(s.score, s.auto_score) IS NOT NULL
        ORDER BY at DESC LIMIT 20) x
     WHERE r IS NOT NULL ORDER BY at`, [userId, topicId]);
  return rows.map((x) => Number(x.r));
}

export async function askTutor(input: {
  userId: string; topicId: string; blockId: string | null; mode: keyof typeof MODE_BRIEF; question: string;
  context: TutorContext; history: TutorMessage[];
  /** Язык ответа наставника; по умолчанию русский. */
  locale?: Locale;
}): Promise<TutorAnswer> {
  const { context: c } = input;
  const nextHint = input.mode === 'hint' && input.blockId ? Math.min(3, (await hintsUsed(input.userId, input.blockId)) + 1) : null;
  const level = levelOf(masteryOf(await recentScoreRatios(input.userId, input.topicId).catch(() => [])));
  const levelBrief = level ? LEVEL_BRIEF[level] : '';
  const history = input.history.slice(-6).map((m) => `${m.role === 'student' ? 'Студент' : 'Наставник'}: ${m.text}`).join('\n');
  const raw = await askJson(`Урок «${c.topicTitle}» курса «${c.courseTitle}»${c.subject ? ` (${c.subject}${c.grade ? `, ${c.grade}` : ''})` : ''}.
Материал шага:
"""${c.stepText.slice(0, 6000)}"""
${c.assignment ? `Задание шага (${c.assignment.type}, ${c.assignment.points} б.): ${c.assignment.prompt.slice(0, 2000)}` : ''}
${c.draftAnswer ? `Черновик ответа студента: """${c.draftAnswer.slice(0, 1500)}"""` : ''}
${c.simState ? `Сейчас в тренажёре у студента (ползунки и показания приборов):\n"""${c.simState.slice(0, 1500)}"""\nЕсли вопрос про тренажёр — опирайся на эти числа: что они значат, что изменится, если сдвинуть параметр.` : ''}
${history ? `Предыдущий разговор:\n${history}` : ''}
${levelBrief}

Студент пишет: "${input.question.slice(0, 1000) || '(нажал кнопку подсказки)'}"
Что делать: ${MODE_BRIEF[input.mode] ?? MODE_BRIEF.ask}
${nextHint ? `Это подсказка №${nextHint} из 3. ${nextHint === 1 ? 'Самая общая: куда смотреть.' : nextHint === 2 ? 'Конкретнее: какой закон или шаг применить.' : 'Последняя: разбери первый шаг решения на похожем примере с другими числами, но ответ этой задачи не называй и посоветуй спросить преподавателя в обсуждении, если всё ещё трудно.'}` : ''}

Сначала про себя реши задачу и проверь, что подсказка ведёт к верному ответу, — это поле "plan", студент его не увидит.
Верни {"plan": "черновик для себя", "text": "ответ студенту", "chips": ["короткая кнопка-продолжение", ...]} — 2–3 chips по 2–4 слова,
например "Проверь мой ход", "Ещё пример", "Почему так?".
Если в конце ответа ты задаёшь вопрос на понимание с короткими вариантами, добавь "options": 2–4 взаимоисключающих варианта
до 60 символов, ровно к этому вопросу (например "Вырастет", "Упадёт", "Не изменится"). Иначе options не добавляй.
Если стоит посмотреть на конкретный ползунок или прибор тренажёра, добавь "point": {"target": "его подпись из показаний",
"note": "что заметить, до 80 символов"} — тренажёр подсветит его. Ответ в note не называй.
Если объяснение — про зависимость одной величины от другой и график поможет понять, добавь поле "plot":
{"title": "...", "xLabel": "t, с", "yLabel": "v, м/с", "x": [0, 10],
 "curves": [{"label": "...", "expr": "v0 + a*x"}],
 "params": [{"name": "a", "label": "ускорение, м/с²", "min": -5, "max": 5, "value": 2}, ...]}
Переменная по оси — всегда x; в expr только числа, x, имена из params, pi, e, + - * / ^ и функции
sin cos tan exp ln log sqrt abs. До 3 кривых и 4 параметров — студент двигает их ползунками.
График — это доска: можно добавить "marks" (до 8) — {"type": "point", "x": ..., "y": ..., "label": "вершина"},
{"type": "segment", "x": ..., "y": ..., "x2": ..., "y2": ..., "arrow": true, "label": "Δv"}, {"type": "vline", "x": ...},
{"type": "hline", "y": ...}. Координаты — числа или выражения от params (без x), например "v0/a": отметка едет за ползунком.
Если объясняешь по шагам, добавь "steps": ["что видно на шаге 1", "шаг 2", ...] (2–6, до 160 символов) и у кривых и
отметок поле "step": номер шага, на котором они появляются. Студент листает шаги кнопкой «Дальше».
Не рисуй график с ответом задания и не добавляй его, если он не нужен.`, SYSTEM, input.locale ?? 'ru') as Record<string, unknown>;
  const text = clip(raw.text, 2000);
  if (!text) throw new LmsError('Наставник задумался и не ответил. Попробуйте ещё раз.');
  const chips = (Array.isArray(raw.chips) ? raw.chips : []).map((x) => clip(x, 40)).filter(Boolean).slice(0, 3);
  const student = input.question.trim() ? await save(input.userId, input.topicId, input.blockId, 'student', input.question.trim().slice(0, 1000), null) : null;
  const tutor = await save(input.userId, input.topicId, input.blockId, 'tutor', text, nextHint, parseTutorPlot(raw.plot));
  return { student, tutor, chips, options: answerOptions(raw.options), point: pointOf(raw.point, c.simState ?? '') };
}

/** Варианты ответа: без пустых и повторов; меньше двух — не вариант выбора. */
export function answerOptions(raw: unknown): string[] {
  const seen = new Set<string>();
  const out = (Array.isArray(raw) ? raw : []).map((x) => clip(x, 60))
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 4);
  return out.length >= 2 ? out : [];
}

/** Подсветка только того, что студент реально видит: подпись должна быть в присланных показаниях. */
export function pointOf(raw: unknown, simState: string): { target: string; note: string } | null {
  if (!raw || typeof raw !== 'object' || !simState) return null;
  const r = raw as Record<string, unknown>;
  const target = clip(r.target, 80);
  if (!target || !simState.toLowerCase().includes(target.toLowerCase())) return null;
  return { target, note: clip(r.note, 120) };
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
