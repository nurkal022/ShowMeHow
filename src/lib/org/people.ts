import { db } from '../db/client';
import {
  createLoginUser, createUser, findUserByIdentifier, setTemporaryPassword, updateProfile,
  EmailTakenError, InvalidLoginError, LoginTakenError,
} from '../auth/users';
import { generateTempPassword } from '../auth/temp-password';
import { userLabel } from '../auth/identifier';
import { addMember } from './orgs';
import { isUuid, orgRoleOf } from './access';
import { OrgError, ORG_ROLE_LABELS, type OrgRole } from './types';
import type { PersonInput } from './person-input';

/** Заведение и снятие людей организации — общий код админки и кабинета. */

export interface ProvisionResult {
  userId: string;
  label: string;
  /** Показывается один раз; null — аккаунт уже был, пароль не менялся. */
  tempPassword: string | null;
  created: boolean;
}

/**
 * Существующий аккаунт по почте становится членом; новый создаётся с временным
 * паролем. Логин всегда новый: чужой логин принадлежит другой организации.
 */
export async function provisionMember(orgId: string, role: OrgRole, person: PersonInput): Promise<ProvisionResult> {
  const existing = await findUserByIdentifier(person.kind === 'email' ? person.email : person.login);
  if (existing) {
    if (person.kind === 'login') throw new OrgError(`Логин «${person.login}» уже занят. Укажите другой.`);
    const current = await orgRoleOf(existing.id, orgId);
    if (current) throw new OrgError(`Этот человек уже состоит в организации: ${ORG_ROLE_LABELS[current]}.`);
    await addMember(orgId, existing.id, role);
    return { userId: existing.id, label: userLabel(existing), tempPassword: null, created: false };
  }
  const password = generateTempPassword();
  try {
    if (person.kind === 'email') {
      const user = await createUser(person.email, password);
      if (person.displayName) await updateProfile(user.id, { displayName: person.displayName });
      await setTemporaryPassword(user.id, password);
      await addMember(orgId, user.id, role);
      return { userId: user.id, label: person.displayName ?? person.email, tempPassword: password, created: true };
    }
    const user = await createLoginUser({
      login: person.login, displayName: person.displayName, password, mustChangePassword: true });
    await addMember(orgId, user.id, role);
    return { userId: user.id, label: person.displayName, tempPassword: password, created: true };
  } catch (e) {
    if (e instanceof LoginTakenError || e instanceof InvalidLoginError || e instanceof EmailTakenError) {
      throw new OrgError(e.message);
    }
    throw e;
  }
}

export interface OrgPerson {
  userId: string;
  displayName: string | null;
  email: string | null;
  login: string | null;
  role: OrgRole;
  disabled: boolean;
  mustChangePassword: boolean;
  /** Группы, где человек учится или которые ведёт. */
  groups: string[];
}

interface PersonRow {
  id: string; display_name: string | null; email: string | null; login: string | null;
  role: OrgRole; disabled_at: Date | null; must_change_password: boolean; groups: string[];
}

const PERSON_SELECT = `
  SELECT u.id, u.display_name, u.email, u.login, m.role, u.disabled_at, u.must_change_password,
    ARRAY(SELECT g.title FROM groups g
          WHERE g.org_id = m.org_id AND g.archived_at IS NULL
            AND (EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.group_id = g.id AND gt.user_id = u.id)
              OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = u.id))
          ORDER BY g.title) AS groups
  FROM memberships m JOIN users u ON u.id = m.user_id
  WHERE m.org_id = $1`;

function toPerson(r: PersonRow): OrgPerson {
  return {
    userId: r.id, displayName: r.display_name, email: r.email, login: r.login, role: r.role,
    disabled: r.disabled_at !== null, mustChangePassword: r.must_change_password, groups: r.groups,
  };
}

export async function listOrgPeople(orgId: string, roles: OrgRole[]): Promise<OrgPerson[]> {
  const { rows } = await db().query<PersonRow>(
    `${PERSON_SELECT} AND m.role = ANY($2::text[])
     ORDER BY coalesce(u.display_name, u.email, u.login)`, [orgId, roles]);
  return rows.map(toPerson);
}

export async function getOrgPerson(orgId: string, userId: string): Promise<OrgPerson | null> {
  if (!isUuid(userId)) return null;
  const { rows } = await db().query<PersonRow>(`${PERSON_SELECT} AND u.id = $2`, [orgId, userId]);
  return rows[0] ? toPerson(rows[0]) : null;
}

/**
 * Можно ли админу организации сбрасывать пароль и блокировать человека: только
 * если тот не состоит в других организациях и не админ платформы — иначе одна
 * школа распоряжалась бы чужим аккаунтом.
 */
export async function isExclusiveMember(orgId: string, userId: string): Promise<boolean> {
  const { rows } = await db().query<{ other: number; admin: boolean | null }>(
    `SELECT (SELECT count(*)::int FROM memberships WHERE user_id = $2 AND org_id <> $1) AS other,
            (SELECT role = 'admin' FROM users WHERE id = $2) AS admin`, [orgId, userId]);
  return rows[0].other === 0 && rows[0].admin === false;
}

/**
 * Снятие человека с организации. Курсы остаются в организации: владельцем
 * становится тот, кто убрал (спецификация §4, §7). Всё — одной транзакцией.
 */
export async function removeMember(
  orgId: string, userId: string, actorId: string,
): Promise<{ reassignedCourses: number }> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const moved = await client.query(
      'UPDATE courses SET owner_id = $3, updated_at = now() WHERE org_id = $1 AND owner_id = $2',
      [orgId, userId, actorId]);
    await client.query(
      `DELETE FROM group_teachers gt USING groups g
       WHERE g.id = gt.group_id AND g.org_id = $1 AND gt.user_id = $2`, [orgId, userId]);
    await client.query(
      `DELETE FROM group_members gm USING groups g
       WHERE g.id = gm.group_id AND g.org_id = $1 AND gm.user_id = $2`, [orgId, userId]);
    const removed = await client.query('DELETE FROM memberships WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
    if (!removed.rowCount) throw new OrgError('Этот человек не состоит в организации.');
    await client.query('COMMIT');
    return { reassignedCourses: moved.rowCount ?? 0 };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
