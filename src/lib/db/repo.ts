import type { SimulationMeta } from '../types';
import { hasDb, db } from './client';
import { createPgRepo } from './repo-pg';

export interface SimRecord extends SimulationMeta {
  ownerId: string;
}

/**
 * Метаданные симуляций. HTML, история версий и превью через репозиторий не проходят —
 * они остаются файлами (см. src/lib/storage.ts).
 */
export interface MetaRepo {
  insert(rec: SimRecord): Promise<void>;
  get(id: string): Promise<SimRecord | null>;
  listByOwner(ownerId: string): Promise<SimulationMeta[]>;
  touch(id: string, at: string): Promise<void>;
  remove(id: string): Promise<void>;
  hasDemo(ownerId: string, slug: string): Promise<boolean>;
}

function strip(rec: SimRecord): SimulationMeta {
  const { ownerId: _ownerId, ...meta } = rec;
  return meta;
}

export function createMemoryRepo(): MetaRepo {
  const rows = new Map<string, SimRecord>();
  return {
    async insert(rec) {
      // Как и у постгресового драйвера (PRIMARY KEY на id): повторная вставка того же
      // id — ошибка, а не тихая перезапись.
      if (rows.has(rec.id)) {
        throw new Error(`запись с id ${rec.id} уже существует`);
      }
      rows.set(rec.id, structuredClone(rec));
    },
    async get(id) { const r = rows.get(id); return r ? structuredClone(r) : null; },
    async listByOwner(ownerId) {
      return [...rows.values()]
        .filter((r) => r.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((r) => structuredClone(strip(r)));
    },
    async touch(id, at) { const r = rows.get(id); if (r) r.updatedAt = at; },
    async remove(id) { rows.delete(id); },
    async hasDemo(ownerId, slug) {
      return [...rows.values()].some((r) => r.ownerId === ownerId && r.demo === slug);
    },
  };
}

let override: MetaRepo | null = null;
let shared: MetaRepo | null = null;

/** Подмена драйвера в тестах; null возвращает автоматический выбор. */
export function __setRepoForTests(repo: MetaRepo | null): void {
  override = repo;
  shared = null;
}

/**
 * Боевой путь — Postgres. Без DATABASE_URL берётся память: так `npm test` зелен
 * на голой машине. В продакшне отсутствие адреса базы — ошибка конфигурации, а не
 * повод тихо потерять данные при первом же перезапуске.
 */
export function getRepo(): MetaRepo {
  if (override) return override;
  if (!shared) {
    if (hasDb()) {
      shared = createPgRepo(db());
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL не задан: в продакшне работа без базы данных запрещена');
      }
      shared = createMemoryRepo();
    }
  }
  return shared;
}
