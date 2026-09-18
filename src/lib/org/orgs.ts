import crypto from 'node:crypto';
import { db } from '../db/client';
import { isUniqueViolation } from '../auth/users';
import { mergeOrgSettings, resolveOrgSettings, type OrgSettings } from './settings';
import { OrgError, isOrgKind, type OrgKind, type OrgRole } from './types';
import { isUuid } from './access';

export const SLUG_RE = /^[a-z0-9-]{2,32}$/;

export const MAX_ORG_NAME = 200;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  settings: OrgSettings;
  archivedAt: string | null;
}

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  settings: unknown;
  archived_at: Date | null;
}

const ORG_COLUMNS = 'id, slug, name, kind, settings, archived_at';

function toOrganization(r: OrgRow): Organization {
  return {
    id: r.id, slug: r.slug, name: r.name, kind: r.kind,
    settings: resolveOrgSettings(r.settings),
    archivedAt: r.archived_at ? r.archived_at.toISOString() : null,
  };
}

export async function createOrganization(input: { slug: string; name: string; kind: string }): Promise<Organization> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  if (!isValidSlug(slug)) {
    throw new OrgError('Слаг может содержать только строчные латинские буквы, цифры и дефис, от 2 до 32 символов.');
  }
  if (!name) throw new OrgError('Укажите название организации.');
  if (name.length > MAX_ORG_NAME) {
    throw new OrgError(`Название организации — не длиннее ${MAX_ORG_NAME} символов.`);
  }
  if (!isOrgKind(input.kind)) throw new OrgError('Тип организации — school, college или university.');
  try {
    const { rows } = await db().query<OrgRow>(
      `INSERT INTO organizations (id, slug, name, kind) VALUES ($1,$2,$3,$4) RETURNING ${ORG_COLUMNS}`,
      [crypto.randomUUID(), slug, name, input.kind]);
    return toOrganization(rows[0]);
  } catch (e) {
    if (isUniqueViolation(e)) throw new OrgError(`Слаг «${slug}» уже занят.`);
    throw e;
  }
}

/** Ищет и архивные: скрипту и будущей админке нужно видеть их, правам — нет. */
export async function findOrgBySlug(slug: string): Promise<Organization | null> {
  const { rows } = await db().query<OrgRow>(
    `SELECT ${ORG_COLUMNS} FROM organizations WHERE slug = $1`, [slug.trim().toLowerCase()]);
  return rows[0] ? toOrganization(rows[0]) : null;
}

export async function listOrganizations(): Promise<(Organization & { memberCount: number })[]> {
  const { rows } = await db().query<OrgRow & { member_count: number }>(
    `SELECT ${ORG_COLUMNS},
       (SELECT count(*)::int FROM memberships m WHERE m.org_id = organizations.id) AS member_count
     FROM organizations ORDER BY slug`);
  return rows.map((r) => ({ ...toOrganization(r), memberCount: r.member_count }));
}

/** В одной организации у человека ровно одна роль: повторный вызов её меняет. */
export async function addMember(orgId: string, userId: string, role: OrgRole): Promise<void> {
  await db().query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [orgId, userId, role]);
}

export async function updateOrgSettings(orgId: string, patch: unknown): Promise<OrgSettings> {
  const { rows } = await db().query<{ settings: unknown }>(
    'SELECT settings FROM organizations WHERE id = $1', [orgId]);
  if (!rows[0]) throw new OrgError('Организация не найдена.');
  const next = mergeOrgSettings(rows[0].settings, patch);
  await db().query('UPDATE organizations SET settings = $2 WHERE id = $1', [orgId, JSON.stringify(next)]);
  return resolveOrgSettings(next);
}

export async function getOrgById(id: string): Promise<Organization | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<OrgRow>(`SELECT ${ORG_COLUMNS} FROM organizations WHERE id = $1`, [id]);
  return rows[0] ? toOrganization(rows[0]) : null;
}

export async function setOrgArchived(orgId: string, archived: boolean): Promise<boolean> {
  const r = await db().query(
    'UPDATE organizations SET archived_at = CASE WHEN $2 THEN coalesce(archived_at, now()) END WHERE id = $1',
    [orgId, archived]);
  return (r.rowCount ?? 0) > 0;
}

export interface OrgAdminRow extends Organization {
  memberCount: number;
  createdAt: string;
}

export async function listOrganizationsForAdmin(): Promise<OrgAdminRow[]> {
  const { rows } = await db().query<OrgRow & { member_count: number; created_at: Date }>(
    `SELECT ${ORG_COLUMNS}, created_at,
       (SELECT count(*)::int FROM memberships m WHERE m.org_id = organizations.id) AS member_count
     FROM organizations ORDER BY archived_at IS NOT NULL, name`);
  return rows.map((r) => ({
    ...toOrganization(r), memberCount: r.member_count, createdAt: r.created_at.toISOString(),
  }));
}

export interface OrgOverview {
  admins: number;
  teachers: number;
  students: number;
  groups: number;
  courses: number;
}

export async function orgOverview(orgId: string): Promise<OrgOverview> {
  const { rows } = await db().query<OrgOverview>(
    `SELECT
       (SELECT count(*)::int FROM memberships WHERE org_id = $1 AND role = 'org_admin') AS admins,
       (SELECT count(*)::int FROM memberships WHERE org_id = $1 AND role = 'teacher') AS teachers,
       (SELECT count(*)::int FROM memberships WHERE org_id = $1 AND role = 'student') AS students,
       (SELECT count(*)::int FROM groups WHERE org_id = $1 AND archived_at IS NULL) AS groups,
       (SELECT count(*)::int FROM courses WHERE org_id = $1 AND status <> 'archived') AS courses`, [orgId]);
  return rows[0];
}
