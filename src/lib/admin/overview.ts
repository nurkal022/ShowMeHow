import { db } from '../db/client';
import { getJobStore } from '../jobs/current';
import type { QueueStats } from '../jobs/store';
import { dailyCounts, sum, tail, type DailySeries } from '../cabinet/daily';
import { listAdminActions, type AdminActionRow } from './actions';
import type { OrgKind } from '../org/types';

export interface PlatformOverview {
  organizations: number;
  users: number;
  generations7d: number;
  queue: QueueStats;
}

/** Очередь считается той же функцией, что отвечает /api/health. */
export async function platformOverview(): Promise<PlatformOverview> {
  const { rows } = await db().query<{ orgs: number; users: number; gens: number }>(
    `SELECT (SELECT count(*)::int FROM organizations WHERE archived_at IS NULL) AS orgs,
            (SELECT count(*)::int FROM users) AS users,
            (SELECT count(*)::int FROM jobs
              WHERE kind = 'generate' AND status = 'done' AND created_at > now() - interval '7 days') AS gens`);
  const queue = await getJobStore().stats();
  return { organizations: rows[0].orgs, users: rows[0].users, generations7d: rows[0].gens, queue };
}

/* ------------------------- дашборд админки ------------------------- */


export const SPARK_DAYS = 14;
export const CHART_DAYS = 90;

export interface RecentOrg {
  id: string; slug: string; name: string; kind: OrgKind;
  memberCount: number; createdAt: string; archived: boolean;
}

export interface PlatformDashboard {
  users: { total: number; new7d: number; spark: DailySeries };
  organizations: { total: number; new30d: number; spark: DailySeries };
  generations: { done30d: number; spark: DailySeries };
  errors: { count7d: number; spark: DailySeries };
  queue: QueueStats;
  /** 90 дней: переключатель периода режет ряд на клиенте. */
  chart: { days: string[]; done: number[]; error: number[] };
  recentOrgs: RecentOrg[];
  recentActions: AdminActionRow[];
}

const GENERATE_DONE = "kind = 'generate' AND status = 'done'";
const GENERATE_ERROR = "kind = 'generate' AND status = 'error'";

export async function platformDashboard(): Promise<PlatformDashboard> {
  const [totals, usersDaily, orgsDaily, done, error, queue, recent, recentActions] = await Promise.all([
    db().query<{ users: number; orgs: number }>(
      `SELECT (SELECT count(*)::int FROM users) AS users,
              (SELECT count(*)::int FROM organizations WHERE archived_at IS NULL) AS orgs`),
    dailyCounts({ from: 'users', at: 'created_at' }, 30),
    dailyCounts({ from: 'organizations', at: 'created_at' }, 30),
    dailyCounts({ from: 'jobs', at: 'created_at', where: GENERATE_DONE }, CHART_DAYS),
    dailyCounts({ from: 'jobs', at: 'created_at', where: GENERATE_ERROR }, CHART_DAYS),
    getJobStore().stats(),
    db().query<{ id: string; slug: string; name: string; kind: OrgKind; member_count: number; created_at: Date; archived: boolean }>(
      `SELECT o.id, o.slug, o.name, o.kind, o.created_at, o.archived_at IS NOT NULL AS archived,
         (SELECT count(*)::int FROM memberships m WHERE m.org_id = o.id) AS member_count
       FROM organizations o ORDER BY o.created_at DESC LIMIT 6`),
    listAdminActions(8),
  ]);
  return {
    users: { total: totals.rows[0].users, new7d: sum(usersDaily.values.slice(-7)), spark: tail(usersDaily, SPARK_DAYS) },
    organizations: { total: totals.rows[0].orgs, new30d: sum(orgsDaily.values), spark: tail(orgsDaily, SPARK_DAYS) },
    generations: { done30d: sum(done.values.slice(-30)), spark: tail(done, SPARK_DAYS) },
    errors: { count7d: sum(error.values.slice(-7)), spark: tail(error, SPARK_DAYS) },
    queue,
    chart: { days: done.days, done: done.values, error: error.values },
    recentOrgs: recent.rows.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, kind: r.kind, memberCount: r.member_count,
      createdAt: r.created_at.toISOString(), archived: r.archived,
    })),
    recentActions,
  };
}
