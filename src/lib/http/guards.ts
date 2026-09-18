import type { NextResponse } from 'next/server';
import { currentUserFromRequest } from '../auth/session';
import { unauthorized } from '../auth/guard';
import type { AuthUser } from '../auth/users';
import { isPlatformAdmin, requireOrgRole } from '../org/access';
import { findOrgBySlug } from '../org/orgs';
import type { Membership, OrgRole } from '../org/types';
import { notFound } from './route-kit';

/**
 * Вход в роуты кабинетов. Возвращают либо того, кому можно, либо готовый ответ:
 * `if (g instanceof Response) return g;`.
 */

export async function guardUser(req: Request): Promise<AuthUser | NextResponse> {
  return (await currentUserFromRequest(req)) ?? unauthorized();
}

export async function guardAdmin(req: Request): Promise<AuthUser | NextResponse> {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return isPlatformAdmin(user) ? user : notFound();
}

export async function guardOrg(
  req: Request, slug: string, allowed: OrgRole[],
): Promise<{ user: AuthUser; membership: Membership } | NextResponse> {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const org = await findOrgBySlug(slug);
  const membership = org ? await requireOrgRole(user, org.id, allowed) : null;
  return membership ? { user, membership } : notFound();
}
