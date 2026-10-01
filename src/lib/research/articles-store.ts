import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { isUuid, ResearchError } from './store';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';
import { newArticleDoc, normalizeArticleDoc, type ArticleDoc, type ArticleKind, type ArticleLang } from './article';

/** Статьи исследователя. Как и остальное в разделе — только автору; чужое неотличимо от несуществующего. */

export interface ResearchArticle {
  id: string;
  projectId: string | null;
  title: string;
  doc: ArticleDoc;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleSummary { id: string; projectId: string | null; title: string; updatedAt: string; words: number }

interface Row { id: string; project_id: string | null; title: string; doc: unknown; created_at: Date; updated_at: Date }

const MAX_DOC = 3_000_000;

function toArticle(r: Row): ResearchArticle {
  return { id: r.id, projectId: r.project_id, title: r.title, doc: normalizeArticleDoc(r.doc), createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() };
}

async function ownsProject(ownerId: string, projectId: string): Promise<boolean> {
  const { rowCount } = await db().query('SELECT 1 FROM research_projects WHERE id = $1 AND owner_id = $2', [projectId, ownerId]);
  return !!rowCount;
}

export async function listArticles(ownerId: string, projectId?: string | null): Promise<ArticleSummary[]> {
  const where = projectId ? 'AND project_id = $2' : '';
  const params = projectId ? [ownerId, projectId] : [ownerId];
  if (projectId && !isUuid(projectId)) return [];
  const { rows } = await db().query<Row>(`SELECT id, project_id, title, doc, created_at, updated_at FROM research_articles WHERE owner_id = $1 ${where} ORDER BY updated_at DESC`, params);
  return rows.map((r) => {
    const doc = normalizeArticleDoc(r.doc);
    const words = doc.sections.reduce((n, s) => n + s.body.split(/\s+/).filter(Boolean).length, 0);
    return { id: r.id, projectId: r.project_id, title: r.title, updatedAt: r.updated_at.toISOString(), words };
  });
}

export async function getArticle(ownerId: string, id: string): Promise<ResearchArticle | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<Row>('SELECT id, project_id, title, doc, created_at, updated_at FROM research_articles WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return rows[0] ? toArticle(rows[0]) : null;
}

export async function createArticle(ownerId: string, input: { title?: unknown; projectId?: unknown; kind?: unknown; lang?: unknown }, locale: Locale = 'ru'): Promise<ResearchArticle> {
  let projectId: string | null = null;
  if (input.projectId) {
    if (!isUuid(input.projectId) || !(await ownsProject(ownerId, input.projectId))) throw new ResearchError('Проект не найден.');
    projectId = input.projectId;
  }
  const kind = (['experimental', 'modeling', 'review', 'thesis'] as const).find((k) => k === input.kind) ?? 'experimental';
  const lang = (['ru', 'kk', 'en'] as const).find((l) => l === input.lang) ?? 'ru';
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 300) : translator(researchFigure, locale)('newArticle');
  const id = randomUUID();
  await db().query('INSERT INTO research_articles (id, owner_id, project_id, title, doc) VALUES ($1,$2,$3,$4,$5)',
    [id, ownerId, projectId, title, JSON.stringify(newArticleDoc(kind as ArticleKind, lang as ArticleLang))]);
  return (await getArticle(ownerId, id))!;
}

export async function updateArticle(ownerId: string, id: string, patch: { title?: unknown; doc?: unknown; projectId?: unknown }): Promise<ResearchArticle | null> {
  const cur = await getArticle(ownerId, id);
  if (!cur) return null;
  const title = typeof patch.title === 'string' ? patch.title.trim().slice(0, 300) || cur.title : cur.title;
  let doc = cur.doc;
  if (patch.doc !== undefined) {
    if (!patch.doc || typeof patch.doc !== 'object') throw new ResearchError('Некорректный документ.');
    if (JSON.stringify(patch.doc).length > MAX_DOC) throw new ResearchError('Статья слишком большая.');
    doc = normalizeArticleDoc(patch.doc);
  }
  let projectId = cur.projectId;
  if (patch.projectId !== undefined) {
    if (patch.projectId === null) projectId = null;
    else if (isUuid(patch.projectId) && (await ownsProject(ownerId, patch.projectId))) projectId = patch.projectId;
    else throw new ResearchError('Проект не найден.');
  }
  await db().query('UPDATE research_articles SET title = $3, doc = $4, project_id = $5, updated_at = now() WHERE id = $1 AND owner_id = $2',
    [id, ownerId, title, JSON.stringify(doc), projectId]);
  return getArticle(ownerId, id);
}

export async function deleteArticle(ownerId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { rowCount } = await db().query('DELETE FROM research_articles WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return !!rowCount;
}
