import crypto from 'node:crypto';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { jobStoreContract } from '../jobstore-contract';

jobStoreContract('память', async () => {
  let clock = Date.parse('2026-09-17T10:00:00Z');
  const store = createMemoryJobStore({ now: () => clock });
  return {
    store,
    owner: async () => crypto.randomUUID(),
    expireLeases: async () => { clock += 5 * 60_000; },
  };
});
