import { randomBytes, randomUUID } from 'node:crypto';
import type { GraphicalAbstract } from './article';
import { db } from '../db/client';
import { getMeta } from '../storage';
import { newModelDoc, newPlotDoc, type ResearchKind } from './doc';
import type { ZenodoInfo } from './zenodo';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';

/**
 * Хранилище рабочего места исследователя. Всё принадлежит автору: каждый запрос
 * фильтрует по owner_id, чужое и несуществующее неотличимы (null → 404).
 * Публичный доступ — только по токену и только на чтение.
 */

export class ResearchError extends Error {}

export interface ResearchProject {
  id: string;
  title: string;
  description: string;
  publicToken: string | null;
  /** Запись в Zenodo с DOI; null — не публиковался. */
  zenodo: ZenodoInfo | null;
  /** Графический абстракт проекта: содержание схемы, картинка рисуется кодом. */
  graphical: GraphicalAbstract | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchItem {
  id: string;
  projectId: string | null;
  kind: ResearchKind;
  title: string;
  doc: unknown;
  caption: string;
  publicToken: string | null;
  zenodo: ZenodoInfo | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_TITLE = 200;
const MAX_TEXT = 8000;
/** Документ с вставленной таблицей: сотни тысяч точек не нужны для графика в статье. */
const MAX_DOC_BYTES = 2_000_000;

interface ItemRow {
  id: string; project_id: string | null; kind: ResearchKind; title: string; doc: unknown; caption: string;
  public_token: string | null; zenodo: ZenodoInfo | null; created_at: Date; updated_at: Date;
}
interface ProjectRow {
  id: string; title: string; description: string; public_token: string | null; zenodo: ZenodoInfo | null; graphical: GraphicalAbstract | null; item_count: string | number;
  created_at: Date; updated_at: Date;
}

const ITEM_COLS = 'id, project_id, kind, title, doc, caption, public_token, zenodo, created_at, updated_at';

function toItem(r: ItemRow): ResearchItem {
  return {
    id: r.id, projectId: r.project_id, kind: r.kind, title: r.title, doc: r.doc, caption: r.caption,
    publicToken: r.public_token, zenodo: r.zenodo ?? null,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}
function toProject(r: ProjectRow): ResearchProject {
  return {
    id: r.id, title: r.title, description: r.description, publicToken: r.public_token, zenodo: r.zenodo ?? null, graphical: r.graphical ?? null,
    itemCount: Number(r.item_count),
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

function cleanTitle(v: unknown, fallback?: string): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t && fallback !== undefined) return fallback;
  if (!t) throw new ResearchError('Нужно название.');
  if (t.length > MAX_TITLE) throw new ResearchError(`Название — не длиннее ${MAX_TITLE} символов.`);
  return t;
}
function cleanText(v: unknown): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (t.length > MAX_TEXT) throw new ResearchError(`Текст — не длиннее ${MAX_TEXT} символов.`);
  return t;
}
function cleanDoc(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ResearchError('Некорректный документ.');
  if (JSON.stringify(v).length > MAX_DOC_BYTES) throw new ResearchError('Слишком большой документ: сократите таблицу данных.');
  return v;
}
const newToken = () => randomBytes(12).toString('base64url');

async function ownsProject(ownerId: string, projectId: string): Promise<boolean> {
  const { rowCount } = await db().query('SELECT 1 FROM research_projects WHERE id = $1 AND owner_id = $2', [projectId, ownerId]);
  return !!rowCount;
}

/* --------------------------------- проекты --------------------------------- */

export async function listProjects(ownerId: string): Promise<ResearchProject[]> {
  const { rows } = await db().query<ProjectRow>(
    `SELECT p.id, p.title, p.description, p.public_token, p.zenodo, p.graphical, p.created_at, p.updated_at,
            (SELECT count(*) FROM research_items i WHERE i.project_id = p.id) AS item_count
     FROM research_projects p WHERE p.owner_id = $1 ORDER BY p.updated_at DESC`, [ownerId]);
  return rows.map(toProject);
}

export async function getProject(ownerId: string, id: string): Promise<ResearchProject | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<ProjectRow>(
    `SELECT p.id, p.title, p.description, p.public_token, p.zenodo, p.graphical, p.created_at, p.updated_at,
            (SELECT count(*) FROM research_items i WHERE i.project_id = p.id) AS item_count
     FROM research_projects p WHERE p.id = $1 AND p.owner_id = $2`, [id, ownerId]);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function createProject(ownerId: string, input: { title?: unknown; description?: unknown }): Promise<ResearchProject> {
  const id = randomUUID();
  await db().query('INSERT INTO research_projects (id, owner_id, title, description) VALUES ($1,$2,$3,$4)',
    [id, ownerId, cleanTitle(input.title), cleanText(input.description)]);
  return (await getProject(ownerId, id))!;
}

export async function updateProject(
  ownerId: string, id: string, patch: { title?: unknown; description?: unknown; shared?: unknown; graphical?: unknown },
): Promise<ResearchProject | null> {
  const current = await getProject(ownerId, id);
  if (!current) return null;
  const title = patch.title !== undefined ? cleanTitle(patch.title) : current.title;
  const description = patch.description !== undefined ? cleanText(patch.description) : current.description;
  const token = patch.shared === undefined ? current.publicToken : patch.shared ? current.publicToken ?? newToken() : null;
  const graphical = patch.graphical === undefined ? current.graphical : cleanGraphical(patch.graphical);
  await db().query(
    'UPDATE research_projects SET title = $3, description = $4, public_token = $5, graphical = $6, updated_at = now() WHERE id = $1 AND owner_id = $2',
    [id, ownerId, title, description, token, graphical ? JSON.stringify(graphical) : null]);
  return getProject(ownerId, id);
}

function cleanGraphical(v: unknown): GraphicalAbstract | null {
  if (v === null) return null;
  const g = (v && typeof v === 'object' ? v : {}) as Partial<GraphicalAbstract>;
  const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
  return {
    headline: str(g.headline, 200),
    steps: Array.isArray(g.steps) ? g.steps.slice(0, 4).map((st) => ({ label: str(st?.label, 60), detail: str(st?.detail, 160) })) : [],
    takeaway: str(g.takeaway, 240),
    figureId: isUuid(g.figureId) ? g.figureId : null,
  };
}

export async function deleteProject(ownerId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { rowCount } = await db().query('DELETE FROM research_projects WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return !!rowCount;
}

/* --------------------------------- материалы --------------------------------- */

export async function listItems(ownerId: string, opts: { projectId?: string | null } = {}): Promise<ResearchItem[]> {
  if (opts.projectId) {
    if (!isUuid(opts.projectId)) return [];
    const { rows } = await db().query<ItemRow>(
      `SELECT ${ITEM_COLS} FROM research_items WHERE owner_id = $1 AND project_id = $2 ORDER BY updated_at DESC`,
      [ownerId, opts.projectId]);
    return rows.map(toItem);
  }
  const { rows } = await db().query<ItemRow>(
    `SELECT ${ITEM_COLS} FROM research_items WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 200`, [ownerId]);
  return rows.map(toItem);
}

export async function getItem(ownerId: string, id: string): Promise<ResearchItem | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<ItemRow>(`SELECT ${ITEM_COLS} FROM research_items WHERE id = $1 AND owner_id = $2`, [id, ownerId]);
  return rows[0] ? toItem(rows[0]) : null;
}

const DEFAULT_TITLES: Record<ResearchKind, 'newPlot' | 'newModel' | 'newSim'> = { plot: 'newPlot', model: 'newModel', sim: 'newSim' };

export async function createItem(ownerId: string, input: {
  kind?: unknown; title?: unknown; doc?: unknown; projectId?: unknown; simulationId?: unknown; mode?: unknown;
}, locale: Locale = 'ru'): Promise<ResearchItem> {
  const kind = input.kind;
  if (kind !== 'plot' && kind !== 'model' && kind !== 'sim') throw new ResearchError('Неизвестный вид материала.');
  let projectId: string | null = null;
  if (input.projectId !== undefined && input.projectId !== null) {
    if (!isUuid(input.projectId) || !(await ownsProject(ownerId, input.projectId))) throw new ResearchError('Проект не найден.');
    projectId = input.projectId;
  }
  let doc: unknown;
  let title = cleanTitle(input.title, translator(researchFigure, locale)(DEFAULT_TITLES[kind]));
  if (kind === 'sim') {
    // Ссылка на свою симуляцию из библиотеки: чужую привязать нельзя.
    const simId = input.simulationId;
    const meta = typeof simId === 'string' ? await getMeta(ownerId, simId) : null;
    if (!meta) throw new ResearchError('Симуляция не найдена в вашей библиотеке.');
    doc = { simulationId: meta.id };
    if (input.title === undefined) title = meta.title;
  } else {
    doc = input.doc !== undefined ? cleanDoc(input.doc)
      : kind === 'plot' ? newPlotDoc(locale) : newModelDoc(input.mode === 'ode' ? 'ode' : 'function', locale);
    if (input.title === undefined) title = (doc as { title?: string }).title?.trim() || title;
  }
  const id = randomUUID();
  await db().query(
    'INSERT INTO research_items (id, owner_id, project_id, kind, title, doc) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, ownerId, projectId, kind, title, JSON.stringify(doc)]);
  if (projectId) await touchProject(projectId);
  return (await getItem(ownerId, id))!;
}

export async function updateItem(ownerId: string, id: string, patch: {
  title?: unknown; doc?: unknown; caption?: unknown; projectId?: unknown; shared?: unknown;
}): Promise<ResearchItem | null> {
  const current = await getItem(ownerId, id);
  if (!current) return null;
  const title = patch.title !== undefined ? cleanTitle(patch.title) : current.title;
  const caption = patch.caption !== undefined ? cleanText(patch.caption) : current.caption;
  // Документ тренажёра — только ссылка на симуляцию: менять его через PATCH нельзя.
  const doc = patch.doc !== undefined && current.kind !== 'sim' ? cleanDoc(patch.doc) : current.doc;
  let projectId = current.projectId;
  if (patch.projectId !== undefined) {
    if (patch.projectId === null) projectId = null;
    else if (isUuid(patch.projectId) && (await ownsProject(ownerId, patch.projectId))) projectId = patch.projectId;
    else throw new ResearchError('Проект не найден.');
  }
  const token = patch.shared === undefined ? current.publicToken : patch.shared ? current.publicToken ?? newToken() : null;
  await db().query(
    `UPDATE research_items SET title = $3, caption = $4, doc = $5, project_id = $6, public_token = $7, updated_at = now()
     WHERE id = $1 AND owner_id = $2`,
    [id, ownerId, title, caption, JSON.stringify(doc), projectId, token]);
  if (projectId) await touchProject(projectId);
  return getItem(ownerId, id);
}

export async function duplicateItem(ownerId: string, id: string): Promise<ResearchItem | null> {
  const src = await getItem(ownerId, id);
  if (!src) return null;
  const copy = randomUUID();
  await db().query(
    `INSERT INTO research_items (id, owner_id, project_id, kind, title, doc, caption)
     SELECT $3, owner_id, project_id, kind, title || ' (копия)', doc, caption FROM research_items WHERE id = $1 AND owner_id = $2`,
    [id, ownerId, copy]);
  return getItem(ownerId, copy);
}

export async function deleteItem(ownerId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { rowCount } = await db().query('DELETE FROM research_items WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return !!rowCount;
}

/** DOI не правится руками: пишет только публикация в Zenodo, updated_at не трогаем — содержимое не менялось. */
export async function setItemZenodo(ownerId: string, id: string, info: ZenodoInfo | null): Promise<void> {
  if (!isUuid(id)) return;
  await db().query('UPDATE research_items SET zenodo = $3 WHERE id = $1 AND owner_id = $2', [id, ownerId, info && JSON.stringify(info)]);
}

export async function setProjectZenodo(ownerId: string, id: string, info: ZenodoInfo | null): Promise<void> {
  if (!isUuid(id)) return;
  await db().query('UPDATE research_projects SET zenodo = $3 WHERE id = $1 AND owner_id = $2', [id, ownerId, info && JSON.stringify(info)]);
}

async function touchProject(projectId: string): Promise<void> {
  await db().query('UPDATE research_projects SET updated_at = now() WHERE id = $1', [projectId]);
}

/* ----------------------------- публичный доступ ----------------------------- */

export interface PublicView {
  kind: 'item' | 'project';
  ownerId: string;
  author: string;
  project: ResearchProject | null;
  items: ResearchItem[];
}

const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

/** Что открывается по публичной ссылке: один материал или проект целиком (только расшаренное внутри не нужно — проект открыт весь). */
export async function publicView(token: string): Promise<PublicView | null> {
  if (!TOKEN.test(token)) return null;
  const author = async (id: string) => {
    const { rows } = await db().query<{ display_name: string | null }>('SELECT display_name FROM users WHERE id = $1', [id]);
    return rows[0]?.display_name?.trim() || '';
  };
  const item = await db().query<ItemRow & { owner_id: string }>(
    `SELECT ${ITEM_COLS}, owner_id FROM research_items WHERE public_token = $1`, [token]);
  if (item.rows[0]) {
    const r = item.rows[0];
    return { kind: 'item', ownerId: r.owner_id, author: await author(r.owner_id), project: null, items: [toItem(r)] };
  }
  const proj = await db().query<ProjectRow & { owner_id: string }>(
    `SELECT p.id, p.title, p.description, p.public_token, p.zenodo, p.graphical, p.created_at, p.updated_at, p.owner_id,
            (SELECT count(*) FROM research_items i WHERE i.project_id = p.id) AS item_count
     FROM research_projects p WHERE p.public_token = $1`, [token]);
  const p = proj.rows[0];
  if (!p) return null;
  const items = await listItems(p.owner_id, { projectId: p.id });
  return { kind: 'project', ownerId: p.owner_id, author: await author(p.owner_id), project: toProject(p), items };
}
