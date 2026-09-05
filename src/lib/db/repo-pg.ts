import type { Pool } from 'pg';
import type { MetaRepo, SimRecord } from './repo';
import type { SimulationMeta } from '../types';

interface Row {
  id: string; owner_id: string; title: string; prompt: string; subject: string;
  tags: string[]; warning: string | null; demo: string | null;
  created_at: Date; updated_at: Date;
}

function toRecord(r: Row): SimRecord {
  const meta: SimRecord = {
    id: r.id, ownerId: r.owner_id, title: r.title, prompt: r.prompt, subject: r.subject,
    tags: r.tags, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
  if (r.warning) meta.warning = r.warning;
  if (r.demo) meta.demo = r.demo;
  return meta;
}

export function createPgRepo(pool: Pool): MetaRepo {
  return {
    async insert(rec: SimRecord) {
      await pool.query(
        `INSERT INTO simulations (id, owner_id, title, prompt, subject, tags, warning, demo, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [rec.id, rec.ownerId, rec.title, rec.prompt, rec.subject, rec.tags,
          rec.warning ?? null, rec.demo ?? null, rec.createdAt, rec.updatedAt]);
    },
    async get(id: string) {
      const { rows } = await pool.query<Row>('SELECT * FROM simulations WHERE id = $1', [id]);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async listByOwner(ownerId: string): Promise<SimulationMeta[]> {
      const { rows } = await pool.query<Row>(
        'SELECT * FROM simulations WHERE owner_id = $1 ORDER BY updated_at DESC', [ownerId]);
      return rows.map((r) => {
        const { ownerId: _o, ...meta } = toRecord(r);
        return meta;
      });
    },
    async touch(id: string, at: string) {
      await pool.query('UPDATE simulations SET updated_at = $2 WHERE id = $1', [id, at]);
    },
    async remove(id: string) {
      await pool.query('DELETE FROM simulations WHERE id = $1', [id]);
    },
    async hasDemo(ownerId: string, slug: string) {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM simulations WHERE owner_id = $1 AND demo = $2', [ownerId, slug]);
      return (rowCount ?? 0) > 0;
    },
  };
}
