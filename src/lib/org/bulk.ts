import { db } from '../db/client';
import { createLoginUser, LoginTakenError } from '../auth/users';
import { generateTempPassword } from '../auth/temp-password';
import { isUuid } from './access';
import { addMember } from './orgs';
import { addToGroup } from './groups';
import { savePendingCredential } from './credentials';
import {
  displayNameOf, parseRoster, planLogins, rosterKey, splitName, type RosterLine,
} from './roster';
import { OrgError } from './types';

/**
 * Ученики группы списком. Предпросмотр и создание разбирают текст одинаково:
 * сервер не доверяет таблице, которую показал браузер.
 */

export interface RosterPreviewRow extends RosterLine {
  login: string | null;
}

export interface RosterPreview {
  rows: RosterPreviewRow[];
  creatable: number;
}

export interface CreatedStudent {
  userId: string;
  displayName: string;
  login: string;
}

async function groupContext(groupId: string): Promise<{ orgId: string; slug: string }> {
  if (!isUuid(groupId)) throw new OrgError('Группа не найдена.');
  const { rows } = await db().query<{ org_id: string; slug: string }>(
    `SELECT g.org_id, o.slug FROM groups g JOIN organizations o ON o.id = g.org_id
     WHERE g.id = $1 AND g.archived_at IS NULL AND o.archived_at IS NULL`, [groupId]);
  if (!rows[0]) throw new OrgError('Группа не найдена.');
  return { orgId: rows[0].org_id, slug: rows[0].slug };
}

async function groupNameKeys(groupId: string): Promise<Set<string>> {
  const { rows } = await db().query<{ display_name: string | null }>(
    `SELECT u.display_name FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1`, [groupId]);
  return new Set(rows.filter((r) => r.display_name).map((r) => rosterKey(...splitName(r.display_name!))));
}

/** Слаг — только [a-z0-9-], поэтому в шаблоне LIKE экранировать нечего. */
async function takenLogins(slug: string): Promise<Set<string>> {
  const { rows } = await db().query<{ login: string }>(
    "SELECT login FROM users WHERE login LIKE '%.' || $1", [slug]);
  return new Set(rows.map((r) => r.login));
}

export async function previewStudents(groupId: string, text: string): Promise<RosterPreview> {
  const ctx = await groupContext(groupId);
  const parsed = parseRoster(text, await groupNameKeys(groupId));
  if (!parsed.ok) throw new OrgError(parsed.error);
  const logins = planLogins(parsed.lines, ctx.slug, await takenLogins(ctx.slug));
  return {
    rows: parsed.lines.map((l) => ({ ...l, login: logins.get(l.line) ?? null })),
    creatable: logins.size,
  };
}

const LOGIN_RETRIES = 5;

export async function createStudents(groupId: string, text: string): Promise<CreatedStudent[]> {
  const ctx = await groupContext(groupId);
  const preview = await previewStudents(groupId, text);
  const created: CreatedStudent[] = [];
  for (const row of preview.rows) {
    if (row.issue || !row.login) continue;
    const displayName = displayNameOf(row);
    const password = generateTempPassword();
    let login = row.login;
    let userId: string | null = null;
    for (let attempt = 0; attempt < LOGIN_RETRIES && !userId; attempt++) {
      try {
        userId = (await createLoginUser({ login, displayName, password, mustChangePassword: true })).id;
      } catch (e) {
        if (!(e instanceof LoginTakenError)) throw e;
        // Логин заняли между предпросмотром и созданием — берём следующий свободный.
        login = planLogins([row], ctx.slug, await takenLogins(ctx.slug)).get(row.line) ?? login;
      }
    }
    if (!userId) throw new OrgError(`Не удалось подобрать логин для «${displayName}». Попробуйте ещё раз.`);
    await addMember(ctx.orgId, userId, 'student');
    await addToGroup(groupId, userId);
    await savePendingCredential(userId, password);
    created.push({ userId, displayName, login });
  }
  return created;
}
