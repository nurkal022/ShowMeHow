# Фундамент: аккаунты, база данных, квоты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить однопользовательский прототип в пробную версию с регистрацией, изоляцией данных по владельцу, лимитом в 10 генераций и защитой сервера от одновременных запусков.

**Architecture:** Postgres хранит пользователей, сессии, метаданные симуляций и задания; HTML-артефакты остаются файлами на диске. `src/lib/storage.ts` становится асинхронным и получает `ownerId` первым аргументом, а метаданные читает через интерфейс `MetaRepo` с двумя драйверами: постгресовым (боевой) и in-memory (тесты без базы). Аутентификация написана на `node:crypto` без внешних библиотек.

**Tech Stack:** Next.js 15, React 19, TypeScript, Postgres 16, драйвер `pg`, vitest, Playwright (только рендер артефактов).

**Spec:** `docs/superpowers/specs/2026-09-06-accounts-foundation-design.md`

## Global Constraints

- **Не запускать `npm run test:e2e`.** Набор красный по причинам, предшествующим этой работе, и в рамки не входит.
- **Единственная новая зависимость — `pg`.** Ни ORM, ни библиотек аутентификации, ни хеширующих пакетов: пароли считает `node:crypto`.
- **`npm test` обязан оставаться зелёным без запущенной базы.** Тесты, требующие Postgres, читают `SHOWMEHOW_TEST_DATABASE_URL` и пропускаются целиком, если переменная не задана.
- **Комментарии по-русски, идентификаторы по-английски, строки для пользователя по-русски.**
- Код внутри шаблонных строк рантайма (`src/lib/runtime/*`) и в `demos/*/artifact.html` — **строго ES5**. Эта работа их не трогает.
- Каждый коммит заканчивается строкой:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Чужой `id` даёт **404**, а не 403. Невалидный сегмент пути (`../evil`) по-прежнему даёт **400** — это поведение уже покрыто тестами и не должно измениться.
- Тексты ошибок для пользователя — целыми предложениями по-русски, без англицизмов.

---

### Task 1: Клиент Postgres, миграции, тестовая обвязка

**Files:**
- Create: `src/lib/db/client.ts`, `migrations/001_init.sql`, `scripts/migrate.ts`, `tests/integration/migrate.test.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `db(): Pool` — ленивый пул на `process.env.DATABASE_URL`;
  - `closeDb(): Promise<void>`;
  - `hasDb(): boolean` — задан ли `DATABASE_URL`;
  - `applyMigrations(pool: Pool): Promise<string[]>` — применяет непринятые миграции, возвращает имена применённых.

- [ ] **Step 1: Поставить драйвер**

```bash
npm install pg @types/pg
```

- [ ] **Step 2: Написать миграцию схемы**

Создать `migrations/001_init.sql` ровно с этим содержимым:

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE simulations (
  id         uuid PRIMARY KEY,
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  prompt     text NOT NULL,
  subject    text NOT NULL,
  tags       text[] NOT NULL DEFAULT '{}',
  warning    text,
  demo       text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX simulations_owner_updated ON simulations (owner_id, updated_at DESC);
CREATE UNIQUE INDEX simulations_owner_demo ON simulations (owner_id, demo) WHERE demo IS NOT NULL;

CREATE TABLE jobs (
  id            uuid PRIMARY KEY,
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL,
  request       jsonb NOT NULL,
  events        jsonb NOT NULL DEFAULT '[]',
  simulation_id uuid,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_owner_status ON jobs (owner_id, status);
```

- [ ] **Step 3: Написать клиент**

`src/lib/db/client.ts`:

```ts
import { Pool } from 'pg';

let pool: Pool | null = null;

/** Задан ли адрес базы. В тестах без базы драйвер метаданных подменяется на in-memory. */
export function hasDb(): boolean {
  return !!process.env.DATABASE_URL;
}

export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL не задан: база данных недоступна');
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  const p = pool;
  pool = null;
  await p?.end();
}
```

- [ ] **Step 4: Написать раннер миграций**

`scripts/migrate.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { db, closeDb } from '../src/lib/db/client';

function migrationsDir(): string {
  return path.join(process.cwd(), 'migrations');
}

/**
 * Применяет непринятые миграции по возрастанию имени, каждую в своей транзакции.
 * Идемпотентен: уже применённые имена лежат в schema_migrations и пропускаются.
 */
export async function applyMigrations(pool: Pool): Promise<string[]> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  const files = fs.readdirSync(migrationsDir()).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir(), file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`миграция ${file} не применилась: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

async function main(): Promise<void> {
  const applied = await applyMigrations(db());
  console.log(applied.length ? `Применено: ${applied.join(', ')}` : 'Новых миграций нет');
}

// Запуск как скрипт: `npm run migrate`. При импорте из тестов main не вызывается.
if (process.argv[1]?.endsWith('migrate.ts')) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());
}
```

Добавить в `package.json` в `scripts`: `"migrate": "tsx scripts/migrate.ts"`.

- [ ] **Step 5: Написать падающий тест**

`tests/integration/migrate.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { applyMigrations } from '../../scripts/migrate';

const url = process.env.SHOWMEHOW_TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url }) : null;

afterAll(async () => { await pool?.end(); });

// Без базы набор пропускается целиком: `npm test` обязан быть зелёным на голой машине.
describe.skipIf(!pool)('миграции', () => {
  it('создают схему и применяются повторно вхолостую', async () => {
    const p = pool!;
    await p.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const first = await applyMigrations(p);
    expect(first).toContain('001_init.sql');
    const tables = await p.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(['users', 'sessions', 'simulations', 'jobs']));
    const second = await applyMigrations(p);
    expect(second).toEqual([]);
  });
});
```

- [ ] **Step 6: Запустить — убедиться, что падает**

Run: `npx vitest run tests/integration/migrate.test.ts`
Expected: без `SHOWMEHOW_TEST_DATABASE_URL` — набор пропущен (0 упавших). С заданной переменной до реализации — FAIL на импорте `applyMigrations`.

- [ ] **Step 7: Прогнать с базой**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/migrate.test.ts`
Expected: PASS.

- [ ] **Step 8: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(db): postgres client and sql migration runner

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Репозиторий метаданных и два драйвера

**Files:**
- Create: `src/lib/db/repo.ts`, `src/lib/db/repo-memory.ts`, `src/lib/db/repo-pg.ts`, `tests/integration/repo-contract.test.ts`

**Interfaces:**
- Consumes: `db()`, `hasDb()` из Task 1.
- Produces:

```ts
export interface SimRecord extends SimulationMeta { ownerId: string }

export interface MetaRepo {
  insert(rec: SimRecord): Promise<void>;
  get(id: string): Promise<SimRecord | null>;
  listByOwner(ownerId: string): Promise<SimulationMeta[]>;
  touch(id: string, at: string): Promise<void>;
  remove(id: string): Promise<void>;
  hasDemo(ownerId: string, slug: string): Promise<boolean>;
}

export function getRepo(): MetaRepo;
export function __setRepoForTests(repo: MetaRepo | null): void;
export function createMemoryRepo(): MetaRepo;
```

- [ ] **Step 1: Написать падающий контрактный тест**

`tests/integration/repo-contract.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { applyMigrations } from '../../scripts/migrate';
import { createMemoryRepo, type MetaRepo, type SimRecord } from '@/lib/db/repo';
import { createPgRepo } from '@/lib/db/repo-pg';

const url = process.env.SHOWMEHOW_TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url }) : null;
const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function rec(id: string, ownerId: string, over: Partial<SimRecord> = {}): SimRecord {
  const now = new Date().toISOString();
  return {
    id, ownerId, title: 'т', prompt: 'п', subject: 'Физика', tags: ['газ'],
    createdAt: now, updatedAt: now, ...over,
  };
}

beforeAll(async () => {
  if (!pool) return;
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await applyMigrations(pool);
  await pool.query(
    "INSERT INTO users (id, email, password_hash, role) VALUES ($1,'a@t','x','user'), ($2,'b@t','x','user')",
    [OWNER, OTHER]);
});
afterAll(async () => { await pool?.end(); });

const drivers: [string, () => MetaRepo][] = [['memory', createMemoryRepo]];
if (pool) drivers.push(['postgres', () => createPgRepo(pool)]);

describe.each(drivers)('MetaRepo (%s)', (_name, make) => {
  it('пишет, читает и отдаёт только записи владельца', async () => {
    const repo = make();
    const a = '33333333-3333-3333-3333-333333333333';
    const b = '44444444-4444-4444-4444-444444444444';
    await repo.insert(rec(a, OWNER));
    await repo.insert(rec(b, OTHER));
    expect((await repo.get(a))?.ownerId).toBe(OWNER);
    expect(await repo.get('55555555-5555-5555-5555-555555555555')).toBeNull();
    const mine = await repo.listByOwner(OWNER);
    expect(mine.map((m) => m.id)).toEqual([a]);
  });

  it('touch двигает updatedAt, remove убирает запись', async () => {
    const repo = make();
    const id = '66666666-6666-6666-6666-666666666666';
    await repo.insert(rec(id, OWNER, { updatedAt: '2020-01-01T00:00:00.000Z' }));
    await repo.touch(id, '2026-01-01T00:00:00.000Z');
    expect((await repo.get(id))?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    await repo.remove(id);
    expect(await repo.get(id)).toBeNull();
  });

  it('hasDemo различает владельцев', async () => {
    const repo = make();
    await repo.insert(rec('77777777-7777-7777-7777-777777777777', OWNER, { demo: 'pendulum' }));
    expect(await repo.hasDemo(OWNER, 'pendulum')).toBe(true);
    expect(await repo.hasDemo(OTHER, 'pendulum')).toBe(false);
  });

  it('listByOwner отдаёт свежие первыми', async () => {
    const repo = make();
    await repo.insert(rec('88888888-8888-8888-8888-888888888888', OWNER, { updatedAt: '2021-01-01T00:00:00.000Z' }));
    await repo.insert(rec('99999999-9999-9999-9999-999999999999', OWNER, { updatedAt: '2026-06-01T00:00:00.000Z' }));
    const ids = (await repo.listByOwner(OWNER)).map((m) => m.id);
    expect(ids.indexOf('99999999-9999-9999-9999-999999999999'))
      .toBeLessThan(ids.indexOf('88888888-8888-8888-8888-888888888888'));
  });
});
```

Замечание для исполнителя: каждый `it` вызывает `make()` заново. Для памяти это чистый репозиторий, для Postgres — новый объект поверх той же базы, поэтому идентификаторы в тестах намеренно не пересекаются между случаями.

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/integration/repo-contract.test.ts`
Expected: FAIL — модуля `@/lib/db/repo` нет.

- [ ] **Step 3: Написать интерфейс, in-memory драйвер и выбор драйвера**

`src/lib/db/repo.ts`:

```ts
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
    async insert(rec) { rows.set(rec.id, structuredClone(rec)); },
    async get(id) { const r = rows.get(id); return r ? structuredClone(r) : null; },
    async listByOwner(ownerId) {
      return [...rows.values()]
        .filter((r) => r.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(strip);
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
```

Импорт `createPgRepo` — статический, наверху файла: `import { createPgRepo } from './repo-pg';` рядом с импортом `hasDb, db`.

- [ ] **Step 4: Написать постгресовый драйвер**

`src/lib/db/repo-pg.ts`:

```ts
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
```

- [ ] **Step 5: Прогнать оба драйвера**

Run: `npx vitest run tests/integration/repo-contract.test.ts`
Expected: PASS (только memory).
Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/repo-contract.test.ts`
Expected: PASS для обоих драйверов.

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(db): metadata repository with postgres and in-memory drivers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `storage.ts` на репозиторий, владелец и асинхронность

**Files:**
- Modify: `src/lib/storage.ts`, `src/lib/demos.ts`, `src/lib/pipeline/run.ts`, `evals/run.ts`, `src/app/present/[id]/page.tsx`, `src/app/api/simulations/route.ts`, `src/app/api/simulations/[id]/route.ts`, `src/app/api/simulations/[id]/export/route.ts`, `src/app/api/simulations/[id]/history/route.ts`, `src/app/api/simulations/[id]/thumbnail/route.ts`, `src/app/api/simulations/[id]/refine/route.ts`, `src/app/api/demos/route.ts`
- Test: `tests/unit/storage.test.ts`, `tests/unit/api.test.ts`, `tests/unit/demos.test.ts`, `tests/unit/demos-api.test.ts`, `tests/unit/run.test.ts`, `tests/integration/demos.test.ts`

**Interfaces:**
- Consumes: `getRepo()`, `createMemoryRepo()`, `__setRepoForTests()` из Task 2.
- Produces (новые сигнатуры `storage.ts`; все асинхронные, все принимают `ownerId` первым):

```ts
export async function createSimulation(ownerId: string, input: { title: string; prompt: string; subject: string; tags: string[]; warning?: string; demo?: string }, html: string): Promise<SimulationMeta>;
export async function getMeta(ownerId: string, id: string): Promise<SimulationMeta | null>;
export async function getArtifact(ownerId: string, id: string): Promise<string | null>;
export async function getRenderableArtifact(ownerId: string, id: string): Promise<string | null>;
export async function listSimulations(ownerId: string): Promise<SimulationMeta[]>;
export async function updateArtifact(ownerId: string, id: string, html: string): Promise<boolean>;
export async function listHistory(ownerId: string, id: string): Promise<string[] | null>;
export async function restoreVersion(ownerId: string, id: string, name: string): Promise<boolean>;
export async function deleteSimulation(ownerId: string, id: string): Promise<void>;
export async function saveThumbnail(ownerId: string, id: string, png: Buffer): Promise<boolean>;
export async function getThumbnailPath(ownerId: string, id: string): Promise<string | null>;
```

Также: `installDemos(ownerId: string, render?: RenderFn)`, `runPipeline(ctx, input & { ownerId: string }, isCancelled?)`, `refineExisting(ctx, ownerId, id, instruction)`.

- [ ] **Step 1: Переписать тест хранилища под новые сигнатуры**

В `tests/unit/storage.test.ts` добавить в начало файла подмену драйвера и владельца:

```ts
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';

const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  __setRepoForTests(createMemoryRepo());
});
```

Все существующие вызовы получают `OWNER` первым аргументом и `await`. Добавить новый тест изоляции:

```ts
it('чужой владелец не видит симуляцию', async () => {
  const meta = await createSimulation(
    OWNER, { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>x</html>');
  expect(await getMeta(STRANGER, meta.id)).toBeNull();
  expect(await getArtifact(STRANGER, meta.id)).toBeNull();
  expect(await listSimulations(STRANGER)).toEqual([]);
  expect(await updateArtifact(STRANGER, meta.id, '<html>y</html>')).toBe(false);
  // Удаление чужой симуляции — не ошибка, но и не действие.
  await deleteSimulation(STRANGER, meta.id);
  expect(await getMeta(OWNER, meta.id)).not.toBeNull();
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: FAIL — сигнатуры не совпадают.

- [ ] **Step 3: Переписать `storage.ts`**

Полное содержимое `src/lib/storage.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './settings';
import { reinstrument } from './artifact';
import { getRepo } from './db/repo';
import type { SimulationMeta } from './types';

function assertSafe(segment: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(segment) || segment === '.' || segment === '..') {
    throw new Error('invalid path segment');
  }
}

function simsRoot(): string {
  return path.join(dataDir(), 'simulations');
}
function simDir(id: string): string {
  return path.join(simsRoot(), id);
}
function artifactPath(id: string): string {
  return path.join(simDir(id), 'artifact.html');
}

/**
 * Владение проверяется до любого обращения к диску: каталог адресуется по uuid,
 * поэтому единственная защита от чужого id — запись в базе. Отсутствие прав и
 * отсутствие записи неотличимы намеренно (см. спецификацию, раздел 4).
 */
async function owned(ownerId: string, id: string): Promise<boolean> {
  assertSafe(id);
  const rec = await getRepo().get(id);
  return !!rec && rec.ownerId === ownerId;
}

export async function createSimulation(
  ownerId: string,
  input: { title: string; prompt: string; subject: string; tags: string[]; warning?: string; demo?: string },
  html: string,
): Promise<SimulationMeta> {
  const now = new Date().toISOString();
  const meta: SimulationMeta = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...input };
  await getRepo().insert({ ...meta, ownerId });
  fs.mkdirSync(path.join(simDir(meta.id), 'history'), { recursive: true });
  fs.writeFileSync(artifactPath(meta.id), html);
  return meta;
}

export async function getMeta(ownerId: string, id: string): Promise<SimulationMeta | null> {
  assertSafe(id);
  const rec = await getRepo().get(id);
  if (!rec || rec.ownerId !== ownerId) return null;
  const { ownerId: _owner, ...meta } = rec;
  return meta;
}

export async function getArtifact(ownerId: string, id: string): Promise<string | null> {
  if (!(await owned(ownerId, id))) return null;
  try {
    return fs.readFileSync(artifactPath(id), 'utf8');
  } catch {
    // Запись в базе есть, а файла нет — библиотека не должна падать целиком.
    return null;
  }
}

/** HTML для показа/скачивания: всегда со СВЕЖИМ рантаймом (ретроактивно для старых симов). */
export async function getRenderableArtifact(ownerId: string, id: string): Promise<string | null> {
  const html = await getArtifact(ownerId, id);
  return html === null ? null : reinstrument(html);
}

export async function listSimulations(ownerId: string): Promise<SimulationMeta[]> {
  return getRepo().listByOwner(ownerId);
}

export async function updateArtifact(ownerId: string, id: string, html: string): Promise<boolean> {
  if (!(await owned(ownerId, id))) return false;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const historyDir = path.join(simDir(id), 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  let historyFile = path.join(historyDir, `${stamp}.html`);
  let suffix = 2;
  while (fs.existsSync(historyFile)) {
    historyFile = path.join(historyDir, `${stamp}-${suffix}.html`);
    suffix++;
  }
  fs.renameSync(artifactPath(id), historyFile);
  fs.writeFileSync(artifactPath(id), html);
  await getRepo().touch(id, new Date().toISOString());
  return true;
}

export async function listHistory(ownerId: string, id: string): Promise<string[] | null> {
  if (!(await owned(ownerId, id))) return null;
  const dir = path.join(simDir(id), 'history');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().reverse();
}

export async function restoreVersion(ownerId: string, id: string, name: string): Promise<boolean> {
  assertSafe(name);
  if (!(await owned(ownerId, id))) return false;
  const restored = fs.readFileSync(path.join(simDir(id), 'history', name), 'utf8');
  return updateArtifact(ownerId, id, restored);
}

export async function deleteSimulation(ownerId: string, id: string): Promise<void> {
  if (!(await owned(ownerId, id))) return;
  await getRepo().remove(id);
  fs.rmSync(simDir(id), { recursive: true, force: true });
}

export async function saveThumbnail(ownerId: string, id: string, png: Buffer): Promise<boolean> {
  if (!(await owned(ownerId, id))) return false;
  fs.mkdirSync(simDir(id), { recursive: true });
  fs.writeFileSync(path.join(simDir(id), 'thumbnail.png'), png);
  return true;
}

export async function getThumbnailPath(ownerId: string, id: string): Promise<string | null> {
  if (!(await owned(ownerId, id))) return null;
  const p = path.join(simDir(id), 'thumbnail.png');
  return fs.existsSync(p) ? p : null;
}
```

- [ ] **Step 4: Провести `ownerId` через пайплайн и демки**

В `src/lib/pipeline/run.ts`:
- поле `ownerId: string` добавляется во входной объект `runPipeline` (тот же объект, где `prompt`, `imageDataUrl`, `mode`);
- вызовы `createSimulation(...)`, `saveThumbnail(...)` получают `input.ownerId` первым аргументом и `await`;
- `refineExisting(ctx, id, instruction)` становится `refineExisting(ctx, ownerId, id, instruction)`; внутри `getArtifact`, `updateArtifact`, `saveThumbnail` получают `ownerId` и `await`. Если `getArtifact` вернул `null`, бросить `new Error('Симуляция не найдена')`.

В `src/lib/demos.ts`: `installDemos(ownerId: string, render: RenderFn = renderArtifact)`; проверка «уже установлено» переходит с `listSimulations()` на `getRepo().hasDemo(ownerId, demo.slug)`; `createSimulation`/`saveThumbnail` получают `ownerId`. Кэш `installPromise` становится `Map<string, Promise<...>>` по `ownerId` — иначе два пользователя, нажавшие кнопку одновременно, разделят один запуск и второй получит чужой результат.

В `evals/run.ts`: `runPipeline` получает `ownerId`, значение берётся из переменной окружения `SHOWMEHOW_EVAL_OWNER_ID` (в отсутствие — понятная ошибка с текстом «Задайте SHOWMEHOW_EVAL_OWNER_ID: id пользователя, которому принадлежат прогоны»). Вызовы `getArtifact` получают тот же id и `await`.

- [ ] **Step 5: Провести владельца через роуты — временно фиксированным значением**

Аутентификации ещё нет (Task 4-5). Чтобы дерево оставалось собираемым и тестируемым, ввести временный модуль `src/lib/auth/current.ts`:

```ts
/**
 * Временный владелец: аутентификация появляется в задаче 5, до этого все роуты
 * работают от одного фиксированного пользователя. Модуль удаляется в задаче 6.
 */
export const TEMP_OWNER_ID = '00000000-0000-0000-0000-0000000000ff';
```

Каждый роут из списка Files получает `TEMP_OWNER_ID` первым аргументом в вызовы хранилища и `await`, а `null` из хранилища превращает в 404 (для `thumbnail` — 404 без тела, как сейчас). `assertSafe` по-прежнему бросает, и обработчики оставляют для этого случая 400.

`src/app/present/[id]/page.tsx`: `getRenderableArtifact(TEMP_OWNER_ID, id)`, `null` → «Симуляция не найдена.»

- [ ] **Step 6: Обновить тесты потребителей**

В `tests/unit/api.test.ts`, `tests/unit/demos.test.ts`, `tests/unit/demos-api.test.ts`, `tests/unit/run.test.ts`, `tests/integration/demos.test.ts`: в `beforeEach` добавить `__setRepoForTests(createMemoryRepo())`, в вызовы хранилища — `TEMP_OWNER_ID` (импортировать из `@/lib/auth/current`) и `await`. Логику проверок не менять.

- [ ] **Step 7: Прогнать всё**

Run: `npx vitest run && npx tsc --noEmit`
Expected: зелёные. Число тестов растёт на изоляционный тест из шага 1.

- [ ] **Step 8: Закоммитить**

```bash
git add -A
git commit -m "feat(storage): owner-scoped async storage backed by the metadata repo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Пароли, пользователи, сессии

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/users.ts`, `src/lib/auth/session.ts`, `tests/unit/auth-password.test.ts`, `tests/integration/auth-session.test.ts`

**Interfaces:**
- Consumes: `db()`, `hasDb()` (Task 1).
- Produces:

```ts
// password.ts
export function hashPassword(plain: string): string;         // 'scrypt$<saltHex>$<hashHex>'
export function verifyPassword(plain: string, stored: string): boolean;

// users.ts
export type Role = 'admin' | 'user';
export interface AuthUser { id: string; email: string; role: Role }
export function normalizeEmail(raw: string): string;
export function roleForEmail(email: string): Role;
export async function createUser(email: string, password: string): Promise<AuthUser>;  // бросает EmailTakenError
export async function findUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string }) | null>;
export async function findUserById(id: string): Promise<AuthUser | null>;
export class EmailTakenError extends Error {}

// session.ts
export const SESSION_COOKIE = 'showmehow_session';
export const SESSION_TTL_MS: number;                          // 30 суток
export async function createSession(userId: string): Promise<string>;   // сырой токен для cookie
export async function resolveSession(token: string | undefined): Promise<AuthUser | null>;
export async function destroySession(token: string | undefined): Promise<void>;
export function readCookie(req: Request, name: string): string | undefined;
export async function currentUserFromRequest(req: Request): Promise<AuthUser | null>;
export async function currentUserFromCookies(): Promise<AuthUser | null>;
```

- [ ] **Step 1: Написать падающий тест паролей**

`tests/unit/auth-password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('пароли', () => {
  it('хеш не содержит пароля и проверяется', () => {
    const stored = hashPassword('очень секретно');
    expect(stored).not.toContain('очень секретно');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('очень секретно', stored)).toBe(true);
    expect(verifyPassword('другое', stored)).toBe(false);
  });

  it('два хеша одного пароля различаются солью', () => {
    expect(hashPassword('одинаковый')).not.toBe(hashPassword('одинаковый'));
  });

  it('повреждённая строка хеша не роняет проверку', () => {
    expect(verifyPassword('x', 'мусор')).toBe(false);
    expect(verifyPassword('x', 'scrypt$нехекс$нехекс')).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/auth-password.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать пароли**

`src/lib/auth/password.ts`:

```ts
import crypto from 'node:crypto';

const KEY_LEN = 64;

/** Формат хранения: scrypt$<соль hex>$<хеш hex>. Соль своя у каждого пароля. */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length === 0 || expected.length !== KEY_LEN) return false;
    const actual = crypto.scryptSync(plain, salt, KEY_LEN);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    // Повреждённая строка в базе не должна ронять вход — это просто неверный пароль.
    return false;
  }
}
```

- [ ] **Step 4: Написать падающий тест пользователей и сессий**

`tests/integration/auth-session.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, findUserByEmail, normalizeEmail, roleForEmail, EmailTakenError } from '@/lib/auth/users';
import { createSession, resolveSession, destroySession, readCookie, SESSION_COOKIE } from '@/lib/auth/session';

const url = process.env.SHOWMEHOW_TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url }) : null;

beforeAll(async () => {
  if (!pool) return;
  process.env.DATABASE_URL = url;
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM sessions; DELETE FROM users;');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe('нормализация и роли', () => {
  it('почта приводится к нижнему регистру без пробелов', () => {
    expect(normalizeEmail('  Ivan@Example.COM ')).toBe('ivan@example.com');
  });
  it('роль админа определяется переменной окружения', () => {
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'Boss@example.com';
    expect(roleForEmail('boss@example.com')).toBe('admin');
    expect(roleForEmail('other@example.com')).toBe('user');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
  });
});

describe.skipIf(!pool)('пользователи и сессии', () => {
  it('создаёт пользователя и не даёт завести второго с той же почтой', async () => {
    const u = await createUser('Ivan@Example.com', 'пароль123');
    expect(u.email).toBe('ivan@example.com');
    expect(u.role).toBe('user');
    await expect(createUser('ivan@example.com', 'другой123')).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('сессия резолвится по токену и гаснет после выхода', async () => {
    const u = await createUser('a@example.com', 'пароль123');
    const token = await createSession(u.id);
    expect((await resolveSession(token))?.id).toBe(u.id);
    await destroySession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it('в базе лежит не сам токен, а его хеш', async () => {
    const u = await createUser('b@example.com', 'пароль123');
    const token = await createSession(u.id);
    const { rows } = await pool!.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
  });

  it('просроченная сессия не резолвится', async () => {
    const u = await createUser('c@example.com', 'пароль123');
    const token = await createSession(u.id);
    await pool!.query("UPDATE sessions SET expires_at = now() - interval '1 day'");
    expect(await resolveSession(token)).toBeNull();
  });

  it('неизвестный токен и отсутствие токена дают null', async () => {
    expect(await resolveSession(undefined)).toBeNull();
    expect(await resolveSession('такого-нет')).toBeNull();
  });

  it('пароль проверяется через findUserByEmail', async () => {
    await createUser('d@example.com', 'пароль123');
    const found = await findUserByEmail('D@Example.com');
    expect(found?.passwordHash.startsWith('scrypt$')).toBe(true);
  });
});

describe('чтение cookie', () => {
  it('достаёт нужное значение из заголовка', () => {
    const req = new Request('http://t', { headers: { cookie: `a=1; ${SESSION_COOKIE}=токен; b=2` } });
    expect(readCookie(req, SESSION_COOKIE)).toBe('токен');
    expect(readCookie(new Request('http://t'), SESSION_COOKIE)).toBeUndefined();
  });
});
```

- [ ] **Step 5: Запустить — убедиться, что падает**

Run: `npx vitest run tests/integration/auth-session.test.ts`
Expected: FAIL — модулей нет.

- [ ] **Step 6: Реализовать пользователей**

`src/lib/auth/users.ts`:

```ts
import crypto from 'node:crypto';
import { db } from '../db/client';
import { hashPassword } from './password';

export type Role = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export class EmailTakenError extends Error {
  constructor() { super('Такая почта уже зарегистрирована'); }
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Админ ровно один и задаётся окружением: отдельного интерфейса управления ролями нет. */
export function roleForEmail(email: string): Role {
  const admin = process.env.SHOWMEHOW_ADMIN_EMAIL;
  return admin && normalizeEmail(admin) === normalizeEmail(email) ? 'admin' : 'user';
}

export async function createUser(rawEmail: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(rawEmail);
  const user: AuthUser = { id: crypto.randomUUID(), email, role: roleForEmail(email) };
  try {
    await db().query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1,$2,$3,$4)',
      [user.id, email, hashPassword(password), user.role]);
  } catch (e) {
    // 23505 — нарушение UNIQUE по email.
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
      throw new EmailTakenError();
    }
    throw e;
  }
  return user;
}

export async function findUserByEmail(
  rawEmail: string,
): Promise<(AuthUser & { passwordHash: string }) | null> {
  const { rows } = await db().query<{ id: string; email: string; role: Role; password_hash: string }>(
    'SELECT id, email, role, password_hash FROM users WHERE email = $1', [normalizeEmail(rawEmail)]);
  const r = rows[0];
  return r ? { id: r.id, email: r.email, role: r.role, passwordHash: r.password_hash } : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await db().query<{ id: string; email: string; role: Role }>(
    'SELECT id, email, role FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}
```

- [ ] **Step 7: Реализовать сессии**

`src/lib/auth/session.ts`:

```ts
import crypto from 'node:crypto';
import { db } from '../db/client';
import { findUserById, type AuthUser } from './users';

export const SESSION_COOKIE = 'showmehow_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Продлеваем срок не чаще раза в сутки, чтобы не писать в базу на каждый запрос. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db().query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)',
    [hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS)]);
  return token;
}

export async function resolveSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const hash = hashToken(token);
  const { rows } = await db().query<{ user_id: string; expires_at: Date }>(
    'SELECT user_id, expires_at FROM sessions WHERE token_hash = $1', [hash]);
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) {
    // Просроченную строку убираем лениво, при первом же обращении.
    await db().query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
    return null;
  }
  if (row.expires_at.getTime() - Date.now() < SESSION_TTL_MS - RENEW_AFTER_MS) {
    await db().query('UPDATE sessions SET expires_at = $2 WHERE token_hash = $1',
      [hash, new Date(Date.now() + SESSION_TTL_MS)]);
  }
  return findUserById(row.user_id);
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db().query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Для роутов: токен берётся из заголовка запроса, а не из next/headers — так роут тестируется вызовом. */
export async function currentUserFromRequest(req: Request): Promise<AuthUser | null> {
  return resolveSession(readCookie(req, SESSION_COOKIE));
}

/** Для серверных компонентов и страниц, где Request недоступен. */
export async function currentUserFromCookies(): Promise<AuthUser | null> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}
```

- [ ] **Step 8: Прогнать с базой и без**

Run: `npx vitest run tests/unit/auth-password.test.ts tests/integration/auth-session.test.ts`
Expected: PASS (наборы с базой пропущены).
Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/auth-session.test.ts`
Expected: PASS полностью.

- [ ] **Step 9: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(auth): scrypt passwords, users and database-backed sessions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Роуты входа, middleware, страницы `/login` и `/register`

**Files:**
- Create: `src/app/api/auth/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/me/route.ts`, `src/lib/auth/rate-limit.ts`, `src/lib/auth/cookie.ts`, `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/components/AuthForm.tsx`, `tests/integration/auth-api.test.ts`
- Modify: `src/app/layout.tsx`, `src/components/NavLinks.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `createUser`, `findUserByEmail`, `EmailTakenError`, `createSession`, `destroySession`, `currentUserFromRequest`, `SESSION_COOKIE`, `SESSION_TTL_MS`, `verifyPassword` (Task 4).
- Produces:
  - `POST /api/auth/register` `{ email, password }` → 200 `{ user }` + cookie; 400 при невалидном вводе; 409 при занятой почте;
  - `POST /api/auth/login` `{ email, password }` → 200 `{ user }` + cookie; 401 «Неверная почта или пароль»; 429 при превышении попыток;
  - `POST /api/auth/logout` → 200 `{ ok: true }`, cookie гасится;
  - `GET /api/me` → 200 `{ user }` или 401;
  - `hitLimit(key: string): boolean` из `rate-limit.ts` — `true`, если лимит исчерпан;
  - `setSessionCookie(res: NextResponse, token: string): NextResponse` и `MIN_PASSWORD_LENGTH = 8` из `src/lib/auth/cookie.ts`.

**Важно:** файл `route.ts` в Next.js 15 может экспортировать только методы HTTP и известные настройки сегмента. Экспорт из него любой вспомогательной функции ломает сборку типов, поэтому `setSessionCookie` и `MIN_PASSWORD_LENGTH` живут в `src/lib/auth/cookie.ts`, а не в роуте регистрации.

- [ ] **Step 1: Написать падающий тест API входа**

`tests/integration/auth-api.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/me/route';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const url = process.env.SHOWMEHOW_TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url }) : null;

function post(body: unknown, cookie?: string): Request {
  return new Request('http://t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function cookieOf(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0];
}

beforeAll(async () => {
  if (!pool) return;
  process.env.DATABASE_URL = url;
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('DELETE FROM sessions; DELETE FROM users;');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('api аутентификации', () => {
  it('регистрирует, ставит cookie и узнаёт пользователя', async () => {
    const res = await register(post({ email: 'a@example.com', password: 'пароль123' }));
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    const whoami = await me(new Request('http://t', { headers: { cookie } }));
    expect((await whoami.json()).user.email).toBe('a@example.com');
  });

  it('короткий пароль и кривая почта отклоняются', async () => {
    expect((await register(post({ email: 'a@example.com', password: 'коротк' }))).status).toBe(400);
    expect((await register(post({ email: 'не-почта', password: 'пароль123' }))).status).toBe(400);
  });

  it('занятая почта даёт 409', async () => {
    await register(post({ email: 'b@example.com', password: 'пароль123' }));
    expect((await register(post({ email: 'B@example.com', password: 'пароль123' }))).status).toBe(409);
  });

  it('неверная почта и неверный пароль дают один и тот же ответ', async () => {
    await register(post({ email: 'c@example.com', password: 'пароль123' }));
    const wrongPass = await login(post({ email: 'c@example.com', password: 'неверный1' }));
    const noUser = await login(post({ email: 'нет@example.com', password: 'неверный1' }));
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPass.json()).toEqual(await noUser.json());
  });

  it('выход гасит сессию', async () => {
    const reg = await register(post({ email: 'd@example.com', password: 'пароль123' }));
    const cookie = cookieOf(reg);
    await logout(post({}, cookie));
    expect((await me(new Request('http://t', { headers: { cookie } }))).status).toBe(401);
  });

  it('одиннадцатая попытка входа отклоняется с 429', async () => {
    await register(post({ email: 'e@example.com', password: 'пароль123' }));
    for (let i = 0; i < 10; i++) {
      await login(post({ email: 'e@example.com', password: 'неверный1' }));
    }
    expect((await login(post({ email: 'e@example.com', password: 'пароль123' }))).status).toBe(429);
  });
});

describe('me без сессии', () => {
  it('отдаёт 401', async () => {
    expect((await me(new Request('http://t'))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/integration/auth-api.test.ts`
Expected: FAIL — роутов нет.

- [ ] **Step 3: Реализовать ограничитель попыток**

`src/lib/auth/rate-limit.ts`:

```ts
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, number[]>();

/**
 * Скользящее окно в памяти процесса. Пробной версии этого достаточно: цель —
 * не дать перебирать пароли в лоб, а не пережить перезапуск.
 */
export function hitLimit(key: string): boolean {
  const now = Date.now();
  const fresh = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  fresh.push(now);
  attempts.set(key, fresh);
  return fresh.length > MAX_ATTEMPTS;
}

export function __resetAttemptsForTests(): void {
  attempts.clear();
}
```

- [ ] **Step 4: Реализовать роуты**

`src/lib/auth/cookie.ts`:

```ts
import type { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS } from './session';

export const MIN_PASSWORD_LENGTH = 8;

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
```

`src/app/api/auth/register/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createUser, EmailTakenError, normalizeEmail } from '@/lib/auth/users';
import { createSession } from '@/lib/auth/session';
import { setSessionCookie, MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !EMAIL_RE.test(normalizeEmail(email))) {
    return NextResponse.json({ error: 'Введите корректный адрес почты.' }, { status: 400 });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }
  try {
    const user = await createUser(email, password);
    const token = await createSession(user.id);
    return setSessionCookie(NextResponse.json({ user }), token);
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: 'Такая почта уже зарегистрирована.' }, { status: 409 });
    }
    throw e;
  }
}
```

`src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { findUserByEmail, normalizeEmail } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { hitLimit } from '@/lib/auth/rate-limit';
import { setSessionCookie } from '@/lib/auth/cookie';

// Один и тот же текст для неизвестной почты и неверного пароля: иначе форма входа
// превращается в способ узнать, кто зарегистрирован.
const WRONG = 'Неверная почта или пароль.';

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  if (hitLimit(ip)) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }
  const found = await findUserByEmail(normalizeEmail(email));
  if (!found || !verifyPassword(password, found.passwordHash)) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }
  const token = await createSession(found.id);
  const user = { id: found.id, email: found.email, role: found.role };
  return setSessionCookie(NextResponse.json({ user }), token);
}
```

`src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { destroySession, readCookie, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: Request) {
  await destroySession(readCookie(req, SESSION_COOKIE));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
```

`src/app/api/me/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { currentUserFromRequest } from '@/lib/auth/session';

export async function GET(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ user });
}
```

- [ ] **Step 5: Написать middleware**

`src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

const PUBLIC_PREFIXES = ['/login', '/register', '/api/auth/'];

/**
 * Дешёвый фильтр, а не гарантия: middleware исполняется в Edge-рантайме и не может
 * обратиться к Postgres, поэтому проверяет только наличие cookie. Настоящая проверка
 * сессии живёт в каждом роуте и серверном компоненте (currentUserFrom*).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Требуется вход в систему.' }, { status: 401 });
  }
  const to = req.nextUrl.clone();
  to.pathname = '/login';
  to.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 6: Сделать страницы входа и регистрации**

`src/components/AuthForm.tsx` — общая форма на два режима:

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/auth/${isLogin ? 'login' : 'register'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(search.get('next') || '/');
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Не удалось войти. Попробуйте ещё раз.');
      }
    } catch {
      setError('Сеть недоступна. Проверьте соединение и попробуйте снова.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <h1>{isLogin ? 'Вход' : 'Регистрация'}</h1>
      <label>Почта
        <input type="email" value={email} autoComplete="email" required
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>Пароль
        <input type="password" value={password} required minLength={8}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error-box">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Минуту…' : isLogin ? 'Войти' : 'Зарегистрироваться'}
      </button>
      <p className="muted">
        {isLogin ? 'Ещё нет аккаунта? ' : 'Уже есть аккаунт? '}
        <a href={isLogin ? '/register' : '/login'}>{isLogin ? 'Зарегистрироваться' : 'Войти'}</a>
      </p>
    </form>
  );
}
```

`src/app/login/page.tsx` и `src/app/register/page.tsx` — обёртки:

```tsx
import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <div className="auth-page">
      <Suspense><AuthForm mode="login" /></Suspense>
    </div>
  );
}
```

(в `register/page.tsx` — `mode="register"` и имя `RegisterPage`; `Suspense` обязателен, потому что `useSearchParams` требует границы приостановки при пререндере).

Стили в `src/app/globals.css` — блок `.auth-page`/`.auth-card` в существующей тёмной палитре: карточка по центру экрана, максимальная ширина 360px, поля на всю ширину, вертикальный ритм 12px.

- [ ] **Step 7: Показать пользователя в шапке**

`src/app/layout.tsx` становится асинхронным серверным компонентом: читает `currentUserFromCookies()` и передаёт почту и роль в `NavLinks`. `NavLinks` получает необязательный проп `user?: { email: string; role: string }` и рисует справа почту и кнопку «Выйти», которая делает `POST /api/auth/logout` и `router.push('/login')`. Если `user` нет — ничего не рисует (страницы входа).

- [ ] **Step 8: Прогнать**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/auth-api.test.ts`
Expected: PASS.
Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: зелёные.

- [ ] **Step 9: Закоммитить**

```bash
git add -A
git commit -m "feat(auth): login, registration, session cookie and route guard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Владелец из сессии во всех роутах вместо временной заглушки

**Files:**
- Modify: `src/app/api/simulations/route.ts`, `src/app/api/simulations/[id]/route.ts`, `src/app/api/simulations/[id]/export/route.ts`, `src/app/api/simulations/[id]/history/route.ts`, `src/app/api/simulations/[id]/thumbnail/route.ts`, `src/app/api/simulations/[id]/refine/route.ts`, `src/app/api/demos/route.ts`, `src/app/present/[id]/page.tsx`
- Delete: `src/lib/auth/current.ts`
- Test: `tests/unit/api.test.ts`, `tests/integration/api-ownership.test.ts` (создать)

**Interfaces:**
- Consumes: `currentUserFromRequest`, `currentUserFromCookies` (Task 4), хранилище с `ownerId` (Task 3).
- Produces: `unauthorized(): NextResponse` в `src/lib/auth/guard.ts` — единый ответ 401 `{ error: 'Требуется вход в систему.' }`.

- [ ] **Step 1: Написать падающий тест изоляции владельцев**

`tests/integration/api-ownership.test.ts`: два пользователя создаются через `createUser`, каждому — сессия через `createSession`; первый создаёт симуляцию через `createSimulation`; затем для каждого защищённого роута проверяется, что с cookie второго ответ 404, а без cookie — 401.

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createSimulation } from '@/lib/storage';
import { GET as getSim, DELETE as delSim } from '@/app/api/simulations/[id]/route';
import { GET as getExport } from '@/app/api/simulations/[id]/export/route';
import { GET as getHistory } from '@/app/api/simulations/[id]/history/route';
import { GET as getThumbnail } from '@/app/api/simulations/[id]/thumbnail/route';
import { GET as listSims } from '@/app/api/simulations/route';

const url = process.env.SHOWMEHOW_TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url }) : null;

let simId = '';
let mine = '';
let theirs = '';

beforeAll(async () => {
  if (!pool) return;
  process.env.DATABASE_URL = url;
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  await pool.query('DELETE FROM sessions; DELETE FROM simulations; DELETE FROM users;');
  const a = await createUser('owner@example.com', 'пароль123');
  const b = await createUser('stranger@example.com', 'пароль123');
  mine = `${SESSION_COOKIE}=${await createSession(a.id)}`;
  theirs = `${SESSION_COOKIE}=${await createSession(b.id)}`;
  const meta = await createSimulation(
    a.id, { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>x</html>');
  simId = meta.id;
});
afterAll(async () => { await pool?.end(); await closeDb(); });

function req(cookie?: string): Request {
  return new Request('http://t', { headers: cookie ? { cookie } : {} });
}

describe.skipIf(!pool)('изоляция владельцев', () => {
  it('чужая симуляция даёт 404, отсутствие сессии — 401', async () => {
    const params = () => Promise.resolve({ id: simId });
    for (const handler of [getSim, getExport, getHistory, getThumbnail]) {
      expect((await handler(req(mine), { params: params() })).status).toBe(200);
      expect((await handler(req(theirs), { params: params() })).status).toBe(404);
      expect((await handler(req(), { params: params() })).status).toBe(401);
    }
    expect((await delSim(req(theirs), { params: params() })).status).toBe(404);
    expect((await getSim(req(mine), { params: params() })).status).toBe(200);
  });

  it('список содержит только свои симуляции', async () => {
    expect(await (await listSims(req(mine))).json()).toHaveLength(1);
    expect(await (await listSims(req(theirs))).json()).toHaveLength(0);
  });
});
```

Замечание: `getThumbnail` для симуляции без превью вернёт 404 и владельцу. Чтобы проверка «владельцу 200» была осмысленной, в `beforeEach` после создания симуляции положить превью: `await saveThumbnail(a.id, meta.id, Buffer.from('png'))`.

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/api-ownership.test.ts`
Expected: FAIL — роуты пока работают от `TEMP_OWNER_ID` и не смотрят на cookie.

- [ ] **Step 3: Ввести общий guard**

`src/lib/auth/guard.ts`:

```ts
import { NextResponse } from 'next/server';

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Требуется вход в систему.' }, { status: 401 });
}
```

- [ ] **Step 4: Переключить роуты на сессию**

В каждом роуте из списка Files: первым действием `const user = await currentUserFromRequest(req);` и `if (!user) return unauthorized();` (для `export`/`thumbnail`, отвечающих не через `NextResponse.json`, — `new Response(null, { status: 401 })` и `Response` с JSON соответственно, сохраняя текущий стиль ответа роута). Далее `user.id` подставляется вместо `TEMP_OWNER_ID`. Сигнатуры хендлеров, где сейчас первый аргумент назван `_req`, переименовать в `req`.

`src/app/api/demos/route.ts`: `installDemos(user.id)`.

`src/app/present/[id]/page.tsx`: `const user = await currentUserFromCookies(); if (!user) redirect('/login');` затем `getRenderableArtifact(user.id, id)`.

Удалить `src/lib/auth/current.ts` и все его импорты.

- [ ] **Step 5: Обновить `tests/unit/api.test.ts`**

Эти тесты вызывают роуты напрямую и не имеют базы. Чтобы они остались осмысленными и быстрыми, в них подменяется резолвер сессии:

```ts
import { vi } from 'vitest';

const TEST_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@t', role: 'user' as const };

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => TEST_USER,
  currentUserFromCookies: async () => TEST_USER,
}));
```

Все вызовы хранилища в этом файле получают `TEST_USER.id`. Существующие проверки 400/404 сохраняются без изменений.

- [ ] **Step 6: Прогнать**

Run: `npx vitest run && npx tsc --noEmit`
Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration`
Expected: зелёные.

- [ ] **Step 7: Закоммитить**

```bash
git add -A
git commit -m "feat(api): resolve the owner from the session in every route

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Задания в базе, квота и ограничители параллелизма

**Files:**
- Modify: `src/lib/jobs.ts`, `src/lib/types.ts`, `src/app/api/generate/route.ts`, `src/app/api/jobs/[id]/route.ts`, `src/app/api/jobs/[id]/stream/route.ts`, `src/app/api/jobs/[id]/cancel/route.ts`, `src/app/api/simulations/[id]/refine/route.ts`
- Create: `src/lib/quota.ts`, `src/lib/limits.ts`, `tests/unit/limits.test.ts`, `tests/integration/quota.test.ts`
- Test: `tests/unit/jobs.test.ts`, `tests/unit/jobs-api.test.ts`

**Interfaces:**
- Consumes: `db()`, `currentUserFromRequest`, `AuthUser`.
- Produces:

```ts
// quota.ts
export const TRIAL_LIMIT = 10;
export interface QuotaStatus { limit: number | null; used: number; remaining: number | null }
export async function quotaStatus(user: AuthUser): Promise<QuotaStatus>;  // limit null у админа
export const QUOTA_EXHAUSTED_MESSAGE: string;

// limits.ts
export const MAX_CONCURRENT = 2;
export function hasActive(userId: string): boolean;
export function submit(jobId: string, userId: string, start: () => void): 'running' | 'queued';
export function finish(jobId: string): void;
export function queuePosition(jobId: string): number;   // 1-based; 0 если не в очереди
export function setQueueListener(cb: (jobId: string, position: number) => void): void;
export function __resetLimitsForTests(): void;

// jobs.ts (изменения)
export interface Job { id: string; ownerId: string; status: JobStatus; /* остальное как было */ }
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export function createJob(ownerId: string, request: JobRequest): Job;
export function getJob(ownerId: string, id: string): Job | null;
export function setStatus(id: string, status: JobStatus): void;
```

`PipelineEvent` пополняется вариантом `{ type: 'queued'; position: number }`.

- [ ] **Step 1: Написать падающий тест ограничителей**

`tests/unit/limits.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { submit, finish, hasActive, queuePosition, setQueueListener, __resetLimitsForTests, MAX_CONCURRENT } from '@/lib/limits';

beforeEach(() => { __resetLimitsForTests(); });

describe('ограничители параллелизма', () => {
  it('первые MAX_CONCURRENT заданий стартуют сразу', () => {
    const started: string[] = [];
    expect(submit('a', 'u1', () => started.push('a'))).toBe('running');
    expect(submit('b', 'u2', () => started.push('b'))).toBe('running');
    expect(started).toEqual(['a', 'b']);
    expect(MAX_CONCURRENT).toBe(2);
  });

  it('сверх лимита задание встаёт в очередь и стартует при освобождении места', () => {
    const started: string[] = [];
    submit('a', 'u1', () => started.push('a'));
    submit('b', 'u2', () => started.push('b'));
    expect(submit('c', 'u3', () => started.push('c'))).toBe('queued');
    expect(queuePosition('c')).toBe(1);
    expect(started).toEqual(['a', 'b']);
    finish('a');
    expect(started).toEqual(['a', 'b', 'c']);
    expect(queuePosition('c')).toBe(0);
  });

  it('рассылает новую позицию всем ожидающим после сдвига очереди', () => {
    const seen: [string, number][] = [];
    setQueueListener((jobId, position) => seen.push([jobId, position]));
    submit('a', 'u1', () => {});
    submit('b', 'u2', () => {});
    submit('c', 'u3', () => {});
    submit('d', 'u4', () => {});
    seen.length = 0;
    finish('a');           // 'c' стартует, 'd' сдвигается на первое место
    expect(seen).toEqual([['d', 1]]);
  });

  it('знает, есть ли активное задание у пользователя', () => {
    expect(hasActive('u1')).toBe(false);
    submit('a', 'u1', () => {});
    expect(hasActive('u1')).toBe(true);
    finish('a');
    expect(hasActive('u1')).toBe(false);
  });

  it('ожидающее задание тоже считается активным для своего пользователя', () => {
    submit('a', 'u1', () => {});
    submit('b', 'u2', () => {});
    submit('c', 'u3', () => {});
    expect(hasActive('u3')).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/limits.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать ограничители**

`src/lib/limits.ts`:

```ts
export const MAX_CONCURRENT = 2;

interface Waiting {
  jobId: string;
  userId: string;
  start: () => void;
}

const running = new Map<string, string>();   // jobId → userId
const queue: Waiting[] = [];
let listener: ((jobId: string, position: number) => void) | null = null;

/** Кого оповещать о сдвиге очереди. Ставится один раз при инициализации jobs.ts. */
export function setQueueListener(cb: (jobId: string, position: number) => void): void {
  listener = cb;
}

// Место в очереди видит пользователь, поэтому после любого сдвига всем ожидающим
// рассылается их новая позиция — иначе «перед вами 3» висело бы до самого старта.
function announce(): void {
  if (!listener) return;
  queue.forEach((w, i) => listener!(w.jobId, i + 1));
}

/** Есть ли у пользователя задание, которое уже идёт или ждёт очереди. */
export function hasActive(userId: string): boolean {
  for (const owner of running.values()) if (owner === userId) return true;
  return queue.some((w) => w.userId === userId);
}

/**
 * Одна генерация — это Chromium и несколько минут работы, поэтому одновременных
 * не больше MAX_CONCURRENT на весь сервер. Сверх лимита задание ждёт в FIFO-очереди.
 */
export function submit(jobId: string, userId: string, start: () => void): 'running' | 'queued' {
  if (running.size < MAX_CONCURRENT) {
    running.set(jobId, userId);
    start();
    return 'running';
  }
  queue.push({ jobId, userId, start });
  return 'queued';
}

export function finish(jobId: string): void {
  running.delete(jobId);
  const idx = queue.findIndex((w) => w.jobId === jobId);
  if (idx !== -1) queue.splice(idx, 1);
  while (running.size < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()!;
    running.set(next.jobId, next.userId);
    next.start();
  }
  announce();
}

/** Место в очереди, считая с единицы; 0 — задание не ждёт. */
export function queuePosition(jobId: string): number {
  const idx = queue.findIndex((w) => w.jobId === jobId);
  return idx === -1 ? 0 : idx + 1;
}

export function __resetLimitsForTests(): void {
  running.clear();
  queue.length = 0;
  listener = null;
}
```

- [ ] **Step 4: Реализовать квоту**

`src/lib/quota.ts`:

```ts
import { db } from './db/client';
import type { AuthUser } from './auth/users';

export const TRIAL_LIMIT = 10;

export interface QuotaStatus {
  limit: number | null;    // null — без ограничения (админ)
  used: number;
  remaining: number | null;
}

export const QUOTA_EXHAUSTED_MESSAGE =
  `Лимит пробной версии исчерпан: использовано ${TRIAL_LIMIT} из ${TRIAL_LIMIT} генераций. ` +
  'Доработка уже созданных симуляций по-прежнему доступна.';

/**
 * Израсходованное считается по журналу заданий, а не отдельным счётчиком в users:
 * два источника правды рано или поздно разойдутся. Тратят квоту только успешно
 * завершённые генерации — отменённые и упавшие не считаются.
 */
export async function quotaStatus(user: AuthUser): Promise<QuotaStatus> {
  if (user.role === 'admin') {
    return { limit: null, used: 0, remaining: null };
  }
  const { rows } = await db().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM jobs WHERE owner_id = $1 AND status = 'done'", [user.id]);
  const used = Number(rows[0]?.count ?? '0');
  return { limit: TRIAL_LIMIT, used, remaining: Math.max(0, TRIAL_LIMIT - used) };
}
```

- [ ] **Step 5: Переписать `jobs.ts` на базу и владельца**

Изменения в `src/lib/jobs.ts`:
- `Job` получает `ownerId: string`; `JobStatus` — значение `'queued'`;
- `createJob(ownerId, request)` пишет строку в таблицу `jobs` со статусом `queued` или `running` (статус ставится вызывающим через `setStatus` сразу после `submit`);
- **журнал событий в базу на каждое событие не пишется.** Хранится в памяти для SSE-реплея, а в базу уходит один раз при терминальном событии вместе с финальным статусом. Обоснование: после перезапуска процесса задание всё равно помечается ошибкой, поэтому промежуточный журнал на диске никому не нужен, а запись на каждое событие — это запрос к базе несколько раз в секунду;
- `getJob(ownerId, id)` возвращает `null`, если задание принадлежит другому;
- функции чтения с диска (`loadFromDisk`, `jobsRoot`, `jobPath`) удаляются; вместо них `loadFromDb(ownerId, id)`, помечающий найденные в статусах `running`/`queued` как `error` с текстом `'Сервер был перезапущен'`;
- `appendEvent` при терминальном событии дополнительно зовёт `finish(jobId)` из `limits.ts`;
- при загрузке модуля вызывается `setQueueListener((jobId, position) => appendEvent(jobId, { type: 'queued', position }))`, чтобы ожидающие задания получали свою новую позицию по SSE при каждом сдвиге очереди.

- [ ] **Step 6: Провести квоту и ограничители в `/api/generate`**

`src/app/api/generate/route.ts` после проверки провайдера:

```ts
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const quota = await quotaStatus(user);
  if (quota.remaining !== null && quota.remaining <= 0) {
    return NextResponse.json({ error: QUOTA_EXHAUSTED_MESSAGE }, { status: 403 });
  }
  if (hasActive(user.id)) {
    return NextResponse.json(
      { error: 'У вас уже идёт генерация. Дождитесь её окончания или отмените.' }, { status: 409 });
  }
  const mode = resolveMode(bodyMode);
  const job = createJob(user.id, { prompt, mode, hasImage: !!imageDataUrl });
  const state = submit(job.id, user.id,
    () => void runDetached(job.id, { prompt, imageDataUrl, mode, ownerId: user.id }));
  setStatus(job.id, state === 'running' ? 'running' : 'queued');
  if (state === 'queued') {
    appendEvent(job.id, { type: 'queued', position: queuePosition(job.id) });
  }
  return NextResponse.json({ jobId: job.id });
```

`src/app/api/jobs/[id]/route.ts`, `stream/route.ts`, `cancel/route.ts`: `currentUserFromRequest` → 401; `getJob(user.id, id)` → 404 для чужого. В `cancel` дополнительно вызвать `finish(id)`, если задание ждало в очереди и ещё не стартовало.

`src/app/api/simulations/[id]/refine/route.ts`: доработка квоту не тратит и ограничителю не подчиняется; нужен только владелец — `refineExisting(makeCtx(() => {}), user.id, id, instruction)`, `getArtifact(user.id, id)`, `null` → 404.

- [ ] **Step 7: Написать тест квоты**

`tests/integration/quota.test.ts`: создать пользователя, вставить в `jobs` десять строк со статусом `done` и по одной со статусами `cancelled` и `error`; проверить, что `quotaStatus` даёт `used: 10, remaining: 0`; для админа — `limit: null`. Затем через роут `/api/generate` (с подменённым провайдером через `SHOWMEHOW_API_KEY`/`SHOWMEHOW_MODEL` в окружении) проверить 403 и текст `QUOTA_EXHAUSTED_MESSAGE`.

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { quotaStatus, TRIAL_LIMIT } from '@/lib/quota';

const url = process.env.SHOWMEHOW_TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url }) : null;

beforeAll(async () => {
  if (!pool) return;
  process.env.DATABASE_URL = url;
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM jobs; DELETE FROM users;');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('квота', () => {
  async function addJob(ownerId: string, status: string) {
    await pool!.query(
      "INSERT INTO jobs (id, owner_id, status, request) VALUES ($1,$2,$3,'{}'::jsonb)",
      [crypto.randomUUID(), ownerId, status]);
  }

  it('считает только успешные генерации', async () => {
    const u = await createUser('a@example.com', 'пароль123');
    for (let i = 0; i < TRIAL_LIMIT; i++) await addJob(u.id, 'done');
    await addJob(u.id, 'cancelled');
    await addJob(u.id, 'error');
    expect(await quotaStatus(u)).toEqual({ limit: TRIAL_LIMIT, used: TRIAL_LIMIT, remaining: 0 });
  });

  it('у админа лимита нет', async () => {
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'boss@example.com';
    const admin = await createUser('boss@example.com', 'пароль123');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
    await addJob(admin.id, 'done');
    expect(await quotaStatus(admin)).toEqual({ limit: null, used: 0, remaining: null });
  });
});
```

- [ ] **Step 8: Обновить существующие тесты заданий**

`tests/unit/jobs.test.ts` и `tests/unit/jobs-api.test.ts`: `createJob`/`getJob` получают `ownerId`; сессия подменяется тем же `vi.mock('@/lib/auth/session', …)`, что и в Task 6, шаг 5; персистентность в базу в этих тестах отключается отсутствием `DATABASE_URL` (jobs.ts обязан работать в памяти, если базы нет, — как и репозиторий метаданных). Добавить тест: чужой владелец получает `null` из `getJob`.

- [ ] **Step 9: Прогнать**

Run: `npx vitest run && npx tsc --noEmit`
Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration`
Expected: зелёные.

- [ ] **Step 10: Закоммитить**

```bash
git add -A
git commit -m "feat(jobs): owner-scoped jobs, trial quota and concurrency limits

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Квота и очередь в интерфейсе

**Files:**
- Modify: `src/components/Workbench.tsx`, `src/components/progress/deriveProgress.ts`, `src/components/progress/stepCopy.ts`, `src/app/globals.css`
- Test: `tests/unit/derive-progress.test.ts`, `tests/unit/step-copy.test.ts`

**Interfaces:**
- Consumes: `GET /api/me` → `{ user }`; `GET /api/generate` не меняется; событие `{ type: 'queued'; position: number }`.
- Produces: ничего для других задач.

- [ ] **Step 1: Написать падающий тест копирайта очереди**

В `tests/unit/step-copy.test.ts`:

```ts
it('очередь описывается местом в ней', () => {
  expect(queuedCopy(1)).toContain('перед вами');
  expect(queuedCopy(1)).toContain('1');
});
```

В `tests/unit/derive-progress.test.ts`:

```ts
it('событие queued попадает в состояние прогресса', () => {
  const p = deriveProgress([{ type: 'queued', position: 3 }]);
  expect(p.queuePosition).toBe(3);
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/step-copy.test.ts tests/unit/derive-progress.test.ts`
Expected: FAIL — `queuedCopy` и поле `queuePosition` отсутствуют.

- [ ] **Step 3: Реализовать**

В `stepCopy.ts`:

```ts
export function queuedCopy(position: number): string {
  return `Задание в очереди: перед вами ${position}. Начнём, как только освободится место.`;
}
```

В `deriveProgress.ts` — поле `queuePosition: number` в возвращаемом объекте (0, если события `queued` не было); событие `queued` его заполняет, любое последующее событие `stage` сбрасывает в 0.

- [ ] **Step 4: Показать квоту и очередь в композере**

В `Workbench.tsx`:
- при монтировании `fetch('/api/me')`; в состоянии хранится `user` и `quota` (второе приходит новым полем ответа `/api/me`: расширить роут, чтобы он отдавал `{ user, quota }` через `quotaStatus`);
- под кнопкой «Создать», когда симуляция не открыта и `quota.limit !== null`: строка `Осталось {quota.remaining} из {quota.limit} генераций`;
- если `quota.remaining === 0`: кнопка «Создать» недоступна, под ней текст `QUOTA_EXHAUSTED_MESSAGE` (продублировать строку в клиентском коде нельзя — импортировать нечего, поэтому текст приходит в ответе `/api/me` полем `quotaMessage`, когда остаток нулевой);
- ответы 403 и 409 от `/api/generate` показываются как обычная ошибка в `error-box`;
- при `queuePosition > 0` вместо стадий выводится `queuedCopy(position)`.

- [ ] **Step 5: Прогнать**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

- [ ] **Step 6: Закоммитить**

```bash
git add -A
git commit -m "feat(ui): show trial quota and queue position in the composer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Миграция данных, Docker, документация

**Files:**
- Create: `scripts/migrate-to-db.ts`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- Modify: `README.md`, `package.json`, `next.config.ts`

**Interfaces:**
- Consumes: `applyMigrations`, `createUser`, `getRepo`, `dataDir`.
- Produces: команда `npm run migrate:data`.

- [ ] **Step 1: Написать скрипт переноса**

`scripts/migrate-to-db.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { db, closeDb } from '../src/lib/db/client';
import { applyMigrations } from './migrate';
import { createUser, findUserByEmail } from '../src/lib/auth/users';
import { dataDir } from '../src/lib/settings';
import type { SimulationMeta } from '../src/lib/types';

async function ensureAdmin(): Promise<string> {
  const email = process.env.SHOWMEHOW_ADMIN_EMAIL;
  const password = process.env.SHOWMEHOW_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Задайте SHOWMEHOW_ADMIN_EMAIL и SHOWMEHOW_ADMIN_PASSWORD');
  }
  const existing = await findUserByEmail(email);
  if (existing) return existing.id;
  return (await createUser(email, password)).id;
}

async function main(): Promise<void> {
  await applyMigrations(db());
  const ownerId = await ensureAdmin();
  const root = path.join(dataDir(), 'simulations');
  if (!fs.existsSync(root)) {
    console.log('Каталог симуляций пуст — переносить нечего');
    return;
  }
  let moved = 0, skipped = 0, broken = 0;
  for (const id of fs.readdirSync(root)) {
    const metaPath = path.join(root, id, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    let meta: SimulationMeta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      broken++;
      continue;
    }
    const { rowCount } = await db().query('SELECT 1 FROM simulations WHERE id = $1', [meta.id]);
    if (rowCount) { skipped++; continue; }
    await db().query(
      `INSERT INTO simulations (id, owner_id, title, prompt, subject, tags, warning, demo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [meta.id, ownerId, meta.title, meta.prompt, meta.subject, meta.tags,
        meta.warning ?? null, meta.demo ?? null, meta.createdAt, meta.updatedAt]);
    moved++;
  }
  console.log(`Перенесено: ${moved}, уже было: ${skipped}, повреждённых meta.json: ${broken}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());
```

В `package.json`: `"migrate:data": "tsx scripts/migrate-to-db.ts"`.

- [ ] **Step 2: Проверить перенос на копии данных**

```bash
cp -r data /tmp/smh-data-check
SHOWMEHOW_DATA_DIR=/tmp/smh-data-check \
DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow \
SHOWMEHOW_ADMIN_EMAIL=admin@example.com SHOWMEHOW_ADMIN_PASSWORD=адмпароль1 \
npm run migrate:data
```
Expected: печатает число перенесённых; повторный запуск печатает то же число в «уже было».

- [ ] **Step 3: Написать Dockerfile**

```dockerfile
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm start"]
```

`.dockerignore`: `node_modules`, `.next`, `data`, `test-results`, `.git`.

В `next.config.ts` ничего менять не нужно, если сборка уже проходит; если `npm start` требует `output: 'standalone'` — не добавлять, обычный `next start` в этом образе работает.

- [ ] **Step 4: Написать docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: showmehow
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-showmehow}
      POSTGRES_DB: showmehow
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U showmehow"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://showmehow:${POSTGRES_PASSWORD:-showmehow}@db:5432/showmehow
      SHOWMEHOW_API_KEY: ${SHOWMEHOW_API_KEY}
      SHOWMEHOW_MODEL: ${SHOWMEHOW_MODEL}
      SHOWMEHOW_BASE_URL: ${SHOWMEHOW_BASE_URL:-https://api.openai.com/v1}
      SHOWMEHOW_VISION_MODEL: ${SHOWMEHOW_VISION_MODEL:-}
      SHOWMEHOW_ADMIN_EMAIL: ${SHOWMEHOW_ADMIN_EMAIL:-}
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data

volumes:
  pgdata:
```

- [ ] **Step 5: Обновить README**

Добавить раздел «Аккаунты и база данных»: переменные `DATABASE_URL`, `SHOWMEHOW_ADMIN_EMAIL`, `SHOWMEHOW_ADMIN_PASSWORD`; команды `npm run migrate` и `npm run migrate:data`; запуск через `docker compose up --build`; правило «первый вошедший с почтой из `SHOWMEHOW_ADMIN_EMAIL` становится админом»; лимит 10 генераций; отсутствие восстановления пароля и как его сбросить запросом к базе. В разделе про тесты — переменная `SHOWMEHOW_TEST_DATABASE_URL` и то, что без неё наборы с базой пропускаются.

- [ ] **Step 6: Прогнать всё и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(deploy): data migration script, docker compose and docs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
