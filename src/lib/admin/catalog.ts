import { db } from '../db/client';
import { isUuid } from '../org/access';
import { escapeLike } from './users';

/**
 * Общий каталог симуляций: админ ставит флажок, учителя вставляют такие
 * симуляции в курсы. Каталог виден любому вошедшему (canView).
 */

export type Visibility = 'private' | 'catalog';

export interface CatalogItem {
  id: string;
  title: string;
  subject: string;
  ownerId: string;
  ownerLabel: string;
  visibility: Visibility;
  updatedAt: string;
}

interface Row {
  id: string; title: string; subject: string; owner_id: string;
  owner_label: string; visibility: Visibility; updated_at: Date;
}

const SELECT = `
  SELECT s.id, s.title, s.subject, s.owner_id, s.visibility, s.updated_at,
         coalesce(u.display_name, u.email, u.login, '') AS owner_label
  FROM simulations s JOIN users u ON u.id = s.owner_id`;

const MATCH = `($1 = '' OR s.title ILIKE $2 OR u.email ILIKE $2 OR u.login ILIKE $2 OR u.display_name ILIKE $2)`;

function toItem(r: Row): CatalogItem {
  return {
    id: r.id, title: r.title, subject: r.subject, ownerId: r.owner_id, ownerLabel: r.owner_label,
    visibility: r.visibility, updatedAt: r.updated_at.toISOString(),
  };
}

function params(query: string): [string, string] {
  const q = query.trim().slice(0, 100);
  return [q, `%${escapeLike(q)}%`];
}

export async function listAllSimulations(query: string, limit = 100): Promise<CatalogItem[]> {
  const { rows } = await db().query<Row>(
    `${SELECT} WHERE ${MATCH} ORDER BY s.updated_at DESC LIMIT $3`, [...params(query), limit]);
  return rows.map(toItem);
}

export async function listCatalog(query: string, limit = 60): Promise<CatalogItem[]> {
  const { rows } = await db().query<Row>(
    `${SELECT} WHERE s.visibility = 'catalog' AND ${MATCH} ORDER BY s.updated_at DESC LIMIT $3`,
    [...params(query), limit]);
  return rows.map(toItem);
}

export async function setSimulationVisibility(id: string, visibility: Visibility): Promise<boolean> {
  if (!isUuid(id)) return false;
  const r = await db().query('UPDATE simulations SET visibility = $2 WHERE id = $1', [id, visibility]);
  return (r.rowCount ?? 0) > 0;
}
