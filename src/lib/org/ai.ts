import { db } from '../db/client';
import { askJson } from '../lms/ai';
import { LmsError } from '../lms/types';
import { DATASETS, sanitizePlan, type QueryPlan, type QueryResult } from './datasets';
import type { StudentRisk, WeekFacts } from './reports';

/**
 * Тексты помощника для администрации: недельный отчёт, совет по ученику из зоны риска,
 * план и вывод для вопроса на естественном языке. Цифры считает сервер, модель их только
 * читает и пересказывает — придумать число она не может.
 */

const SYSTEM = `Ты — аналитик школы и опытный завуч. Пишешь для директора по-русски: коротко, по делу, с конкретными именами
классов и учителей из данных. Не выдумывай цифры — используй только те, что даны. Отвечай только JSON.`;

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, n: number, max = 500) => (Array.isArray(v) ? v.map((x) => clip(x, max)).filter(Boolean).slice(0, n) : []);

/* ------------------------------ недельный отчёт ------------------------------ */

export interface WeekSummary { headline: string; highlights: string[]; concerns: string[]; actions: string[]; teachers: string[] }
export interface WeekReport { weekStart: string; facts: WeekFacts; summary: WeekSummary | null; createdAt: string }

export async function writeWeekSummary(facts: WeekFacts): Promise<WeekSummary> {
  const compact = {
    неделя: `${facts.weekStart} — ${facts.weekEnd}`, учеников_всего: facts.students, эта_неделя: facts.now, прошлая_неделя: facts.prev,
    классы: facts.groups.map((g) => ({ класс: g.title, учеников: g.students, активны: g.active, активны_раньше: g.prevActive, сдано: g.submitted, сдано_раньше: g.prevSubmitted, средний_процент: g.avgPercent })),
    учителя: facts.teachers.map((t) => ({ учитель: t.name, проверено_за_неделю: t.graded, ждут_проверки: t.pending, самая_давняя_дней: t.oldestPendingDays, часов_до_проверки: t.medianHours, с_комментарием_процент: t.commentShare, разборов: t.debriefs, средний_балл_учеников: t.avgPercent })),
    риски: facts.risk, курсы: facts.courses,
  };
  const raw = await askJson(`Составь еженедельный отчёт для директора по данным школы.
${JSON.stringify(compact).slice(0, 16000)}

Верни {"headline": "главное за неделю одним предложением",
"highlights": ["что хорошо, с цифрами и сравнением с прошлой неделей", ...] (2–4),
"concerns": ["что тревожит: класс, учитель или группа учеников и почему", ...] (1–4),
"actions": ["конкретное действие директора или завуча на эту неделю", ...] (2–4),
"teachers": ["короткая оценка работы учителя: имя — что хорошо и что улучшить", ...] (по одному на учителя)}`, SYSTEM) as Record<string, unknown>;
  return {
    headline: clip(raw.headline, 400) || 'Отчёт за неделю готов.',
    highlights: list(raw.highlights, 4), concerns: list(raw.concerns, 4), actions: list(raw.actions, 4), teachers: list(raw.teachers, 20),
  };
}

export async function saveWeekReport(orgId: string, authorId: string, facts: WeekFacts, summary: WeekSummary | null): Promise<void> {
  await db().query(
    `INSERT INTO org_reports (org_id, week_start, facts, summary, author_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, week_start) DO UPDATE SET facts = EXCLUDED.facts, summary = EXCLUDED.summary,
       author_id = EXCLUDED.author_id, created_at = now()`,
    [orgId, facts.weekStart, JSON.stringify(facts), summary ? JSON.stringify(summary) : null, authorId]);
}

export async function getWeekReport(orgId: string, weekStart: string): Promise<WeekReport | null> {
  const { rows } = await db().query<{ facts: WeekFacts; summary: WeekSummary | null; created_at: Date }>(
    'SELECT facts, summary, created_at FROM org_reports WHERE org_id = $1 AND week_start = $2', [orgId, weekStart]);
  return rows[0] ? { weekStart, facts: rows[0].facts, summary: rows[0].summary, createdAt: rows[0].created_at.toISOString() } : null;
}

export async function listWeekReports(orgId: string): Promise<{ weekStart: string; headline: string | null }[]> {
  const { rows } = await db().query<{ week_start: string; headline: string | null }>(
    `SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start, summary->>'headline' AS headline
     FROM org_reports WHERE org_id = $1 ORDER BY week_start DESC LIMIT 20`, [orgId]);
  return rows.map((r) => ({ weekStart: r.week_start, headline: r.headline }));
}

/* ---------------------------- совет по ученику ---------------------------- */

export interface RiskAdvice { summary: string; steps: string[]; message: string }

export async function adviseOnStudent(r: StudentRisk): Promise<RiskAdvice> {
  const raw = await askJson(`Ученик в зоне риска отставания. Предложи, что делать классному руководителю и учителю.
Данные (имя сохраняй как есть): ${JSON.stringify({
    ученик: r.name, класс: r.groups.join(', '), балл_риска: r.score, причины: r.factors.map((f) => f.label),
    средний_балл: r.avgPercent, последние_работы: r.recentPercent, сдано: `${r.done} из ${r.tasks}`, пропущено_сроков: r.missed,
    ни_разу_не_входил: r.neverLoggedIn,
  })}

Верни {"summary": "в чём риск одним-двумя предложениями", "steps": ["конкретный шаг", ...] (2–4),
"message": "короткое тёплое сообщение ученику или родителям от имени учителя, 2–3 предложения"}`, SYSTEM) as Record<string, unknown>;
  return { summary: clip(raw.summary, 600), steps: list(raw.steps, 4, 300), message: clip(raw.message, 800) };
}

/* ------------------------- вопрос на естественном языке ------------------------- */

const CATALOG = DATASETS.map((d) => `- "${d.key}" — ${d.about}. Колонки: ${d.columns.map((c) => `${c.key} (${c.label}, ${c.type})`).join(', ')}`).join('\n');

export async function planQuestion(question: string): Promise<QueryPlan> {
  const raw = await askJson(`Директор задаёт вопрос о школе. Выбери набор данных и опиши, как получить ответ таблицей.
Наборы:
${CATALOG}

Вопрос: "${question.slice(0, 500)}"

Верни JSON:
{"dataset": "ключ набора", "title": "заголовок таблицы",
 "filters": [{"column": "ключ", "op": "eq"|"neq"|"contains"|"gt"|"gte"|"lt"|"lte", "value": строка или число}],
 "groupBy": null или {"column": "ключ текстовой колонки", "metrics": [{"column": "ключ", "agg": "avg"|"sum"|"count"|"min"|"max", "label": "подпись"}]},
 "sort": {"column": "ключ (при groupBy — ключ группы или m0, m1…)", "dir": "asc"|"desc"} или null,
 "limit": число строк (по умолчанию 50, «топ-5» — 5),
 "columns": ["ключи колонок в нужном порядке — только нужные для ответа"],
 "chart": {"type": "bar"|"line"|"none", "x": "ключ", "y": ["ключ числовой колонки", ...]}}
Проценты в данных — числа от 0 до 100. Уровни риска: "высокий", "средний", "низкий", "нет". Для динамики по дням — набор "daily" и "line".`,
  `Ты переводишь вопросы директора школы в запрос к готовым таблицам. Отвечай только JSON.`);
  const plan = sanitizePlan(raw);
  if (!plan) throw new LmsError('Не понял, по каким данным ответить. Спросите про учеников, классы, учителей, курсы, задания или динамику по дням.');
  return plan;
}

export async function explainResult(question: string, result: QueryResult): Promise<{ answer: string; points: string[] }> {
  if (result.rows.length === 0) return { answer: 'Под условия вопроса не попала ни одна строка.', points: [] };
  const raw = await askJson(`Вопрос директора: "${question.slice(0, 500)}"
Таблица «${result.plan.title}» (${result.total} строк, показано ${result.rows.length}):
Колонки: ${result.columns.map((c) => `${c.key}=${c.label}`).join(', ')}
${JSON.stringify(result.rows.slice(0, 40)).slice(0, 12000)}

Ответь на вопрос по этим данным. Верни {"answer": "прямой ответ в 1–3 предложениях с цифрами", "points": ["наблюдение или вывод", ...] (0–3)}`, SYSTEM) as Record<string, unknown>;
  return { answer: clip(raw.answer, 1200), points: list(raw.points, 3, 400) };
}
