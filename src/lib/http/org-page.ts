import { notFound } from 'next/navigation';
import { requirePageUser } from '../auth/page-guard';
import type { AuthUser } from '../auth/users';
import { resolveCabinetOrg, type CabinetOrg } from '../org/cabinet';
import type { OrgRole } from '../org/types';
import { firstParam, type SearchParams } from './params';

/** Страницы /org и /teach: организация из ?org=, чужая или без прав — 404. */
export async function requireCabinet(
  next: string, allowed: OrgRole[], searchParams: SearchParams,
): Promise<{ user: AuthUser; cabinet: CabinetOrg } | null> {
  const user = await requirePageUser(next);
  if (!user) return null;
  const cabinet = await resolveCabinetOrg(user, allowed, firstParam((await searchParams).org));
  if (!cabinet) notFound();
  return { user, cabinet };
}
