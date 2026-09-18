import { db } from '../db/client';
import { getJobStore } from '../jobs/current';
import type { QueueStats } from '../jobs/store';

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
