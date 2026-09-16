import type { OrgSettings } from './settings';

export type OrgRole = 'org_admin' | 'teacher' | 'student';
export const ORG_ROLES: readonly OrgRole[] = ['org_admin', 'teacher', 'student'];

export type OrgKind = 'school' | 'college' | 'university';
export const ORG_KINDS: readonly OrgKind[] = ['school', 'college', 'university'];

/** Членство человека в неархивной организации вместе с её настройками. */
export interface Membership {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgKind: OrgKind;
  role: OrgRole;
  settings: OrgSettings;
}

/** Отказ с текстом для человека: скрипт печатает его как есть. */
export class OrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrgError';
  }
}

export function isOrgRole(v: unknown): v is OrgRole {
  return typeof v === 'string' && (ORG_ROLES as readonly string[]).includes(v);
}

export function isOrgKind(v: unknown): v is OrgKind {
  return typeof v === 'string' && (ORG_KINDS as readonly string[]).includes(v);
}
