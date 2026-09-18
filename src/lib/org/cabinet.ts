import type { AuthUser } from '../auth/users';
import { isPlatformAdmin, listMemberships, requireOrgRole } from './access';
import { findOrgBySlug } from './orgs';
import { pickMembership, roleSatisfies } from './policy';
import type { Membership, OrgRole } from './types';

/** Какую организацию показывает /org или /teach: выбор хранится в адресе (?org=<slug>). */

export interface OrgChoice { slug: string; name: string }
export interface CabinetOrg { membership: Membership; choices: OrgChoice[] }

export async function resolveCabinetOrg(
  user: AuthUser, allowed: readonly OrgRole[], slug: string | undefined,
): Promise<CabinetOrg | null> {
  const memberships = await listMemberships(user.id);
  const choices = memberships
    .filter((m) => roleSatisfies(m.role, allowed))
    .map((m) => ({ slug: m.orgSlug, name: m.orgName }));
  const picked = pickMembership(memberships, allowed, slug);
  if (picked) return { membership: picked, choices };
  // Админ платформы приходит по ссылке из админки в любую организацию.
  if (slug && isPlatformAdmin(user)) {
    const org = await findOrgBySlug(slug);
    const membership = org ? await requireOrgRole(user, org.id, [...allowed]) : null;
    if (membership) {
      const known = choices.some((c) => c.slug === membership.orgSlug);
      return {
        membership,
        choices: known ? choices : [...choices, { slug: membership.orgSlug, name: membership.orgName }],
      };
    }
  }
  return null;
}
