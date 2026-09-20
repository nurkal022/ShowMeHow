import { db } from '../db/client';
import { assignmentTitle, bodyFromRow, ASSIGNMENT_TYPE_LABELS } from '../lms/block-schema';
import { RISK_LABELS, studentRisks, teacherScorecard } from './reports';

/**
 * Наборы данных для вопросов администрации на естественном языке. Модель не пишет SQL:
 * она выбирает набор, фильтры, группировку и сортировку из описаний ниже, а сервер
 * применяет их к готовым строкам. Так вопрос не может ни сломать базу, ни увидеть чужую школу.
 */

export type ColumnType = 'text' | 'number' | 'percent' | 'hours' | 'days' | 'date';
export interface Column { key: string; label: string; type: ColumnType }
export type Row = Record<string, string | number | null>;
export interface Dataset { key: string; title: string; about: string; columns: Column[] }

const POINTS = `NULLIF(CASE WHEN b.payload->>'points' ~ '^[0-9]+$' THEN (b.payload->>'points')::int ELSE 0 END, 0)`;
const DAY = 86_400_000;
const pct = (v: string | number | null) => (v === null ? null : Math.round(Number(v) * 100));
const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);

export const DATASETS: Dataset[] = [
  { key: 'students', title: 'Ученики', about: 'каждый ученик: класс, риск отставания, средний балл, сдано заданий, пропущенные сроки, дней без захода', columns: [
    { key: 'name', label: 'Ученик', type: 'text' }, { key: 'group', label: 'Класс', type: 'text' },
    { key: 'risk', label: 'Риск', type: 'number' }, { key: 'riskLevel', label: 'Уровень риска', type: 'text' },
    { key: 'avg', label: 'Средний балл', type: 'percent' }, { key: 'recent', label: 'Балл за последние работы', type: 'percent' },
    { key: 'done', label: 'Сдано', type: 'number' }, { key: 'tasks', label: 'Заданий', type: 'number' },
    { key: 'completion', label: 'Выполнено', type: 'percent' }, { key: 'missed', label: 'Пропущено сроков', type: 'number' },
    { key: 'idleDays', label: 'Дней без захода', type: 'days' }, { key: 'reasons', label: 'Причины риска', type: 'text' },
  ] },
  { key: 'groups', title: 'Классы', about: 'каждый класс/группа: учеников, активных за 7 дней, средний балл, сдано за 30 дней, ждут проверки, выполнение, учителя', columns: [
    { key: 'group', label: 'Класс', type: 'text' }, { key: 'teachers', label: 'Учителя', type: 'text' },
    { key: 'students', label: 'Учеников', type: 'number' }, { key: 'active7', label: 'Активны за 7 дней', type: 'number' },
    { key: 'activeShare', label: 'Доля активных', type: 'percent' }, { key: 'avg', label: 'Средний балл', type: 'percent' },
    { key: 'submitted30', label: 'Сдано за 30 дней', type: 'number' }, { key: 'pending', label: 'Ждут проверки', type: 'number' },
    { key: 'highRisk', label: 'Учеников с высоким риском', type: 'number' },
  ] },
  { key: 'teachers', title: 'Учителя', about: 'каждый учитель за 30 дней: курсы, учеников, средний балл учеников, проверено работ, медиана часов до проверки, доля работ с комментарием, долг по проверке, разборы уроков, доля активных учеников', columns: [
    { key: 'teacher', label: 'Учитель', type: 'text' }, { key: 'groups', label: 'Группы', type: 'text' },
    { key: 'courses', label: 'Курсов', type: 'number' }, { key: 'published', label: 'Опубликовано', type: 'number' },
    { key: 'students', label: 'Учеников', type: 'number' }, { key: 'avg', label: 'Средний балл учеников', type: 'percent' },
    { key: 'graded', label: 'Проверено за 30 дней', type: 'number' }, { key: 'medianHours', label: 'Часов до проверки (медиана)', type: 'hours' },
    { key: 'commentShare', label: 'С комментарием', type: 'percent' }, { key: 'pending', label: 'Ждут проверки', type: 'number' },
    { key: 'oldestPendingDays', label: 'Самая давняя работа, дн.', type: 'days' }, { key: 'debriefs', label: 'Разборов уроков', type: 'number' },
    { key: 'activeShare', label: 'Активных учеников', type: 'percent' },
  ] },
  { key: 'courses', title: 'Курсы', about: 'каждый курс: предмет, автор, статус, классы, тем, учеников, прохождение тем, средний балл, ждут проверки', columns: [
    { key: 'course', label: 'Курс', type: 'text' }, { key: 'subject', label: 'Предмет', type: 'text' }, { key: 'teacher', label: 'Учитель', type: 'text' },
    { key: 'status', label: 'Статус', type: 'text' }, { key: 'groups', label: 'Классы', type: 'text' },
    { key: 'topics', label: 'Тем', type: 'number' }, { key: 'students', label: 'Учеников', type: 'number' },
    { key: 'progress', label: 'Прохождение', type: 'percent' }, { key: 'avg', label: 'Средний балл', type: 'percent' },
    { key: 'pending', label: 'Ждут проверки', type: 'number' },
  ] },
  { key: 'assignments', title: 'Задания', about: 'каждое задание опубликованных курсов: курс, предмет, тема, тип, сдали, средний результат, доля полностью верных', columns: [
    { key: 'task', label: 'Задание', type: 'text' }, { key: 'course', label: 'Курс', type: 'text' }, { key: 'subject', label: 'Предмет', type: 'text' },
    { key: 'topic', label: 'Тема', type: 'text' }, { key: 'type', label: 'Тип', type: 'text' },
    { key: 'answered', label: 'Сдали', type: 'number' }, { key: 'avg', label: 'Средний результат', type: 'percent' },
    { key: 'fullShare', label: 'Полностью верно', type: 'percent' },
  ] },
  { key: 'daily', title: 'По дням', about: 'каждый день за последние 60 дней: сдано работ, проверено, открыто уроков, активных учеников', columns: [
    { key: 'date', label: 'Дата', type: 'date' }, { key: 'submitted', label: 'Сдано', type: 'number' },
    { key: 'graded', label: 'Проверено', type: 'number' }, { key: 'opened', label: 'Открыто уроков', type: 'number' },
    { key: 'active', label: 'Активных учеников', type: 'number' },
  ] },
];

export function datasetOf(key: string): Dataset | undefined {
  return DATASETS.find((d) => d.key === key);
}

export async function loadDataset(orgId: string, key: string): Promise<Row[]> {
  switch (key) {
    case 'students': {
      const risks = await studentRisks(orgId);
      return risks.map((r) => ({
        name: r.name, group: r.groups.join(', ') || '—', risk: r.score, riskLevel: RISK_LABELS[r.level],
        avg: r.avgPercent, recent: r.recentPercent, done: r.done, tasks: r.tasks,
        completion: r.tasks ? Math.round((r.done / r.tasks) * 100) : null, missed: r.missed,
        idleDays: daysAgo(r.lastActive), reasons: r.factors.map((f) => f.label).join('; ') || '—',
      }));
    }
    case 'groups': {
      const [{ rows }, risks] = await Promise.all([db().query<{
        title: string; teachers: string[]; students: number; active: number; avg: string | null; submitted: number; pending: number;
      }>(
        `SELECT g.title,
           ARRAY(SELECT coalesce(u.display_name, u.email, u.login) FROM group_teachers gt JOIN users u ON u.id = gt.user_id WHERE gt.group_id = g.id ORDER BY 1) AS teachers,
           (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS students,
           (SELECT count(DISTINCT gm.user_id)::int FROM group_members gm WHERE gm.group_id = g.id AND (
              EXISTS (SELECT 1 FROM topic_views v WHERE v.user_id = gm.user_id AND v.last_at > now() - interval '7 days')
              OR EXISTS (SELECT 1 FROM submissions s WHERE s.student_id = gm.user_id AND s.updated_at > now() - interval '7 days'))) AS active,
           (SELECT avg(s.score / ${POINTS}) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN group_members gm ON gm.user_id = s.student_id AND gm.group_id = g.id
              WHERE s.status = 'graded') AS avg,
           (SELECT count(*)::int FROM submissions s JOIN group_members gm ON gm.user_id = s.student_id AND gm.group_id = g.id
              WHERE s.submitted_at > now() - interval '30 days') AS submitted,
           (SELECT count(*)::int FROM submissions s JOIN group_members gm ON gm.user_id = s.student_id AND gm.group_id = g.id
              WHERE s.status = 'submitted') AS pending
         FROM groups g WHERE g.org_id = $1 AND g.archived_at IS NULL ORDER BY g.title`, [orgId]), studentRisks(orgId)]);
      return rows.map((g) => ({
        group: g.title, teachers: g.teachers.join(', ') || '—', students: g.students, active7: g.active,
        activeShare: g.students ? Math.round((g.active / g.students) * 100) : null, avg: pct(g.avg),
        submitted30: g.submitted, pending: g.pending,
        highRisk: risks.filter((r) => r.level === 'high' && r.groups.includes(g.title)).length,
      }));
    }
    case 'teachers':
      return (await teacherScorecard(orgId, 30)).map((t) => ({
        teacher: t.name, groups: t.groups.join(', ') || '—', courses: t.courses, published: t.published, students: t.students,
        avg: t.avgPercent, graded: t.graded, medianHours: t.medianHours, commentShare: t.commentShare, pending: t.pending,
        oldestPendingDays: t.oldestPendingDays, debriefs: t.debriefs, activeShare: t.activeShare,
      }));
    case 'courses': {
      const { rows } = await db().query<{
        title: string; subject: string; owner: string; status: string; groups: string[]; topics: number; students: number;
        views: number; avg: string | null; pending: number;
      }>(
        `SELECT c.title, c.subject, coalesce(u.display_name, u.email, u.login) AS owner, c.status,
           ARRAY(SELECT g.title FROM course_groups cg JOIN groups g ON g.id = cg.group_id WHERE cg.course_id = c.id ORDER BY g.title) AS groups,
           (SELECT count(*)::int FROM topics t WHERE t.course_id = c.id) AS topics,
           (SELECT count(DISTINCT gm.user_id)::int FROM course_groups cg JOIN group_members gm ON gm.group_id = cg.group_id WHERE cg.course_id = c.id) AS students,
           (SELECT count(*)::int FROM topic_views v JOIN topics t ON t.id = v.topic_id WHERE t.course_id = c.id) AS views,
           (SELECT avg(s.score / ${POINTS}) FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
              WHERE t.course_id = c.id AND s.status = 'graded') AS avg,
           (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
              WHERE t.course_id = c.id AND s.status = 'submitted') AS pending
         FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.org_id = $1 AND c.status <> 'archived' ORDER BY c.title`, [orgId]);
      const status: Record<string, string> = { published: 'опубликован', draft: 'черновик' };
      return rows.map((c) => ({
        course: c.title, subject: c.subject || '—', teacher: c.owner, status: status[c.status] ?? c.status, groups: c.groups.join(', ') || '—',
        topics: c.topics, students: c.students,
        progress: c.students && c.topics ? Math.min(100, Math.round((c.views / (c.students * c.topics)) * 100)) : null,
        avg: pct(c.avg), pending: c.pending,
      }));
    }
    case 'assignments': {
      const { rows } = await db().query<{ payload: unknown; course: string; subject: string; topic: string; answered: number; avg: string | null; full: number; graded: number }>(
        `SELECT b.payload, c.title AS course, c.subject, t.title AS topic,
           count(s.id) FILTER (WHERE s.status IN ('submitted', 'graded'))::int AS answered,
           avg(coalesce(s.score, s.auto_score) / ${POINTS}) FILTER (WHERE coalesce(s.score, s.auto_score) IS NOT NULL) AS avg,
           count(s.id) FILTER (WHERE coalesce(s.score, s.auto_score) >= ${POINTS})::int AS full,
           count(s.id) FILTER (WHERE coalesce(s.score, s.auto_score) IS NOT NULL)::int AS graded
         FROM blocks b JOIN topics t ON t.id = b.topic_id JOIN courses c ON c.id = t.course_id
         LEFT JOIN submissions s ON s.block_id = b.id AND s.status <> 'draft'
         WHERE c.org_id = $1 AND c.status = 'published' AND b.kind = 'assignment'
         GROUP BY b.id, b.payload, c.title, c.subject, t.title, t.position, b.position ORDER BY c.title, t.position, b.position LIMIT 500`, [orgId]);
      return rows.map((r) => {
        const body = bodyFromRow('assignment', r.payload);
        const p = body.kind === 'assignment' ? body.payload : null;
        return {
          task: p ? assignmentTitle(p.prompt) : 'Задание', course: r.course, subject: r.subject || '—', topic: r.topic,
          type: p ? ASSIGNMENT_TYPE_LABELS[p.spec.type] : '—', answered: r.answered, avg: pct(r.avg),
          fullShare: r.graded ? Math.round((r.full / r.graded) * 100) : null,
        };
      });
    }
    case 'daily': {
      const { rows } = await db().query<{ day: string; submitted: number; graded: number; opened: number; active: number }>(
        `WITH sub AS (SELECT s.* FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
                      JOIN courses c ON c.id = t.course_id WHERE c.org_id = $1),
              vw AS (SELECT v.* FROM topic_views v JOIN topics t ON t.id = v.topic_id JOIN courses c ON c.id = t.course_id WHERE c.org_id = $1)
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           (SELECT count(*)::int FROM sub WHERE sub.submitted_at::date = d.day) AS submitted,
           (SELECT count(*)::int FROM sub WHERE sub.graded_at::date = d.day) AS graded,
           (SELECT count(*)::int FROM vw WHERE vw.first_at::date = d.day) AS opened,
           (SELECT count(DISTINCT x)::int FROM (SELECT student_id AS x FROM sub WHERE sub.updated_at::date = d.day
                                                UNION SELECT user_id FROM vw WHERE vw.last_at::date = d.day) q) AS active
         FROM generate_series(current_date - 59, current_date, interval '1 day') d(day) ORDER BY d.day`, [orgId]);
      return rows.map((r) => ({ date: r.day, submitted: r.submitted, graded: r.graded, opened: r.opened, active: r.active }));
    }
    default:
      return [];
  }
}

/* ------------------------------ план запроса ------------------------------ */

export type FilterOp = 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';
export interface QueryPlan {
  dataset: string;
  title: string;
  filters: { column: string; op: FilterOp; value: string | number }[];
  groupBy: { column: string; metrics: { column: string; agg: 'avg' | 'sum' | 'count' | 'min' | 'max'; label: string }[] } | null;
  sort: { column: string; dir: 'asc' | 'desc' } | null;
  limit: number;
  columns: string[];
  chart: { type: 'bar' | 'line' | 'none'; x: string; y: string[] };
}

export interface QueryResult { plan: QueryPlan; columns: Column[]; rows: Row[]; total: number }

const OPS = new Set<FilterOp>(['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte']);
const AGGS = new Set(['avg', 'sum', 'count', 'min', 'max']);

/** Приводит план от модели к допустимому: неизвестные колонки и операции выбрасываются. */
export function sanitizePlan(raw: unknown): QueryPlan | null {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const ds = datasetOf(String(o.dataset ?? ''));
  if (!ds) return null;
  const has = (c: unknown): c is string => typeof c === 'string' && ds.columns.some((x) => x.key === c);
  const filters = (Array.isArray(o.filters) ? o.filters : []).slice(0, 6).flatMap((f) => {
    const x = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>;
    const v = x.value;
    return has(x.column) && OPS.has(x.op as FilterOp) && (typeof v === 'string' || typeof v === 'number')
      ? [{ column: x.column, op: x.op as FilterOp, value: typeof v === 'string' ? v.slice(0, 100) : v }] : [];
  });
  const g = (typeof o.groupBy === 'object' && o.groupBy !== null ? o.groupBy : null) as Record<string, unknown> | null;
  const groupBy = g && has(g.column)
    ? {
      column: g.column,
      metrics: (Array.isArray(g.metrics) ? g.metrics : []).slice(0, 4).flatMap((m) => {
        const x = (typeof m === 'object' && m !== null ? m : {}) as Record<string, unknown>;
        return has(x.column) && AGGS.has(String(x.agg))
          ? [{ column: x.column, agg: x.agg as 'avg', label: typeof x.label === 'string' && x.label.trim() ? x.label.slice(0, 60) : `${x.agg}(${x.column})` }] : [];
      }),
    }
    : null;
  const outKeys = groupBy ? [groupBy.column, ...groupBy.metrics.map((_, i) => `m${i}`)] : ds.columns.map((c) => c.key);
  const s = (typeof o.sort === 'object' && o.sort !== null ? o.sort : null) as Record<string, unknown> | null;
  const sort = s && typeof s.column === 'string' && outKeys.includes(s.column) ? { column: s.column, dir: s.dir === 'asc' ? 'asc' as const : 'desc' as const } : null;
  const cols = (Array.isArray(o.columns) ? o.columns : []).filter((c): c is string => typeof c === 'string' && outKeys.includes(c));
  const ch = (typeof o.chart === 'object' && o.chart !== null ? o.chart : {}) as Record<string, unknown>;
  const chartY = (Array.isArray(ch.y) ? ch.y : []).filter((c): c is string => typeof c === 'string' && outKeys.includes(c)).slice(0, 3);
  const chartType = ch.type === 'bar' || ch.type === 'line' ? ch.type : 'none';
  const limit = Number(o.limit);
  return {
    dataset: ds.key, title: typeof o.title === 'string' ? o.title.slice(0, 160) : ds.title, filters, groupBy, sort,
    limit: Number.isInteger(limit) ? Math.max(1, Math.min(200, limit)) : 50,
    columns: groupBy ? outKeys : cols.length ? cols : outKeys,
    chart: { type: chartType && typeof ch.x === 'string' && outKeys.includes(ch.x) && chartY.length ? chartType : 'none', x: typeof ch.x === 'string' ? ch.x : '', y: chartY },
  };
}

function matches(v: string | number | null, op: FilterOp, want: string | number): boolean {
  if (v === null) return op === 'neq';
  if (op === 'contains') return String(v).toLowerCase().includes(String(want).toLowerCase());
  const num = typeof v === 'number' && !Number.isNaN(Number(want));
  const a = num ? v : String(v).toLowerCase();
  const b = num ? Number(want) : String(want).toLowerCase();
  switch (op) {
    case 'eq': return num ? a === b : String(a).split(', ').includes(String(b)) || a === b;
    case 'neq': return a !== b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    default: return true;
  }
}

export async function runPlan(orgId: string, plan: QueryPlan): Promise<QueryResult> {
  const ds = datasetOf(plan.dataset)!;
  let rows = (await loadDataset(orgId, ds.key)).filter((r) => plan.filters.every((f) => matches(r[f.column] ?? null, f.op, f.value)));
  let columns: Column[] = ds.columns;
  if (plan.groupBy) {
    const g = plan.groupBy;
    const buckets = new Map<string, Row[]>();
    for (const r of rows) {
      // Ученик в двух классах попадает в оба.
      for (const k of String(r[g.column] ?? '—').split(', ')) buckets.set(k, [...(buckets.get(k) ?? []), r]);
    }
    rows = [...buckets.entries()].map(([k, list]) => {
      const out: Row = { [g.column]: k };
      g.metrics.forEach((m, i) => {
        const vals = list.map((r) => r[m.column]).filter((v): v is number => typeof v === 'number');
        out[`m${i}`] = m.agg === 'count' ? list.length
          : !vals.length ? null
          : m.agg === 'sum' ? vals.reduce((a, b) => a + b, 0)
          : m.agg === 'min' ? Math.min(...vals) : m.agg === 'max' ? Math.max(...vals)
          : Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
      });
      return out;
    });
    const base = ds.columns.find((c) => c.key === g.column)!;
    columns = [base, ...g.metrics.map((m, i) => {
      const src = ds.columns.find((c) => c.key === m.column)!;
      return { key: `m${i}`, label: m.label, type: m.agg === 'count' ? 'number' as const : src.type };
    })];
  }
  if (plan.sort) {
    const { column, dir } = plan.sort;
    rows.sort((a, b) => {
      const x = a[column];
      const y = b[column];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ru', { numeric: true });
      return dir === 'asc' ? c : -c;
    });
  }
  const total = rows.length;
  return {
    plan, total, rows: rows.slice(0, plan.limit),
    columns: plan.columns.map((k) => columns.find((c) => c.key === k)).filter((c): c is Column => !!c),
  };
}
