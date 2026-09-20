import crypto from 'node:crypto';
import { db } from '../db/client';
import { askJson } from './ai';
import { assignmentTitle, bodyFromRow, ASSIGNMENT_TYPE_LABELS, type AssignmentPayload } from './block-schema';
import { courseStudents } from './courses';
import { LmsError } from './types';
import type { Answer } from './answers';

/**
 * Разбор урока: по каждому заданию темы — сколько сдали, средний балл, какие неверные
 * ответы встречаются чаще всего и примеры слабых развёрнутых ответов. Помощник превращает
 * цифры в выводы: что класс понял, какие ошибки массовые, что повторить. Разбор хранится —
 * к нему возвращается учитель, и его видит администратор (сколько разборов делает учитель).
 */

export interface TaskDebriefStat {
  blockId: string; title: string; type: string; points: number;
  answered: number; avgPercent: number | null; fullShare: number | null; pending: number;
  /** Самые частые неверные ответы: текст и сколько раз. */
  wrong: { answer: string; count: number }[];
}

export interface DebriefStats {
  students: number; opened: number; finished: number;
  avgPercent: number | null;
  tasks: TaskDebriefStat[];
}

export interface Misconception { title: string; detail: string; share: number; tasks: string[] }

export interface DebriefSummary {
  headline: string;
  understood: string[];
  misconceptions: Misconception[];
  nextSteps: string[];
  /** Для мини-урока «Работа над ошибками»: что объяснить заново. */
  remedial: string;
}

export interface Debrief {
  id: string; topicId: string; courseId: string; authorId: string | null;
  stats: DebriefStats; summary: DebriefSummary; createdAt: string;
}

const MAX_SAMPLES = 8;

function answerText(p: AssignmentPayload, a: Answer): string {
  const s = p.spec;
  if (a.type === 'choice' && s.type === 'choice') {
    return a.selected.map((id) => s.options.find((o) => o.id === id)?.text ?? '?').join(' + ') || '(пусто)';
  }
  if (a.type === 'number') return a.value;
  if (a.type === 'short') return a.text;
  if (a.type === 'gaps') return a.values.join(' / ');
  if (a.type === 'text') return a.text;
  if (a.type === 'table') return a.rows.map((r) => r.join(' | ')).join('; ');
  if (a.type === 'order' && s.type === 'order') return a.order.map((id) => s.items.find((i) => i.id === id)?.text ?? '?').join(' → ');
  if (a.type === 'match' && s.type === 'match') {
    return Object.entries(a.pairs).map(([l, r]) => `${s.pairs.find((p) => p.id === l)?.left ?? '?'} — ${s.pairs.find((p) => p.rightId === r)?.right ?? '?'}`).join('; ');
  }
  return '';
}

export async function topicDebriefStats(courseId: string, topicId: string): Promise<DebriefStats> {
  const students = await courseStudents(courseId);
  const ids = students.map((s) => s.id);
  const [blocks, subs, opened] = await Promise.all([
    db().query<{ id: string; payload: unknown }>(
      `SELECT id, payload FROM blocks WHERE topic_id = $1 AND kind = 'assignment' ORDER BY position`, [topicId]),
    db().query<{ block_id: string; student_id: string; status: string; answer: Answer; score: string | null; auto_score: string | null }>(
      `SELECT s.block_id, s.student_id, s.status, s.answer, s.score, s.auto_score FROM submissions s
       JOIN blocks b ON b.id = s.block_id WHERE b.topic_id = $1 AND s.student_id = ANY($2::uuid[]) AND s.status <> 'draft'`,
      [topicId, ids]),
    db().query<{ n: number }>('SELECT count(*)::int AS n FROM topic_views WHERE topic_id = $1 AND user_id = ANY($2::uuid[])', [topicId, ids]),
  ]);
  const tasks: TaskDebriefStat[] = [];
  const doneBy = new Map<string, number>();
  let sumPct = 0;
  let nPct = 0;
  for (const b of blocks.rows) {
    const body = bodyFromRow('assignment', b.payload);
    if (body.kind !== 'assignment') continue;
    const p = body.payload;
    const mine = subs.rows.filter((s) => s.block_id === b.id);
    for (const s of mine) if (s.status === 'submitted' || s.status === 'graded') doneBy.set(s.student_id, (doneBy.get(s.student_id) ?? 0) + 1);
    const scored = mine.map((s) => (s.score ?? s.auto_score) === null ? null : Number(s.score ?? s.auto_score)).filter((x): x is number => x !== null);
    const pct = p.points && scored.length ? Math.round((scored.reduce((a, x) => a + x, 0) / scored.length / p.points) * 100) : null;
    if (pct !== null) { sumPct += pct; nPct++; }
    const wrongCount = new Map<string, number>();
    for (const s of mine) {
      const sc = s.score ?? s.auto_score;
      const full = sc !== null && Number(sc) >= p.points;
      if (full || p.spec.type === 'table') continue;
      const text = answerText(p, s.answer).replace(/\s+/g, ' ').trim().slice(0, p.spec.type === 'text' ? 400 : 80);
      if (text) wrongCount.set(text, (wrongCount.get(text) ?? 0) + 1);
    }
    tasks.push({
      blockId: b.id, title: assignmentTitle(p.prompt) || 'Задание', type: ASSIGNMENT_TYPE_LABELS[p.spec.type], points: p.points,
      answered: mine.length, avgPercent: pct,
      fullShare: scored.length ? Math.round((scored.filter((x) => x >= p.points).length / scored.length) * 100) : null,
      pending: mine.filter((s) => s.status === 'submitted' && s.score === null && s.auto_score === null).length,
      wrong: [...wrongCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SAMPLES).map(([answer, count]) => ({ answer, count })),
    });
  }
  return {
    students: students.length, opened: opened.rows[0].n,
    finished: [...doneBy.values()].filter((n) => n >= tasks.length && tasks.length > 0).length,
    avgPercent: nPct ? Math.round(sumPct / nPct) : null, tasks,
  };
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, n: number, max = 400) => (Array.isArray(v) ? v.map((x) => clip(x, max)).filter(Boolean).slice(0, n) : []);

export async function createDebrief(input: {
  orgId: string; courseId: string; topicId: string; topicTitle: string; courseTitle: string; subject: string; authorId: string;
}): Promise<Debrief> {
  const stats = await topicDebriefStats(input.courseId, input.topicId);
  const answered = stats.tasks.reduce((a, t) => a + t.answered, 0);
  if (stats.tasks.length === 0) throw new LmsError('В этой теме нет заданий — разбирать нечего.');
  if (answered === 0) throw new LmsError('Ученики ещё ничего не сдали по этой теме. Разбор появится после первых ответов.');
  const tasksForModel = stats.tasks.map((t) => ({
    задание: t.title, тип: t.type, баллов: t.points, сдали: t.answered, средний_процент: t.avgPercent,
    полностью_верно_процент: t.fullShare, частые_неверные_ответы: t.wrong,
  }));
  const raw = await askJson(`Сделай разбор урока для учителя по итогам ответов класса.
Курс: ${input.courseTitle} (${input.subject || 'предмет не указан'})
Тема: ${input.topicTitle}
Учеников: ${stats.students}, открыли тему: ${stats.opened}, сдали все задания: ${stats.finished}, средний результат: ${stats.avgPercent ?? '—'}%.
Задания и ответы (имена учеников скрыты):
${JSON.stringify(tasksForModel).slice(0, 14000)}

Найди, что класс понял, и какие ошибки массовые: объясни, какое неверное представление за ними стоит (не «ошиблись в задании 3»,
а «путают период и частоту»). Верни JSON:
{"headline": "одно предложение — главный вывод",
 "understood": ["что усвоено", ...] (1–4),
 "misconceptions": [{"title": "короткое название заблуждения", "detail": "в чём ошибка и как она проявилась", "share": доля_класса_в_процентах, "tasks": ["название задания", ...]}] (0–5, по убыванию доли),
 "nextSteps": ["конкретное действие учителя на следующем уроке", ...] (2–4),
 "remedial": "что и как объяснить заново в мини-уроке «Работа над ошибками», 2–4 предложения"}`,
  'Ты — опытный методист, который помогает учителю понять результаты класса. Пишешь по-русски, конкретно и доброжелательно. Отвечай только JSON.') as Record<string, unknown>;
  const misconceptions = (Array.isArray(raw.misconceptions) ? raw.misconceptions : []).slice(0, 5).flatMap((m): Misconception[] => {
    const o = (typeof m === 'object' && m !== null ? m : {}) as Record<string, unknown>;
    const title = clip(o.title, 200);
    const share = Number(o.share);
    return title ? [{ title, detail: clip(o.detail, 800), share: Number.isFinite(share) ? Math.max(0, Math.min(100, Math.round(share))) : 0, tasks: list(o.tasks, 5, 120) }] : [];
  });
  const summary: DebriefSummary = {
    headline: clip(raw.headline, 400) || 'Разбор готов.',
    understood: list(raw.understood, 4), misconceptions, nextSteps: list(raw.nextSteps, 4), remedial: clip(raw.remedial, 1500),
  };
  const id = crypto.randomUUID();
  const { rows } = await db().query<{ created_at: Date }>(
    `INSERT INTO lesson_debriefs (id, org_id, course_id, topic_id, author_id, stats, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at`,
    [id, input.orgId, input.courseId, input.topicId, input.authorId, JSON.stringify(stats), JSON.stringify(summary)]);
  return { id, topicId: input.topicId, courseId: input.courseId, authorId: input.authorId, stats, summary, createdAt: rows[0].created_at.toISOString() };
}

/** Последний разбор каждой темы курса. */
export async function latestDebriefs(courseId: string): Promise<Map<string, Debrief>> {
  const { rows } = await db().query<{ id: string; topic_id: string; course_id: string; author_id: string | null; stats: DebriefStats; summary: DebriefSummary; created_at: Date }>(
    `SELECT DISTINCT ON (topic_id) id, topic_id, course_id, author_id, stats, summary, created_at
     FROM lesson_debriefs WHERE course_id = $1 ORDER BY topic_id, created_at DESC`, [courseId]);
  return new Map(rows.map((r) => [r.topic_id, {
    id: r.id, topicId: r.topic_id, courseId: r.course_id, authorId: r.author_id, stats: r.stats, summary: r.summary,
    createdAt: r.created_at.toISOString(),
  }]));
}
