# Цикл 1. Воркер, очередь в базе, эксплуатация — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Генерация и доработка выполняются отдельным воркером, состояние заданий целиком живёт в Postgres, веб только принимает заявки и отдаёт прогресс. Плюс базовая эксплуатация: проверка здоровья, бэкапы, HTTPS, нагрузочный прогон.

**Architecture:** Очередь — таблица `jobs` с арендой (`locked_by`, `locked_until`), захват через `FOR UPDATE SKIP LOCKED`, журнал — таблица `job_events` с `seq`, доставка — `NOTIFY job_events` и одно соединение `LISTEN` на процесс. Доступ к заданиям идёт через интерфейс `JobStore` с двумя драйверами (Postgres и память), выбор — как у `getRepo()`. Воркер (`src/lib/worker/*`) берёт задания, ведёт сердцебиение и уборщика, выполняет `runPipeline`/`refineExisting` и завершает задание одной транзакцией. Воркер запускается службой `scripts/worker.ts`, а в `next dev` — встроенным из `src/instrumentation.ts`. Модули `src/lib/jobs.ts` и `src/lib/limits.ts` удаляются в конце, после переключения роутов.

**Tech Stack:** Next.js 15, React 19, TypeScript, Postgres 16, драйвер `pg`, vitest, Playwright (рендер артефактов и e2e), bash, systemd, Caddy.

**Spec:** `docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md`
**Карта:** `docs/superpowers/2026-09-16-b2b-platform-roadmap.md`, цикл 1

## Global Constraints

- **Ветка `worker-queue-ops` создаётся от `org-access-model`** (ветка цикла 0) после того, как цикл 0 влит:
  ```bash
  git fetch origin && git switch -c worker-queue-ops origin/org-access-model
  ```
- **План опирается на код цикла 0** — спецификацию `docs/superpowers/specs/2026-09-17-org-access-model-design.md` и план `docs/superpowers/plans/2026-09-17-org-access-model.md`. Используются имена из этого плана:
  - миграция `migrations/004_organizations.sql`;
  - `AuthUser` = `{ id; email: string | null; login: string | null; displayName: string | null; role; mustChangePassword }`, `createUser(email, password)`, `createLoginUser({ login, displayName, password, mustChangePassword })` из `src/lib/auth/users.ts`;
  - `Membership`, `OrgRole` из `src/lib/org/types.ts` (их же реэкспортирует `src/lib/org/access.ts`), `DEFAULT_ORG_SETTINGS` из `src/lib/org/settings.ts`, `listMemberships(userId)` из `src/lib/org/access.ts`;
  - чистые `canGenerate(user, memberships)`, `hasStaffRole(memberships)`, `isPlatformAdmin(user)`, `GENERATION_FORBIDDEN_MESSAGE` из `src/lib/org/policy.ts`;
  - `quotaStatus(user, memberships = [])`, `quotaExhaustedMessage(limit, orgLimit)`, `QUOTA_EXHAUSTED_MESSAGE` из `src/lib/quota.ts`;
  - в `src/lib/auth/rate-limit.ts` — синхронные `isLimited(key, max = IDENTIFIER_LIMIT)`, `recordFailure(key)`, `isLoginBlocked(ip, identifier)`, `recordLoginFailure(ip, identifier, accountExists)`, `__resetAttemptsForTests()`, пороги `IDENTIFIER_LIMIT`, `UNKNOWN_IP_LIMIT`, `IP_LIMIT` и закрытые ключи `id:`, `ip-unknown:`, `ip-all:`; тело входа — `{ identifier, password }`.

  **Перед задачами 2, 7, 9 и 10 сверить эти имена с влитым кодом.** Если при выполнении цикла 0 что-то назвали иначе, использовать влитые имена; поведение из этого плана не меняется.
- **Новых зависимостей нет.** Ни Redis, ни очередей, ни dotenv. Очередь — на `pg`.
- **`npm test` зелёный без базы.** Без `DATABASE_URL` хранилище заданий и счётчики входа работают в памяти. Наборы с Postgres читают `SHOWMEHOW_TEST_DATABASE_URL` и пропускаются целиком, если она не задана (`describe.skipIf(!pool)`).
- **Комментарии по-русски, идентификаторы по-английски, тексты для пользователя — целыми предложениями по-русски.**
- **Чужой `id` даёт 404**, как несуществующий. Невалидный сегмент пути в роутах симуляций по-прежнему даёт 400.
- **`src/lib/runtime/*` и `demos/*/artifact.html` не трогаются** (там строго ES5).
- **Форма событий SSE (`PipelineEvent` в `src/lib/types.ts`) не меняется.** Два изменения из спецификации: `{ type: 'queued', position }` больше не пишется в журнал, а отправляется потоком вживую; поток может слать строки-комментарии `: ping`, которые клиент уже пропускает.
- **Код в `src/lib/jobs/*` и `src/lib/worker/*` импортирует модули проекта только относительными путями.** Их загружает `scripts/worker.ts` через `node --import tsx`, и так не приходится полагаться на алиас `@/`.
- **Роуты Next не экспортируют ничего, кроме обработчиков и полей конфигурации** (`maxDuration`, `dynamic`). Тексты ответов лежат в `src/lib/jobs/messages.ts`.
- **Известное отступление от критерия приёмки 1.** Восстановление версии (`POST /api/simulations/[id]/history`) и автоустановка примеров (`GET /api/simulations` → `ensureDemosForUser`) рендерят превью Playwright-ом в веб-процессе. Генерация и доработка из веба уходят полностью. Эти два пути в рамки цикла не входят; задача 11 записывает их в раздел «Известные отступления» спецификации.
- **Боевой сервер — общая машина.** Всё, что выполняется на `95.141.135.244`, собрано в задаче 16 и **выполняется только после явного подтверждения владельца**. На сервере никогда не выполнять `git reset --hard`. Ничего за пределами Tesseract (`/home/user/teseract`, `/home/user/showmehow`, служб `showmehow`, `teseract-*`, контейнера `teseract-pg` и блока сайта Tesseract в Caddy) не трогать.
- Каждый коммит заканчивается строкой:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Команды проверки в конце каждой задачи: `npm test` зелёный; при наличии тестовой базы — ещё и с `SHOWMEHOW_TEST_DATABASE_URL=...`; `npx tsc --noEmit` зелёный.

## Карта файлов

| Файл | Задача | Что |
|---|---|---|
| `migrations/005_job_queue.sql` | 1 | колонки очереди, индексы, `job_events`, `workers`, `login_attempts` |
| `scripts/migrate.ts` | 1 | опция `until` для тестов миграций |
| `src/lib/jobs/policy.ts` | 2 | приоритет, решение уборщика, нужен ли повтор, код здоровья |
| `src/lib/jobs/store.ts` | 2 | типы, интерфейс `JobStore`, общие помощники |
| `src/lib/jobs/store-memory.ts` | 2 | драйвер в памяти |
| `src/lib/jobs/current.ts` | 2 | `getJobStore()`, `getOwnedJob()` |
| `src/lib/jobs/messages.ts` | 2 | тексты ответов роутов |
| `tests/jobstore-contract.ts` | 2 | общий набор проверок для обоих драйверов |
| `src/lib/jobs/listener.ts` | 3 | одно соединение `LISTEN` на процесс |
| `src/lib/jobs/store-pg.ts` | 4 | драйвер на Postgres |
| `src/lib/pipeline/run.ts` | 5 | `onSaved`, отмена доработки |
| `src/lib/worker/worker.ts` | 6 | захват, слоты, сердцебиение, уборщик, мягкая остановка |
| `src/lib/worker/execute.ts` | 6 | выполнение одного задания |
| `src/lib/auth/rate-limit.ts` | 7 | счётчики входа в `login_attempts` |
| `src/lib/auth/client-ip.ts` | 7 | адрес клиента с учётом `SHOWMEHOW_TRUST_PROXY` |
| `src/lib/worker/config.ts` | 8 | переменные окружения воркера |
| `src/lib/worker/boot.ts` | 8 | сборка воркера из боевых частей |
| `src/lib/worker/embedded.ts` | 8 | встроенный воркер для dev |
| `src/instrumentation.ts` | 9 | запуск встроенного воркера |
| `scripts/worker.ts` | 8 | точка входа службы |
| `src/app/api/generate/route.ts` | 9 | заявка в очередь |
| `src/app/api/jobs/[id]/{route,cancel/route,stream/route}.ts` | 9 | чтение, отмена, поток из базы |
| `src/app/api/simulations/[id]/refine/route.ts` | 10 | доработка через очередь |
| `src/components/Workbench.tsx` | 10 | доработка через поток, переподключение |
| `src/lib/jobs.ts`, `src/lib/limits.ts` | 11 | удаляются |
| `src/app/api/health/route.ts` | 12 | здоровье |
| `e2e/*`, `playwright.config.ts` | 13 | e2e снова зелёный |
| `scripts/backup.sh`, `ops/systemd/*`, `ops/caddy/*`, `docs/ops/deploy.md`, `docs/ops/restore.md` | 14 | эксплуатация |
| `scripts/load/*`, `docs/ops/load-2026-09.md` | 15 | нагрузочный прогон |

---

### Task 1: Миграция `005_job_queue.sql`

**Files:**
- Create: `migrations/005_job_queue.sql`
- Modify: `scripts/migrate.ts`, `tests/integration/migrate.test.ts`

**Interfaces:**
- Consumes: `applyMigrations(pool)` из `scripts/migrate.ts`; миграции 001–004.
- Produces:
  - `applyMigrations(pool: Pool, opts?: { until?: string }): Promise<string[]>` — `until` останавливает применение после файла с этим именем (включительно);
  - таблицы `job_events`, `workers`, `login_attempts`; колонки `jobs.kind`, `priority`, `target_simulation_id`, `image_data_url`, `locked_by`, `locked_until`, `attempts`, `cancel_requested_at`, `started_at`, `finished_at`; индексы `jobs_queue`, `jobs_leases`, `jobs_one_active_generate`, `jobs_one_active_refine`, `login_attempts_key_at`.

- [ ] **Step 1: Написать падающий тест миграции**

В `tests/integration/migrate.test.ts` заменить единственный `it` на два:

```ts
  it('создают схему и применяются повторно вхолостую', async () => {
    const p = pool!;
    const first = await applyMigrations(p);
    expect(first).toEqual(expect.arrayContaining(['001_init.sql', '005_job_queue.sql']));
    const tables = await p.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'migrate_test'");
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(
      ['users', 'sessions', 'simulations', 'jobs', 'job_events', 'workers', 'login_attempts']));
    const second = await applyMigrations(p);
    expect(second).toEqual([]);
  });

  // Прежний код держал задания в памяти процесса: после перехода продолжить их некому,
  // а два «активных» задания одного человека не дали бы создать уникальный индекс.
  it('005 закрывает задания, оставшиеся активными от прежнего кода', async () => {
    const p = pool!;
    await resetSchema(p, SCHEMA);
    const upTo4 = await applyMigrations(p, { until: '004_organizations.sql' });
    expect(upTo4).not.toContain('005_job_queue.sql');
    const userId = '11111111-1111-1111-1111-111111111111';
    await p.query(
      "INSERT INTO users (id, email, password_hash, role) VALUES ($1, 'old@example.com', 'x', 'user')",
      [userId]);
    for (const status of ['running', 'queued', 'done']) {
      await p.query(
        "INSERT INTO jobs (id, owner_id, status, request) VALUES (gen_random_uuid(), $1, $2, '{}'::jsonb)",
        [userId, status]);
    }
    expect(await applyMigrations(p)).toEqual(['005_job_queue.sql']);
    const { rows } = await p.query<{ status: string; error: string | null; kind: string }>(
      'SELECT status, error, kind FROM jobs ORDER BY status');
    expect(rows).toEqual([
      { status: 'done', error: null, kind: 'generate' },
      { status: 'error', error: 'Сервер был перезапущен', kind: 'generate' },
      { status: 'error', error: 'Сервер был перезапущен', kind: 'generate' },
    ]);
  });
```

`gen_random_uuid()` встроена в Postgres 13+, расширение не нужно.

- [ ] **Step 2: Убедиться, что тест падает**

```bash
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow \
  npx vitest run tests/integration/migrate.test.ts
```

Ожидается: FAIL — в списке нет `005_job_queue.sql`, и `applyMigrations` не принимает `until`.

- [ ] **Step 3: Добавить `until` в раннер**

В `scripts/migrate.ts` сигнатура и цикл:

```ts
/**
 * Применяет непринятые миграции по возрастанию имени, каждую в своей транзакции.
 * Идемпотентен: уже применённые имена лежат в schema_migrations и пропускаются.
 * `until` нужен тестам миграций: остановиться после указанного файла, наполнить базу
 * данными прежней схемы и только потом накатить следующую миграцию.
 */
export async function applyMigrations(pool: Pool, opts: { until?: string } = {}): Promise<string[]> {
```

и в конце тела цикла `for (const file of files)`, после `finally { client.release(); }`:

```ts
    if (opts.until !== undefined && file === opts.until) break;
```

Поставить проверку так, чтобы она срабатывала и для уже применённого файла: первой строкой цикла вместо `if (done.has(file)) continue;` написать

```ts
    if (done.has(file)) {
      if (opts.until !== undefined && file === opts.until) break;
      continue;
    }
```

- [ ] **Step 4: Написать миграцию**

`migrations/005_job_queue.sql`:

```sql
-- Очередь заданий в базе: воркер берёт задания сам, веб только создаёт их и читает журнал.

-- Задания, которые вело прежнее поколение кода в памяти процесса, после перехода
-- продолжить некому. Помечаем их так же, как прежний код помечал их при чтении,
-- и заодно снимаем возможные дубли перед созданием уникальных индексов ниже.
UPDATE jobs SET status = 'error', error = 'Сервер был перезапущен'
WHERE status IN ('queued', 'running');

ALTER TABLE jobs ADD COLUMN kind text NOT NULL DEFAULT 'generate'
  CHECK (kind IN ('generate', 'refine'));
ALTER TABLE jobs ADD COLUMN priority int NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN target_simulation_id uuid;      -- для refine
ALTER TABLE jobs ADD COLUMN image_data_url text;            -- вход генерации; стирается по завершении
ALTER TABLE jobs ADD COLUMN locked_by text;
ALTER TABLE jobs ADD COLUMN locked_until timestamptz;
ALTER TABLE jobs ADD COLUMN attempts int NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN cancel_requested_at timestamptz;
ALTER TABLE jobs ADD COLUMN started_at timestamptz;
ALTER TABLE jobs ADD COLUMN finished_at timestamptz;

CREATE INDEX jobs_queue ON jobs (priority DESC, created_at) WHERE status = 'queued';
CREATE INDEX jobs_leases ON jobs (locked_until) WHERE status = 'running';

-- Одна активная генерация и одна активная доработка на человека — правилом базы,
-- а не резервацией в памяти.
CREATE UNIQUE INDEX jobs_one_active_generate ON jobs (owner_id)
  WHERE kind = 'generate' AND status IN ('queued', 'running');
CREATE UNIQUE INDEX jobs_one_active_refine ON jobs (owner_id)
  WHERE kind = 'refine' AND status IN ('queued', 'running');

-- Журнал событий. jobs.events остаётся для старых записей и больше не пишется.
CREATE TABLE job_events (
  job_id uuid  NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seq    int   NOT NULL,
  event  jsonb NOT NULL,
  at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, seq)
);

CREATE TABLE workers (
  id         text PRIMARY KEY,           -- host:pid:случайный суффикс
  host       text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  seen_at    timestamptz NOT NULL DEFAULT now(),
  running    int NOT NULL DEFAULT 0
);

CREATE TABLE login_attempts (
  key text NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_key_at ON login_attempts (key, at);
```

- [ ] **Step 5: Прогнать тесты**

```bash
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow \
  npx vitest run tests/integration/migrate.test.ts
npm test && npx tsc --noEmit
```

Ожидается: PASS; `npm test` без базы зелёный (набор пропущен).

- [ ] **Step 6: Коммит**

```bash
git add migrations/005_job_queue.sql scripts/migrate.ts tests/integration/migrate.test.ts
git commit -m "feat(db): миграция 005 — очередь заданий, журнал событий, воркеры, попытки входа

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Политика очереди и хранилище заданий в памяти

**Files:**
- Create: `src/lib/jobs/policy.ts`, `src/lib/jobs/store.ts`, `src/lib/jobs/store-memory.ts`, `src/lib/jobs/current.ts`, `src/lib/jobs/messages.ts`, `tests/jobstore-contract.ts`, `tests/unit/job-policy.test.ts`, `tests/unit/jobstore-memory.test.ts`

`src/lib/jobs.ts` пока остаётся рядом: файл `jobs.ts` и каталог `jobs/` сосуществуют, `@/lib/jobs` по-прежнему указывает на старый файл, а `@/lib/jobs/store` — на новый модуль.

**Interfaces:**
- Consumes: `PipelineEvent`, `QualityMode` из `src/lib/types.ts`; `AuthUser` из `src/lib/auth/users.ts`; `Membership` из `src/lib/org/types.ts`; `isPlatformAdmin`, `hasStaffRole` из `src/lib/org/policy.ts`; `hasDb` из `src/lib/db/client.ts`.
- Produces (`src/lib/jobs/policy.ts`):
  - `HIGH_PRIORITY = 10`, `MAX_ATTEMPTS = 2`;
  - `jobPriority(user: Pick<AuthUser, 'role'>, memberships: Membership[]): number`;
  - `type ReapDecision = 'requeue' | 'fail' | 'cancel'`;
  - `reapDecision(job: { attempts: number; cancelRequested: boolean }): ReapDecision`;
  - `needsRun(job: { simulationId: string | null }): boolean`;
  - `healthCode(stats: { queued: number; workersAlive: number }): 200 | 503`.
- Produces (`src/lib/jobs/store.ts`):
  - типы `JobKind`, `JobStatus`, `GenerateRequest`, `RefineRequest`, `JobRequest`, `Job`, `ClaimedJob`, `NewJob`, `StoredEvent`, `JobOutcome`, `HeartbeatResult`, `ReapedJob`, `QueueStats`, `PublicJob`;
  - интерфейс `JobStore` (полный список методов ниже);
  - `class ActiveJobExistsError extends Error { readonly kind: JobKind }`;
  - константы `LEASE_SECONDS = 60`, `REAP_GRACE_SECONDS = 30`, `WORKER_ALIVE_SECONDS = 60`, `REQUEUE_WARNING`, `LOST_TWICE_MESSAGE`;
  - `isTerminalStatus(s: JobStatus): boolean`, `isTerminalEvent(e: PipelineEvent): boolean`, `outcomeEvent(o: JobOutcome): PipelineEvent`, `terminalEventFor(job: Job): PipelineEvent | null`, `publicJob(job: Job): PublicJob`.
- Produces (`src/lib/jobs/store-memory.ts`): `createMemoryJobStore(opts?: { now?: () => number }): JobStore`.
- Produces (`src/lib/jobs/current.ts`): `getJobStore(): JobStore`, `__setJobStoreForTests(store: JobStore | null): void`, `getOwnedJob(ownerId: string, id: string): Promise<Job | null>`.
- Produces (`src/lib/jobs/messages.ts`): `GENERATION_BUSY_MESSAGE`, `REFINE_BUSY_MESSAGE`, `EMPTY_PROMPT_MESSAGE`, `EMPTY_INSTRUCTION_MESSAGE`, `JOB_NOT_FOUND_MESSAGE`, `SIMULATION_NOT_FOUND_MESSAGE`.
- Produces (`tests/jobstore-contract.ts`): `jobStoreContract(label: string, setup: () => Promise<ContractEnv>, skip?: boolean): void`, `interface ContractEnv { store: JobStore; owner(): Promise<string>; expireLeases(): Promise<void> }`.

- [ ] **Step 1: Написать падающие тесты политики**

`tests/unit/job-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  jobPriority, reapDecision, needsRun, healthCode, HIGH_PRIORITY,
} from '@/lib/jobs/policy';
import type { AuthUser } from '@/lib/auth/users';
import type { Membership, OrgRole } from '@/lib/org/types';
import { DEFAULT_ORG_SETTINGS } from '@/lib/org/settings';

function user(role: AuthUser['role']): AuthUser {
  return {
    id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com', login: null,
    displayName: null, role, mustChangePassword: false,
  };
}

function member(role: OrgRole): Membership {
  return {
    orgId: 'o1', orgSlug: 'sch12', orgName: 'Школа №12', orgKind: 'school', role,
    settings: { ...DEFAULT_ORG_SETTINGS },
  };
}

describe('jobPriority', () => {
  it('платформенный админ, учитель и админ организации идут раньше', () => {
    expect(jobPriority(user('admin'), [])).toBe(HIGH_PRIORITY);
    expect(jobPriority(user('user'), [member('teacher')])).toBe(HIGH_PRIORITY);
    expect(jobPriority(user('user'), [member('org_admin')])).toBe(HIGH_PRIORITY);
  });

  it('человек без членств и ученик — обычный приоритет', () => {
    expect(jobPriority(user('user'), [])).toBe(0);
    expect(jobPriority(user('user'), [member('student')])).toBe(0);
  });

  it('ученик в одной организации и учитель в другой — высокий приоритет', () => {
    expect(jobPriority(user('user'), [member('student'), member('teacher')])).toBe(HIGH_PRIORITY);
  });
});

describe('reapDecision', () => {
  it('первая потеря возвращает задание в очередь', () => {
    expect(reapDecision({ attempts: 1, cancelRequested: false })).toBe('requeue');
  });

  it('вторая потеря — ошибка', () => {
    expect(reapDecision({ attempts: 2, cancelRequested: false })).toBe('fail');
    expect(reapDecision({ attempts: 5, cancelRequested: false })).toBe('fail');
  });

  it('потерянное задание, которое просили отменить, отменяется', () => {
    expect(reapDecision({ attempts: 1, cancelRequested: true })).toBe('cancel');
    expect(reapDecision({ attempts: 2, cancelRequested: true })).toBe('cancel');
  });
});

describe('needsRun', () => {
  it('сохранённое задание не генерируется заново', () => {
    expect(needsRun({ simulationId: null })).toBe(true);
    expect(needsRun({ simulationId: '55555555-5555-5555-5555-555555555555' })).toBe(false);
  });
});

describe('healthCode', () => {
  it('503, когда очередь не пуста и живых воркеров нет', () => {
    expect(healthCode({ queued: 1, workersAlive: 0 })).toBe(503);
  });

  it('200 при пустой очереди или живом воркере', () => {
    expect(healthCode({ queued: 0, workersAlive: 0 })).toBe(200);
    expect(healthCode({ queued: 3, workersAlive: 1 })).toBe(200);
  });
});
```

- [ ] **Step 2: Написать общий набор проверок хранилища**

`tests/jobstore-contract.ts` (вне `tests/unit` и `tests/integration`, поэтому vitest не запускает его сам):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  ActiveJobExistsError, LOST_TWICE_MESSAGE, REQUEUE_WARNING,
  type JobStore, type NewJob,
} from '@/lib/jobs/store';

export interface ContractEnv {
  store: JobStore;
  /** Новый владелец; для Postgres — настоящая строка users. */
  owner(): Promise<string>;
  /** Сдвигает все аренды в прошлое дальше порога уборщика. */
  expireLeases(): Promise<void>;
}

const REQUEST = { prompt: 'маятник', mode: 'fast' as const, hasImage: false };

/**
 * Одни и те же гарантии для обоих драйверов: драйвер в памяти обязан вести себя
 * как Postgres, иначе юниты роутов и воркера проверяли бы не то поведение.
 */
export function jobStoreContract(label: string, setup: () => Promise<ContractEnv>, skip = false): void {
  describe.skipIf(skip)(`хранилище заданий: ${label}`, () => {
    let env: ContractEnv;
    let store: JobStore;
    const gen = (ownerId: string, extra: Partial<NewJob> = {}): NewJob =>
      ({ ownerId, kind: 'generate', priority: 0, request: REQUEST, ...extra });

    beforeEach(async () => {
      env = await setup();
      store = env.store;
    });

    it('create и get: новое задание в очереди', async () => {
      const owner = await env.owner();
      const job = await store.create(gen(owner));
      expect(job).toMatchObject({
        ownerId: owner, kind: 'generate', status: 'queued', priority: 0, request: REQUEST,
        attempts: 0, simulationId: null, error: null, cancelRequested: false,
        targetSimulationId: null, startedAt: null, finishedAt: null,
      });
      expect(await store.get(job.id)).toEqual(job);
      expect(await store.get(crypto.randomUUID())).toBeNull();
      expect(await store.get('nope')).toBeNull();
    });

    it('вторая активная генерация того же человека отбивается, доработка разрешена', async () => {
      const owner = await env.owner();
      await store.create(gen(owner));
      await expect(store.create(gen(owner))).rejects.toBeInstanceOf(ActiveJobExistsError);
      const refine = await store.create({
        ownerId: owner, kind: 'refine', priority: 0, request: { instruction: 'медленнее' },
        targetSimulationId: crypto.randomUUID(),
      });
      expect(refine.kind).toBe('refine');
      await expect(store.create({
        ownerId: owner, kind: 'refine', priority: 0, request: { instruction: 'ещё' },
        targetSimulationId: crypto.randomUUID(),
      })).rejects.toBeInstanceOf(ActiveJobExistsError);
      // Другой человек не мешает.
      await store.create(gen(await env.owner()));
    });

    it('после завершения можно запускать новую генерацию', async () => {
      const owner = await env.owner();
      const job = await store.create(gen(owner));
      await store.claim('w1');
      expect(await store.finish(job.id, 'w1', { status: 'error', message: 'сбой' })).toBe(true);
      await expect(store.create(gen(owner))).resolves.toMatchObject({ status: 'queued' });
    });

    it('claim берёт по приоритету, затем по времени, и отдаёт картинку', async () => {
      const low1 = await store.create(gen(await env.owner(), { imageDataUrl: 'data:image/png;base64,AA' }));
      const high = await store.create(gen(await env.owner(), { priority: 10 }));
      const low2 = await store.create(gen(await env.owner()));
      const first = await store.claim('w1');
      expect(first?.id).toBe(high.id);
      expect(first).toMatchObject({ status: 'running', attempts: 1 });
      expect(first?.startedAt).not.toBeNull();
      const second = await store.claim('w1');
      expect(second?.id).toBe(low1.id);
      expect(second?.imageDataUrl).toBe('data:image/png;base64,AA');
      expect((await store.claim('w2'))?.id).toBe(low2.id);
      expect(await store.claim('w2')).toBeNull();
    });

    it('события нумеруются по порядку, чужой воркер писать не может', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'a' }, 'w1')).toBe(1);
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'b' }, 'w1')).toBe(2);
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'чужое' }, 'w2')).toBeNull();
      expect(await store.events(job.id, 0)).toEqual([
        { seq: 1, event: { type: 'warning', message: 'a' } },
        { seq: 2, event: { type: 'warning', message: 'b' } },
      ]);
      expect((await store.events(job.id, 1)).map((e) => e.seq)).toEqual([2]);
      expect(await store.events(crypto.randomUUID(), 0)).toEqual([]);
    });

    it('finish пишет терминальное событие последним и срабатывает один раз', async () => {
      const job = await store.create(gen(await env.owner(), { imageDataUrl: 'data:x' }));
      await store.claim('w1');
      await store.appendEvent(job.id, { type: 'warning', message: 'a' }, 'w1');
      const simId = crypto.randomUUID();
      expect(await store.finish(job.id, 'w2', { status: 'done', simulationId: simId })).toBe(false);
      expect(await store.finish(job.id, 'w1', { status: 'done', simulationId: simId })).toBe(true);
      expect(await store.finish(job.id, 'w1', { status: 'error', message: 'поздно' })).toBe(false);
      const done = await store.get(job.id);
      expect(done).toMatchObject({ status: 'done', simulationId: simId, error: null });
      expect(done?.finishedAt).not.toBeNull();
      const events = await store.events(job.id, 0);
      expect(events.at(-1)).toEqual({ seq: 2, event: { type: 'done', simulationId: simId } });
    });

    it('cancelQueued закрывает только ожидающее задание', async () => {
      const queued = await store.create(gen(await env.owner()));
      expect(await store.cancelQueued(queued.id)).toBe(true);
      expect(await store.cancelQueued(queued.id)).toBe(false);
      expect((await store.get(queued.id))?.status).toBe('cancelled');
      expect(await store.events(queued.id, 0)).toEqual([{ seq: 1, event: { type: 'cancelled' } }]);

      const running = await store.create(gen(await env.owner()));
      await store.claim('w1');
      expect(await store.cancelQueued(running.id)).toBe(false);
      expect((await store.get(running.id))?.status).toBe('running');
    });

    it('requestCancel виден в сердцебиении, аренды продлеваются', async () => {
      const a = await store.create(gen(await env.owner()));
      const b = await store.create(gen(await env.owner()));
      await store.claim('w1');
      await store.claim('w1');
      await store.requestCancel(b.id);
      await store.requestCancel(b.id);
      const beat = await store.heartbeat('w1', 'host', 2);
      expect([...beat.leased].sort()).toEqual([a.id, b.id].sort());
      expect(beat.cancelRequested).toEqual([b.id]);
      expect((await store.get(b.id))?.cancelRequested).toBe(true);
      expect(await store.heartbeat('w2', 'host', 0)).toEqual({ leased: [], cancelRequested: [] });
    });

    it('position считает очередь с учётом приоритета; не в очереди — 0', async () => {
      const first = await store.create(gen(await env.owner()));
      const second = await store.create(gen(await env.owner()));
      const vip = await store.create(gen(await env.owner(), { priority: 10 }));
      expect(await store.position(vip.id)).toBe(1);
      expect(await store.position(first.id)).toBe(2);
      expect(await store.position(second.id)).toBe(3);
      await store.claim('w1');
      expect(await store.position(vip.id)).toBe(0);
      expect(await store.position(second.id)).toBe(2);
      expect(await store.position(crypto.randomUUID())).toBe(0);
    });

    it('уборщик: первая потеря — в очередь с предупреждением, вторая — ошибка', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      await env.expireLeases();
      expect(await store.reap()).toEqual([{ id: job.id, decision: 'requeue' }]);
      expect((await store.get(job.id))?.status).toBe('queued');
      expect((await store.events(job.id, 0)).at(-1)?.event)
        .toEqual({ type: 'warning', message: REQUEUE_WARNING });
      // Потерявший аренду воркер больше ничего не пишет.
      expect(await store.appendEvent(job.id, { type: 'warning', message: 'зомби' }, 'w1')).toBeNull();
      expect(await store.finish(job.id, 'w1', { status: 'error', message: 'зомби' })).toBe(false);

      expect((await store.claim('w2'))?.attempts).toBe(2);
      await env.expireLeases();
      expect(await store.reap()).toEqual([{ id: job.id, decision: 'fail' }]);
      expect(await store.get(job.id)).toMatchObject({ status: 'error', error: LOST_TWICE_MESSAGE });
      expect((await store.events(job.id, 0)).at(-1)?.event)
        .toEqual({ type: 'error', message: LOST_TWICE_MESSAGE });
      expect(await store.reap()).toEqual([]);
    });

    it('уборщик отменяет потерянное задание, которое просили отменить', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      await store.requestCancel(job.id);
      await env.expireLeases();
      expect(await store.reap()).toEqual([{ id: job.id, decision: 'cancel' }]);
      expect((await store.get(job.id))?.status).toBe('cancelled');
    });

    it('живая аренда уборщика не касается', async () => {
      await store.create(gen(await env.owner()));
      await store.claim('w1');
      expect(await store.reap()).toEqual([]);
    });

    it('markSaved запоминает симуляцию и переживает возврат в очередь', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      const simId = crypto.randomUUID();
      await store.markSaved(job.id, 'w2', crypto.randomUUID());
      expect((await store.get(job.id))?.simulationId).toBeNull();
      await store.markSaved(job.id, 'w1', simId);
      await env.expireLeases();
      await store.reap();
      expect((await store.claim('w2'))?.simulationId).toBe(simId);
    });

    it('subscribe сообщает о новых событиях, отписка прекращает', async () => {
      const job = await store.create(gen(await env.owner()));
      await store.claim('w1');
      const onChange = vi.fn();
      const off = store.subscribe(job.id, onChange);
      await vi.waitFor(async () => {
        await store.appendEvent(job.id, { type: 'warning', message: 'x' }, 'w1');
        expect(onChange).toHaveBeenCalled();
      }, { timeout: 3000, interval: 200 });
      off();
      const calls = onChange.mock.calls.length;
      await store.appendEvent(job.id, { type: 'warning', message: 'y' }, 'w1');
      await new Promise((r) => setTimeout(r, 300));
      expect(onChange.mock.calls.length).toBe(calls);
    });

    it('subscribeQueue сообщает о новом задании', async () => {
      const onQueued = vi.fn();
      const off = store.subscribeQueue(onQueued);
      await vi.waitFor(async () => {
        await store.create(gen(await env.owner()));
        expect(onQueued).toHaveBeenCalled();
      }, { timeout: 3000, interval: 200 });
      off();
    });

    it('stats: очередь, идущие и живые воркеры', async () => {
      expect(await store.stats()).toEqual({
        queued: 0, oldestQueuedSec: null, running: 0, workersAlive: 0, lastWorkerSeenSec: null,
      });
      await store.create(gen(await env.owner()));
      await store.create(gen(await env.owner()));
      await store.claim('w1');
      await store.heartbeat('w1', 'host', 1);
      const s = await store.stats();
      expect(s).toMatchObject({ queued: 1, running: 1, workersAlive: 1 });
      expect(s.oldestQueuedSec).toBeGreaterThanOrEqual(0);
      expect(s.lastWorkerSeenSec).toBeGreaterThanOrEqual(0);
      await store.retireWorker('w1');
      expect((await store.stats()).workersAlive).toBe(0);
    });
  });
}
```

Проверка `subscribe` повторяет запись внутри `vi.waitFor`: у Postgres первое соединение `LISTEN` поднимается асинхронно, и событие, записанное до него, приходит только через сверку. Повтор делает тест независимым от этого.

`tests/unit/jobstore-memory.test.ts`:

```ts
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
```

- [ ] **Step 3: Убедиться, что тесты падают**

```bash
npx vitest run tests/unit/job-policy.test.ts tests/unit/jobstore-memory.test.ts
```

Ожидается: FAIL — модулей `@/lib/jobs/policy` и `@/lib/jobs/store-memory` нет.

- [ ] **Step 4: Написать политику**

`src/lib/jobs/policy.ts`:

```ts
import type { AuthUser } from '../auth/users';
import type { Membership } from '../org/types';
import { hasStaffRole, isPlatformAdmin } from '../org/policy';

/** Приоритет учителя и администрации: их генерация идёт раньше пробных. */
export const HIGH_PRIORITY = 10;

/** Сколько раз задание может начаться. Вторая потеря воркера — ошибка. */
export const MAX_ATTEMPTS = 2;

/**
 * Внутри одного приоритета очередь идёт по времени создания. Роль берётся по
 * любому членству: учитель в одной школе остаётся учителем, даже если в другой он ученик.
 */
export function jobPriority(user: Pick<AuthUser, 'role'>, memberships: Membership[]): number {
  return isPlatformAdmin(user) || hasStaffRole(memberships) ? HIGH_PRIORITY : 0;
}

export type ReapDecision = 'requeue' | 'fail' | 'cancel';

/**
 * Что делать с заданием, чей воркер перестал продлевать аренду. Отмену человек уже
 * попросил — перезапускать нечего. Иначе одна повторная попытка.
 */
export function reapDecision(job: { attempts: number; cancelRequested: boolean }): ReapDecision {
  if (job.cancelRequested) return 'cancel';
  return job.attempts < MAX_ATTEMPTS ? 'requeue' : 'fail';
}

/**
 * Нужно ли выполнять задание. Воркер записывает simulation_id сразу после сохранения,
 * поэтому повторная попытка после потери видит его и не создаёт вторую симуляцию.
 */
export function needsRun(job: { simulationId: string | null }): boolean {
  return job.simulationId === null;
}

/** Очередь стоит, а брать её некому, — это авария, даже если база отвечает. */
export function healthCode(stats: { queued: number; workersAlive: number }): 200 | 503 {
  return stats.queued > 0 && stats.workersAlive === 0 ? 503 : 200;
}
```

- [ ] **Step 5: Написать типы и интерфейс**

`src/lib/jobs/store.ts`:

```ts
import type { PipelineEvent, QualityMode } from '../types';
import type { ReapDecision } from './policy';

export type JobKind = 'generate' | 'refine';
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface GenerateRequest { prompt: string; mode: QualityMode; hasImage: boolean }
export interface RefineRequest { instruction: string }
export type JobRequest = GenerateRequest | RefineRequest;

export interface Job {
  id: string;
  ownerId: string;
  kind: JobKind;
  status: JobStatus;
  priority: number;
  request: JobRequest;
  targetSimulationId: string | null;
  simulationId: string | null;
  error: string | null;
  attempts: number;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Задание в руках воркера: только ему нужна картинка-образец. */
export interface ClaimedJob extends Job {
  imageDataUrl: string | null;
}

export interface NewJob {
  ownerId: string;
  kind: JobKind;
  priority: number;
  request: JobRequest;
  targetSimulationId?: string;
  imageDataUrl?: string;
}

export interface StoredEvent { seq: number; event: PipelineEvent }

export type JobOutcome =
  | { status: 'done'; simulationId: string }
  | { status: 'error'; message: string }
  | { status: 'cancelled' };

export interface HeartbeatResult {
  /** Задания, аренду которых продлили. Своё задание вне списка потеряно. */
  leased: string[];
  cancelRequested: string[];
}

export interface ReapedJob { id: string; decision: ReapDecision }

export interface QueueStats {
  queued: number;
  oldestQueuedSec: number | null;
  running: number;
  workersAlive: number;
  lastWorkerSeenSec: number | null;
}

export interface PublicJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  createdAt: string;
  request: JobRequest;
  targetSimulationId?: string;
  simulationId?: string;
  error?: string;
}

/**
 * Единственный путь к заданиям. Владение здесь не проверяется: get отдаёт любое
 * задание, а роуты сверяют владельца через getOwnedJob.
 */
export interface JobStore {
  /** Бросает ActiveJobExistsError, если у человека уже есть активное задание этого вида. */
  create(input: NewJob): Promise<Job>;
  get(id: string): Promise<Job | null>;
  claim(workerId: string): Promise<ClaimedJob | null>;
  /** С workerId пишет, только пока задание в его аренде. null — событие не записано. */
  appendEvent(id: string, event: PipelineEvent, workerId?: string): Promise<number | null>;
  events(id: string, afterSeq: number): Promise<StoredEvent[]>;
  markSaved(id: string, workerId: string, simulationId: string): Promise<void>;
  /** Одна транзакция: статус, результат, снятие аренды и терминальное событие. */
  finish(id: string, workerId: string, outcome: JobOutcome): Promise<boolean>;
  requestCancel(id: string): Promise<void>;
  cancelQueued(id: string): Promise<boolean>;
  heartbeat(workerId: string, host: string, running: number): Promise<HeartbeatResult>;
  retireWorker(workerId: string): Promise<void>;
  reap(): Promise<ReapedJob[]>;
  /** Место в очереди с единицы; 0 — задание не ждёт. */
  position(id: string): Promise<number>;
  stats(): Promise<QueueStats>;
  /** Сигнал «в журнале могло появиться новое»; дочитывать по seq должен подписчик. */
  subscribe(id: string, onChange: () => void): () => void;
  subscribeQueue(onQueued: () => void): () => void;
}

export class ActiveJobExistsError extends Error {
  readonly kind: JobKind;
  constructor(kind: JobKind) {
    super(`у пользователя уже есть активное задание вида ${kind}`);
    this.name = 'ActiveJobExistsError';
    this.kind = kind;
  }
}

/** Аренда, которую продлевает сердцебиение раз в 15 секунд. */
export const LEASE_SECONDS = 60;
/** Запас сверх аренды, после которого уборщик считает воркер потерянным. */
export const REAP_GRACE_SECONDS = 30;
/** Воркер жив, если его видели за это время. */
export const WORKER_ALIVE_SECONDS = 60;

export const REQUEUE_WARNING = 'Воркер перезапущен, генерация начата заново.';
export const LOST_TWICE_MESSAGE = 'Генерация прервалась дважды. Попробуйте ещё раз.';

export function isTerminalStatus(s: JobStatus): boolean {
  return s === 'done' || s === 'error' || s === 'cancelled';
}

export function isTerminalEvent(e: PipelineEvent): boolean {
  return e.type === 'done' || e.type === 'error' || e.type === 'cancelled';
}

export function outcomeEvent(o: JobOutcome): PipelineEvent {
  if (o.status === 'done') return { type: 'done', simulationId: o.simulationId };
  if (o.status === 'error') return { type: 'error', message: o.message };
  return { type: 'cancelled' };
}

/**
 * Терминальное событие по статусу. Нужно для старых записей: прежний код помечал
 * задание ошибкой при чтении и событие в журнал не добавлял.
 */
export function terminalEventFor(job: Job): PipelineEvent | null {
  if (job.status === 'done' && job.simulationId) {
    return { type: 'done', simulationId: job.simulationId };
  }
  if (job.status === 'error') return { type: 'error', message: job.error ?? 'Ошибка генерации.' };
  if (job.status === 'cancelled') return { type: 'cancelled' };
  return null;
}

/** Наружу не уходят владелец, приоритет, попытки и аренда. */
export function publicJob(job: Job): PublicJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    request: job.request,
    ...(job.targetSimulationId ? { targetSimulationId: job.targetSimulationId } : {}),
    ...(job.simulationId ? { simulationId: job.simulationId } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}
```

`store.ts` не импортирует ничего исполняемого: его типы берёт клиентский `Workbench.tsx`.

- [ ] **Step 6: Написать драйвер в памяти**

`src/lib/jobs/store-memory.ts`:

```ts
import crypto from 'node:crypto';
import type { PipelineEvent } from '../types';
import { reapDecision } from './policy';
import {
  ActiveJobExistsError, LEASE_SECONDS, LOST_TWICE_MESSAGE, REAP_GRACE_SECONDS, REQUEUE_WARNING,
  WORKER_ALIVE_SECONDS, outcomeEvent,
  type ClaimedJob, type Job, type JobStore, type ReapedJob, type StoredEvent,
} from './store';

interface Row extends ClaimedJob {
  order: number;
  lockedBy: string | null;
  lockedUntil: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Драйвер для тестов и для dev без базы. Даёт те же гарантии, что Postgres, но только
 * внутри одного процесса.
 */
export function createMemoryJobStore(opts: { now?: () => number } = {}): JobStore {
  const now = opts.now ?? Date.now;
  const rows = new Map<string, Row>();
  const log = new Map<string, StoredEvent[]>();
  const workers = new Map<string, { seenAt: number; running: number }>();
  const jobListeners = new Map<string, Set<() => void>>();
  const queueListeners = new Set<() => void>();
  let order = 0;

  const iso = (ms: number) => new Date(ms).toISOString();
  const isActive = (r: Row) => r.status === 'queued' || r.status === 'running';
  const owns = (r: Row, workerId: string) => r.status === 'running' && r.lockedBy === workerId;

  function view(r: Row): Job {
    const { order: _o, lockedBy: _b, lockedUntil: _u, imageDataUrl: _i, ...job } = r;
    return structuredClone(job);
  }

  // Уведомления асинхронны, как у NOTIFY: подписчик не должен рассчитывать на синхронный вызов.
  function notifyJob(id: string): void {
    for (const cb of jobListeners.get(id) ?? []) queueMicrotask(cb);
  }
  function notifyQueue(): void {
    for (const cb of queueListeners) queueMicrotask(cb);
  }

  function push(id: string, event: PipelineEvent): number {
    const list = log.get(id) ?? [];
    const seq = list.length + 1;
    list.push({ seq, event: structuredClone(event) });
    log.set(id, list);
    notifyJob(id);
    return seq;
  }

  function release(r: Row): void {
    r.lockedBy = null;
    r.lockedUntil = null;
  }

  function close(r: Row): void {
    r.finishedAt = iso(now());
    r.imageDataUrl = null;
    release(r);
  }

  return {
    async create(input) {
      for (const r of rows.values()) {
        if (r.ownerId === input.ownerId && r.kind === input.kind && isActive(r)) {
          throw new ActiveJobExistsError(input.kind);
        }
      }
      const row: Row = {
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        kind: input.kind,
        status: 'queued',
        priority: input.priority,
        request: structuredClone(input.request),
        targetSimulationId: input.targetSimulationId ?? null,
        simulationId: null,
        error: null,
        attempts: 0,
        cancelRequested: false,
        createdAt: iso(now()),
        startedAt: null,
        finishedAt: null,
        imageDataUrl: input.imageDataUrl ?? null,
        order: order++,
        lockedBy: null,
        lockedUntil: null,
      };
      rows.set(row.id, row);
      notifyQueue();
      return view(row);
    },

    async get(id) {
      const r = rows.get(id);
      return r ? view(r) : null;
    },

    async claim(workerId) {
      const next = [...rows.values()]
        .filter((r) => r.status === 'queued')
        .sort((a, b) => b.priority - a.priority || a.order - b.order)[0];
      if (!next) return null;
      next.status = 'running';
      next.lockedBy = workerId;
      next.lockedUntil = now() + LEASE_SECONDS * 1000;
      next.attempts += 1;
      next.startedAt ??= iso(now());
      return { ...view(next), imageDataUrl: next.imageDataUrl };
    },

    async appendEvent(id, event, workerId) {
      const r = rows.get(id);
      if (!r) return null;
      if (workerId !== undefined && !owns(r, workerId)) return null;
      return push(id, event);
    },

    async events(id, afterSeq) {
      return structuredClone((log.get(id) ?? []).filter((e) => e.seq > afterSeq));
    },

    async markSaved(id, workerId, simulationId) {
      const r = rows.get(id);
      if (r && owns(r, workerId)) r.simulationId = simulationId;
    },

    async finish(id, workerId, outcome) {
      const r = rows.get(id);
      if (!r || !owns(r, workerId)) return false;
      r.status = outcome.status;
      if (outcome.status === 'done') r.simulationId = outcome.simulationId;
      r.error = outcome.status === 'error' ? outcome.message : null;
      close(r);
      push(id, outcomeEvent(outcome));
      return true;
    },

    async requestCancel(id) {
      const r = rows.get(id);
      if (r && isActive(r)) r.cancelRequested = true;
    },

    async cancelQueued(id) {
      const r = rows.get(id);
      if (!r || r.status !== 'queued') return false;
      r.status = 'cancelled';
      r.cancelRequested = true;
      close(r);
      push(id, { type: 'cancelled' });
      return true;
    },

    async heartbeat(workerId, _host, running) {
      workers.set(workerId, { seenAt: now(), running });
      const leased: string[] = [];
      const cancelRequested: string[] = [];
      for (const r of rows.values()) {
        if (!owns(r, workerId)) continue;
        r.lockedUntil = now() + LEASE_SECONDS * 1000;
        leased.push(r.id);
        if (r.cancelRequested) cancelRequested.push(r.id);
      }
      return { leased, cancelRequested };
    },

    async retireWorker(workerId) {
      workers.delete(workerId);
    },

    async reap() {
      const out: ReapedJob[] = [];
      const deadline = now() - REAP_GRACE_SECONDS * 1000;
      for (const r of rows.values()) {
        if (r.status !== 'running' || r.lockedUntil === null || r.lockedUntil >= deadline) continue;
        const decision = reapDecision(r);
        if (decision === 'requeue') {
          r.status = 'queued';
          release(r);
          push(r.id, { type: 'warning', message: REQUEUE_WARNING });
          notifyQueue();
        } else if (decision === 'fail') {
          r.status = 'error';
          r.error = LOST_TWICE_MESSAGE;
          close(r);
          push(r.id, { type: 'error', message: LOST_TWICE_MESSAGE });
        } else {
          r.status = 'cancelled';
          close(r);
          push(r.id, { type: 'cancelled' });
        }
        out.push({ id: r.id, decision });
      }
      for (const [id, w] of workers) if (w.seenAt < now() - DAY_MS) workers.delete(id);
      return out;
    },

    async position(id) {
      const me = rows.get(id);
      if (!me || me.status !== 'queued') return 0;
      let ahead = 0;
      for (const q of rows.values()) {
        if (q === me || q.status !== 'queued') continue;
        if (q.priority > me.priority || (q.priority === me.priority && q.order < me.order)) ahead++;
      }
      return ahead + 1;
    },

    async stats() {
      const queued = [...rows.values()].filter((r) => r.status === 'queued');
      const running = [...rows.values()].filter((r) => r.status === 'running').length;
      const oldest = queued.length ? Math.min(...queued.map((r) => Date.parse(r.createdAt))) : null;
      const seen = [...workers.values()].map((w) => w.seenAt);
      const alive = seen.filter((t) => t > now() - WORKER_ALIVE_SECONDS * 1000).length;
      const last = seen.length ? Math.max(...seen) : null;
      return {
        queued: queued.length,
        oldestQueuedSec: oldest === null ? null : Math.floor((now() - oldest) / 1000),
        running,
        workersAlive: alive,
        lastWorkerSeenSec: last === null ? null : Math.floor((now() - last) / 1000),
      };
    },

    subscribe(id, onChange) {
      let set = jobListeners.get(id);
      if (!set) {
        set = new Set();
        jobListeners.set(id, set);
      }
      set.add(onChange);
      return () => {
        set!.delete(onChange);
        if (set!.size === 0) jobListeners.delete(id);
      };
    },

    subscribeQueue(onQueued) {
      queueListeners.add(onQueued);
      return () => { queueListeners.delete(onQueued); };
    },
  };
}
```

- [ ] **Step 7: Написать выбор драйвера и тексты**

`src/lib/jobs/current.ts`:

```ts
import { hasDb } from '../db/client';
import { createMemoryJobStore } from './store-memory';
import type { Job, JobStore } from './store';

// Драйвер в памяти живёт на globalThis: в next dev роуты и встроенный воркер
// получают разные экземпляры модулей, а очередь у процесса должна быть одна.
const MEMORY_KEY = Symbol.for('tesseract.memoryJobStore');

let override: JobStore | null = null;
let pgStore: JobStore | null = null;

/** Подмена драйвера в тестах; null возвращает автоматический выбор. */
export function __setJobStoreForTests(store: JobStore | null): void {
  override = store;
  pgStore = null;
}

/**
 * Как getRepo(): Postgres при заданном DATABASE_URL, память без него. В продакшне
 * работа без базы — ошибка конфигурации: очередь в памяти не видит воркер-службу.
 */
export function getJobStore(): JobStore {
  if (override) return override;
  if (hasDb()) {
    pgStore ??= createPgStore();
    return pgStore;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL не задан: в продакшне очередь заданий без базы данных запрещена');
  }
  const g = globalThis as unknown as Record<symbol, JobStore | undefined>;
  g[MEMORY_KEY] ??= createMemoryJobStore();
  return g[MEMORY_KEY]!;
}

/** Чужое задание неотличимо от несуществующего: и то и другое — null. */
export async function getOwnedJob(ownerId: string, id: string): Promise<Job | null> {
  const job = await getJobStore().get(id);
  return job && job.ownerId === ownerId ? job : null;
}
```

В этой задаче драйвера Postgres ещё нет, поэтому временно в конце файла:

```ts
// Временная заглушка: задача 4 заменит её драйвером createPgJobStore.
function createPgStore(): JobStore {
  throw new Error('драйвер заданий для Postgres ещё не подключён');
}
```

До задачи 9 роуты хранилище не используют, так что заглушка ни на что не влияет.

`src/lib/jobs/messages.ts`:

```ts
// Тексты ответов роутов заданий. Роуты Next не могут экспортировать ничего, кроме
// обработчиков, поэтому общие строки живут здесь — их же проверяют тесты.
export const GENERATION_BUSY_MESSAGE =
  'У вас уже идёт генерация. Дождитесь её окончания или отмените.';
export const REFINE_BUSY_MESSAGE =
  'У вас уже идёт доработка. Дождитесь её окончания или отмените.';
export const EMPTY_PROMPT_MESSAGE = 'Опишите, какую симуляцию нужно создать.';
export const EMPTY_INSTRUCTION_MESSAGE = 'Опишите, что нужно изменить в симуляции.';
export const JOB_NOT_FOUND_MESSAGE = 'Задание не найдено.';
export const SIMULATION_NOT_FOUND_MESSAGE = 'Симуляция не найдена.';
```

- [ ] **Step 8: Прогнать тесты**

```bash
npx vitest run tests/unit/job-policy.test.ts tests/unit/jobstore-memory.test.ts
npm test && npx tsc --noEmit
```

Ожидается: PASS.

- [ ] **Step 9: Коммит**

```bash
git add src/lib/jobs tests/jobstore-contract.ts tests/unit/job-policy.test.ts tests/unit/jobstore-memory.test.ts
git commit -m "feat(jobs): политика очереди и хранилище заданий в памяти

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Одно соединение `LISTEN` на процесс

**Files:**
- Create: `src/lib/jobs/listener.ts`, `tests/unit/job-listener.test.ts`

**Interfaces:**
- Consumes: `Client` из `pg`; `process.env.DATABASE_URL`.
- Produces:
  - `interface ListenClient { connect(): Promise<unknown>; query(sql: string): Promise<unknown>; on(event: string, cb: (arg?: unknown) => void): unknown; end(): Promise<void> }`;
  - `interface Listener { onJob(jobId: string, cb: () => void): () => void; onQueue(cb: () => void): () => void; close(): Promise<void> }`;
  - `createListener(factory: () => ListenClient, opts?: { retryMs?: number[] }): Listener`;
  - `listenJobEvents(jobId: string, cb: () => void): () => void` и `listenQueue(cb: () => void): () => void` — через общий слушатель процесса;
  - `closeListener(): Promise<void>`.

- [ ] **Step 1: Написать падающий тест**

`tests/unit/job-listener.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createListener, type ListenClient } from '@/lib/jobs/listener';

class FakeClient implements ListenClient {
  handlers = new Map<string, ((arg?: unknown) => void)[]>();
  queries: string[] = [];
  ended = false;
  constructor(private readonly failConnect = false) {}
  async connect() { if (this.failConnect) throw new Error('нет связи'); }
  async query(sql: string) { this.queries.push(sql); }
  on(event: string, cb: (arg?: unknown) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
    return this;
  }
  async end() { this.ended = true; }
  emit(event: string, arg?: unknown) {
    for (const cb of this.handlers.get(event) ?? []) cb(arg);
  }
}

function factoryOf(clients: FakeClient[]) {
  const made: FakeClient[] = [];
  const factory = () => {
    const c = clients[made.length] ?? new FakeClient();
    made.push(c);
    return c;
  };
  return { factory, made };
}

describe('listener', () => {
  it('одно соединение на все подписки, слушает оба канала', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    l.onJob('a', () => {});
    l.onJob('b', () => {});
    l.onQueue(() => {});
    await vi.waitFor(() => expect(made[0].queries).toEqual(['LISTEN job_events', 'LISTEN job_queue']));
    expect(made).toHaveLength(1);
    await l.close();
    expect(made[0].ended).toBe(true);
  });

  it('раздаёт уведомления по id задания и по очереди', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    const a = vi.fn();
    const b = vi.fn();
    const q = vi.fn();
    l.onJob('a', a);
    l.onJob('b', b);
    l.onQueue(q);
    await vi.waitFor(() => expect(made[0].queries).toHaveLength(2));
    a.mockClear(); b.mockClear(); q.mockClear();
    made[0].emit('notification', { channel: 'job_events', payload: 'a' });
    made[0].emit('notification', { channel: 'job_queue', payload: 'x' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(q).toHaveBeenCalledTimes(1);
    await l.close();
  });

  it('после обрыва переподключается и будит всех подписчиков дочитать пропущенное', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    const a = vi.fn();
    l.onJob('a', a);
    await vi.waitFor(() => expect(made[0].queries).toHaveLength(2));
    a.mockClear();
    made[0].emit('error', new Error('соединение сброшено'));
    await vi.waitFor(() => expect(made[1]?.queries).toHaveLength(2));
    expect(made[0].ended).toBe(true);
    await vi.waitFor(() => expect(a).toHaveBeenCalled());
    await l.close();
  });

  it('повторяет неудачное подключение', async () => {
    const { factory, made } = factoryOf([new FakeClient(true), new FakeClient(true)]);
    const l = createListener(factory, { retryMs: [0] });
    l.onQueue(() => {});
    await vi.waitFor(() => expect(made[2]?.queries).toHaveLength(2));
    await l.close();
  });

  it('отписка прекращает доставку', async () => {
    const { factory, made } = factoryOf([]);
    const l = createListener(factory, { retryMs: [0] });
    const a = vi.fn();
    const off = l.onJob('a', a);
    await vi.waitFor(() => expect(made[0].queries).toHaveLength(2));
    off();
    a.mockClear();
    made[0].emit('notification', { channel: 'job_events', payload: 'a' });
    expect(a).not.toHaveBeenCalled();
    await l.close();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npx vitest run tests/unit/job-listener.test.ts
```

Ожидается: FAIL — нет модуля `@/lib/jobs/listener`.

- [ ] **Step 3: Написать слушатель**

`src/lib/jobs/listener.ts`:

```ts
import { Client } from 'pg';

/** То немногое от pg.Client, что нужно слушателю; в тестах подменяется. */
export interface ListenClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  on(event: string, cb: (arg?: unknown) => void): unknown;
  end(): Promise<void>;
}

export interface Listener {
  onJob(jobId: string, cb: () => void): () => void;
  onQueue(cb: () => void): () => void;
  close(): Promise<void>;
}

const DEFAULT_RETRY_MS = [1000, 2000, 5000, 10000, 30000];

function safeCall(cb: () => void): void {
  try {
    cb();
  } catch (e) {
    console.error('Подписчик уведомлений заданий упал:', e);
  }
}

/**
 * Одно выделенное соединение LISTEN на процесс. Карта подписчиков — кэш соединения,
 * а не источник правды: подписчик по сигналу дочитывает журнал из базы по seq.
 * После любого (пере)подключения будим всех — за время обрыва уведомления терялись.
 */
export function createListener(factory: () => ListenClient, opts: { retryMs?: number[] } = {}): Listener {
  const delays = opts.retryMs ?? DEFAULT_RETRY_MS;
  const jobSubs = new Map<string, Set<() => void>>();
  const queueSubs = new Set<() => void>();
  let client: ListenClient | null = null;
  let connecting = false;
  let failures = 0;
  let closed = false;
  let timer: NodeJS.Timeout | null = null;

  function wakeAll(): void {
    for (const set of jobSubs.values()) for (const cb of set) safeCall(cb);
    for (const cb of queueSubs) safeCall(cb);
  }

  function schedule(): void {
    if (closed || timer) return;
    const delay = delays[Math.min(failures, delays.length - 1)];
    failures++;
    timer = setTimeout(() => {
      timer = null;
      ensure();
    }, delay);
    // Переподключение само по себе не должно держать процесс живым.
    timer.unref?.();
  }

  function ensure(): void {
    if (closed || client || connecting) return;
    connecting = true;
    const c = factory();
    let dropped = false;
    const drop = (err?: unknown) => {
      if (dropped) return;
      dropped = true;
      if (err) console.error('Соединение LISTEN потеряно:', err);
      if (client === c) client = null;
      c.end().catch(() => {});
      schedule();
    };
    c.on('error', drop);
    c.on('end', () => drop());
    c.on('notification', (arg) => {
      const msg = arg as { channel?: string; payload?: string };
      if (msg.channel === 'job_queue') {
        for (const cb of queueSubs) safeCall(cb);
      } else if (msg.channel === 'job_events' && msg.payload) {
        for (const cb of jobSubs.get(msg.payload) ?? []) safeCall(cb);
      }
    });
    (async () => {
      try {
        await c.connect();
        await c.query('LISTEN job_events');
        await c.query('LISTEN job_queue');
        connecting = false;
        if (dropped || closed) {
          if (closed) await c.end().catch(() => {});
          return;
        }
        client = c;
        failures = 0;
        wakeAll();
      } catch (e) {
        connecting = false;
        drop(e);
      }
    })();
  }

  return {
    onJob(jobId, cb) {
      let set = jobSubs.get(jobId);
      if (!set) {
        set = new Set();
        jobSubs.set(jobId, set);
      }
      set.add(cb);
      ensure();
      return () => {
        set!.delete(cb);
        if (set!.size === 0) jobSubs.delete(jobId);
      };
    },
    onQueue(cb) {
      queueSubs.add(cb);
      ensure();
      return () => { queueSubs.delete(cb); };
    },
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const c = client;
      client = null;
      await c?.end().catch(() => {});
    },
  };
}

let shared: Listener | null = null;

function sharedListener(): Listener {
  // pg.Client перегружает on() по именам событий; слушателю хватает общего вида.
  shared ??= createListener(
    () => new Client({ connectionString: process.env.DATABASE_URL }) as unknown as ListenClient);
  return shared;
}

export function listenJobEvents(jobId: string, cb: () => void): () => void {
  return sharedListener().onJob(jobId, cb);
}

export function listenQueue(cb: () => void): () => void {
  return sharedListener().onQueue(cb);
}

export async function closeListener(): Promise<void> {
  const l = shared;
  shared = null;
  await l?.close();
}
```

Обработчик `drop` при `connecting === true` планирует повтор, но `ensure` из таймера не создаст второе соединение, пока текущая попытка не сбросит флаг: в `catch` флаг снимается до `drop`.

- [ ] **Step 4: Прогнать тесты**

```bash
npx vitest run tests/unit/job-listener.test.ts
npm test && npx tsc --noEmit
```

Ожидается: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/jobs/listener.ts tests/unit/job-listener.test.ts
git commit -m "feat(jobs): одно соединение LISTEN на процесс с переподключением

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Драйвер заданий на Postgres

**Files:**
- Create: `src/lib/jobs/store-pg.ts`, `tests/integration/jobstore-pg.test.ts`
- Modify: `src/lib/jobs/current.ts`

**Interfaces:**
- Consumes: `JobStore` и помощники из `src/lib/jobs/store.ts`; `reapDecision` из `policy.ts`; `listenJobEvents`, `listenQueue`, `closeListener` из `listener.ts`; `db()` из `src/lib/db/client.ts`.
- Produces: `createPgJobStore(pool: Pool, listen?: { job: (id: string, cb: () => void) => () => void; queue: (cb: () => void) => () => void }): JobStore`.

- [ ] **Step 1: Написать падающий интеграционный тест**

`tests/integration/jobstore-pg.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createPgJobStore } from '@/lib/jobs/store-pg';
import { closeListener } from '@/lib/jobs/listener';
import { jobStoreContract } from '../jobstore-contract';

const SCHEMA = 'jobstore_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => {
  await closeListener();
  await pool?.end();
  await closeDb();
});

async function cleanStore() {
  await pool!.query('DELETE FROM job_events; DELETE FROM jobs; DELETE FROM workers; DELETE FROM users;');
  return {
    store: createPgJobStore(pool!),
    owner: async () => (await createUser(`u-${crypto.randomUUID()}@example.com`, 'пароль123')).id,
    expireLeases: async () => {
      await pool!.query(
        "UPDATE jobs SET locked_until = now() - interval '5 minutes' WHERE status = 'running'");
    },
  };
}

jobStoreContract('Postgres', cleanStore, !pool);

describe.skipIf(!pool)('Postgres: то, чего нет у памяти', () => {
  it('два одновременных claim из разных соединений берут разные задания', async () => {
    const env = await cleanStore();
    for (let i = 0; i < 2; i++) {
      await env.store.create({
        ownerId: await env.owner(), kind: 'generate', priority: 0,
        request: { prompt: 'p', mode: 'fast', hasImage: false },
      });
    }
    const url = process.env.DATABASE_URL!;
    const poolA = new Pool({ connectionString: url });
    const poolB = new Pool({ connectionString: url });
    try {
      const [a, b] = await Promise.all([
        createPgJobStore(poolA).claim('wa'), createPgJobStore(poolB).claim('wb')]);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a!.id).not.toBe(b!.id);
    } finally {
      await poolA.end();
      await poolB.end();
    }
  });

  it('finish стирает картинку и аренду', async () => {
    const env = await cleanStore();
    const job = await env.store.create({
      ownerId: await env.owner(), kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: true }, imageDataUrl: 'data:image/png;base64,AA',
    });
    await env.store.claim('w1');
    await env.store.finish(job.id, 'w1', { status: 'cancelled' });
    const { rows } = await pool!.query(
      'SELECT image_data_url, locked_by, locked_until FROM jobs WHERE id = $1', [job.id]);
    expect(rows[0]).toEqual({ image_data_url: null, locked_by: null, locked_until: null });
  });

  it('старое задание без job_events отдаёт журнал из jobs.events', async () => {
    const env = await cleanStore();
    const owner = await env.owner();
    const id = crypto.randomUUID();
    const legacy = [
      { type: 'stage', stage: 'planning', status: 'start', at: 1 },
      { type: 'done', simulationId: '33333333-3333-3333-3333-333333333333' },
    ];
    await pool!.query(
      "INSERT INTO jobs (id, owner_id, status, request, events, simulation_id) VALUES ($1,$2,'done','{}'::jsonb,$3::jsonb,$4)",
      [id, owner, JSON.stringify(legacy), '33333333-3333-3333-3333-333333333333']);
    expect(await env.store.events(id, 0)).toEqual([
      { seq: 1, event: legacy[0] }, { seq: 2, event: legacy[1] },
    ]);
    expect(await env.store.events(id, 1)).toEqual([{ seq: 2, event: legacy[1] }]);
  });

  it('сердцебиение пишет строку воркера', async () => {
    const env = await cleanStore();
    await env.store.heartbeat('host:1:abc', 'host', 0);
    await env.store.heartbeat('host:1:abc', 'host', 2);
    const { rows } = await pool!.query('SELECT id, host, running FROM workers');
    expect(rows).toEqual([{ id: 'host:1:abc', host: 'host', running: 2 }]);
  });
});
```

`closeListener()` в `afterAll` закрывает общее соединение `LISTEN`, иначе процесс vitest не завершится. Каналы `NOTIFY` общие для всей базы, а не для схемы: соседние файлы тестов могут слать уведомления с чужими id, подписчики по id их просто не получают.

- [ ] **Step 2: Убедиться, что тест падает**

```bash
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow \
  npx vitest run tests/integration/jobstore-pg.test.ts
```

Ожидается: FAIL — нет модуля `@/lib/jobs/store-pg`.

- [ ] **Step 3: Написать драйвер**

`src/lib/jobs/store-pg.ts`:

```ts
import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PipelineEvent } from '../types';
import { reapDecision } from './policy';
import { listenJobEvents, listenQueue } from './listener';
import {
  ActiveJobExistsError, LEASE_SECONDS, LOST_TWICE_MESSAGE, REAP_GRACE_SECONDS, REQUEUE_WARNING,
  WORKER_ALIVE_SECONDS, outcomeEvent,
  type Job, type JobKind, type JobRequest, type JobStatus, type JobStore,
  type ReapedJob, type StoredEvent,
} from './store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = `id, owner_id, kind, status, priority, request, target_simulation_id, simulation_id,
  error, attempts, cancel_requested_at, created_at, started_at, finished_at`;

interface Row {
  id: string; owner_id: string; kind: JobKind; status: JobStatus; priority: number;
  request: JobRequest; target_simulation_id: string | null; simulation_id: string | null;
  error: string | null; attempts: number; cancel_requested_at: Date | null;
  created_at: Date; started_at: Date | null; finished_at: Date | null;
  image_data_url?: string | null;
}

function toJob(r: Row): Job {
  return {
    id: r.id,
    ownerId: r.owner_id,
    kind: r.kind,
    status: r.status,
    priority: r.priority,
    request: r.request,
    targetSimulationId: r.target_simulation_id,
    simulationId: r.simulation_id,
    error: r.error,
    attempts: r.attempts,
    cancelRequested: r.cancel_requested_at !== null,
    createdAt: r.created_at.toISOString(),
    startedAt: r.started_at?.toISOString() ?? null,
    finishedAt: r.finished_at?.toISOString() ?? null,
  };
}

const ACTIVE_INDEX: Record<string, JobKind> = {
  jobs_one_active_generate: 'generate',
  jobs_one_active_refine: 'refine',
};

function errorCode(e: unknown): { code?: string; constraint?: string } {
  return typeof e === 'object' && e !== null ? (e as { code?: string; constraint?: string }) : {};
}

async function inTx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Событие внутри транзакции; NOTIFY уйдёт подписчикам в момент COMMIT. */
async function insertEvent(c: PoolClient, id: string, event: PipelineEvent): Promise<number> {
  const { rows } = await c.query<{ seq: number }>(
    `INSERT INTO job_events (job_id, seq, event)
     SELECT $1::uuid, coalesce(max(seq), 0) + 1, $2::jsonb FROM job_events WHERE job_id = $1::uuid
     RETURNING seq`, [id, JSON.stringify(event)]);
  await c.query("SELECT pg_notify('job_events', $1)", [id]);
  return rows[0].seq;
}

const SECONDS = (n: number) => `interval '${n} seconds'`;

export function createPgJobStore(
  pool: Pool,
  listen: {
    job: (id: string, cb: () => void) => () => void;
    queue: (cb: () => void) => () => void;
  } = { job: listenJobEvents, queue: listenQueue },
): JobStore {
  return {
    async create(input) {
      try {
        const { rows } = await pool.query<Row>(
          `WITH ins AS (
             INSERT INTO jobs (id, owner_id, kind, status, priority, request, target_simulation_id, image_data_url)
             VALUES ($1, $2, $3, 'queued', $4, $5::jsonb, $6, $7)
             RETURNING ${COLUMNS})
           SELECT ins.*, pg_notify('job_queue', ins.id::text) FROM ins`,
          [crypto.randomUUID(), input.ownerId, input.kind, input.priority,
            JSON.stringify(input.request), input.targetSimulationId ?? null, input.imageDataUrl ?? null]);
        return toJob(rows[0]);
      } catch (e) {
        const { code, constraint } = errorCode(e);
        if (code === '23505' && constraint && ACTIVE_INDEX[constraint]) {
          throw new ActiveJobExistsError(ACTIVE_INDEX[constraint]);
        }
        throw e;
      }
    },

    async get(id) {
      if (!UUID_RE.test(id)) return null;
      const { rows } = await pool.query<Row>(`SELECT ${COLUMNS} FROM jobs WHERE id = $1`, [id]);
      return rows[0] ? toJob(rows[0]) : null;
    },

    async claim(workerId) {
      const { rows } = await pool.query<Row>(
        `UPDATE jobs SET status = 'running', locked_by = $1,
                locked_until = now() + ${SECONDS(LEASE_SECONDS)},
                attempts = attempts + 1, started_at = coalesce(started_at, now())
         WHERE id = (
           SELECT id FROM jobs WHERE status = 'queued'
           ORDER BY priority DESC, created_at
           FOR UPDATE SKIP LOCKED LIMIT 1)
         RETURNING ${COLUMNS}, image_data_url`, [workerId]);
      const r = rows[0];
      return r ? { ...toJob(r), imageDataUrl: r.image_data_url ?? null } : null;
    },

    async appendEvent(id, event, workerId) {
      if (!UUID_RE.test(id)) return null;
      // HAVING, а не WHERE: агрегат без GROUP BY даёт строку даже на пустом наборе,
      // и условие владения обязано отсечь именно её.
      const sql = `
        WITH ins AS (
          INSERT INTO job_events (job_id, seq, event)
          SELECT $1::uuid, coalesce(max(e.seq), 0) + 1, $2::jsonb
          FROM job_events e WHERE e.job_id = $1::uuid
          HAVING EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = $1::uuid
              AND ($3::text IS NULL OR (j.locked_by = $3::text AND j.status = 'running')))
          RETURNING seq)
        SELECT seq, pg_notify('job_events', $1::uuid::text) FROM ins`;
      const params = [id, JSON.stringify(event), workerId ?? null];
      // Гонка за seq возможна только с уборщиком или отменой из веба; повтор её снимает.
      for (let attempt = 0; ; attempt++) {
        try {
          const { rows } = await pool.query<{ seq: number }>(sql, params);
          return rows[0]?.seq ?? null;
        } catch (e) {
          if (errorCode(e).code !== '23505' || attempt >= 2) throw e;
        }
      }
    },

    async events(id, afterSeq) {
      if (!UUID_RE.test(id)) return [];
      const { rows } = await pool.query<StoredEvent>(
        'SELECT seq, event FROM job_events WHERE job_id = $1 AND seq > $2 ORDER BY seq', [id, afterSeq]);
      if (rows.length > 0) return rows;
      // Старые записи: журнал лежит в jobs.events, пока у задания нет ни одной строки job_events.
      const legacy = await pool.query<{ events: PipelineEvent[] }>(
        `SELECT events FROM jobs WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM job_events WHERE job_id = $1)`, [id]);
      const list = legacy.rows[0]?.events ?? [];
      return list.map((event, i) => ({ seq: i + 1, event })).filter((e) => e.seq > afterSeq);
    },

    async markSaved(id, workerId, simulationId) {
      await pool.query(
        "UPDATE jobs SET simulation_id = $3 WHERE id = $1 AND locked_by = $2 AND status = 'running'",
        [id, workerId, simulationId]);
    },

    async finish(id, workerId, outcome) {
      return inTx(pool, async (c) => {
        const { rowCount } = await c.query(
          `UPDATE jobs SET status = $3,
                  simulation_id = coalesce($4, simulation_id),
                  error = $5, finished_at = now(), image_data_url = NULL,
                  locked_by = NULL, locked_until = NULL
           WHERE id = $1 AND locked_by = $2 AND status = 'running'`,
          [id, workerId, outcome.status,
            outcome.status === 'done' ? outcome.simulationId : null,
            outcome.status === 'error' ? outcome.message : null]);
        if (!rowCount) return false;
        await insertEvent(c, id, outcomeEvent(outcome));
        return true;
      });
    },

    async requestCancel(id) {
      if (!UUID_RE.test(id)) return;
      await pool.query(
        `UPDATE jobs SET cancel_requested_at = coalesce(cancel_requested_at, now())
         WHERE id = $1 AND status IN ('queued', 'running')`, [id]);
    },

    async cancelQueued(id) {
      if (!UUID_RE.test(id)) return false;
      return inTx(pool, async (c) => {
        const { rowCount } = await c.query(
          `UPDATE jobs SET status = 'cancelled',
                  cancel_requested_at = coalesce(cancel_requested_at, now()),
                  finished_at = now(), image_data_url = NULL
           WHERE id = $1 AND status = 'queued'`, [id]);
        if (!rowCount) return false;
        await insertEvent(c, id, { type: 'cancelled' });
        return true;
      });
    },

    async heartbeat(workerId, host, running) {
      // Изменяющий CTE выполняется, даже если на него никто не ссылается.
      const { rows } = await pool.query<{ id: string; cancel: boolean }>(
        `WITH w AS (
           INSERT INTO workers (id, host, running) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET seen_at = now(), running = EXCLUDED.running),
         j AS (
           UPDATE jobs SET locked_until = now() + ${SECONDS(LEASE_SECONDS)}
           WHERE locked_by = $1 AND status = 'running'
           RETURNING id, cancel_requested_at)
         SELECT id, cancel_requested_at IS NOT NULL AS cancel FROM j`,
        [workerId, host, running]);
      return {
        leased: rows.map((r) => r.id),
        cancelRequested: rows.filter((r) => r.cancel).map((r) => r.id),
      };
    },

    async retireWorker(workerId) {
      await pool.query('DELETE FROM workers WHERE id = $1', [workerId]);
    },

    async reap() {
      const reaped = await inTx(pool, async (c) => {
        const { rows } = await c.query<{ id: string; attempts: number; cancel_requested: boolean }>(
          `SELECT id, attempts, cancel_requested_at IS NOT NULL AS cancel_requested
           FROM jobs
           WHERE status = 'running' AND locked_until < now() - ${SECONDS(REAP_GRACE_SECONDS)}
           FOR UPDATE SKIP LOCKED`);
        const out: ReapedJob[] = [];
        for (const r of rows) {
          const decision = reapDecision({ attempts: r.attempts, cancelRequested: r.cancel_requested });
          if (decision === 'requeue') {
            await c.query(
              "UPDATE jobs SET status = 'queued', locked_by = NULL, locked_until = NULL WHERE id = $1",
              [r.id]);
            await insertEvent(c, r.id, { type: 'warning', message: REQUEUE_WARNING });
          } else {
            const status = decision === 'fail' ? 'error' : 'cancelled';
            const error = decision === 'fail' ? LOST_TWICE_MESSAGE : null;
            await c.query(
              `UPDATE jobs SET status = $2, error = $3, finished_at = now(), image_data_url = NULL,
                      locked_by = NULL, locked_until = NULL
               WHERE id = $1`, [r.id, status, error]);
            await insertEvent(c, r.id, decision === 'fail'
              ? { type: 'error', message: LOST_TWICE_MESSAGE }
              : { type: 'cancelled' });
          }
          out.push({ id: r.id, decision });
        }
        if (out.some((r) => r.decision === 'requeue')) {
          await c.query("SELECT pg_notify('job_queue', '')");
        }
        return out;
      });
      await pool.query("DELETE FROM workers WHERE seen_at < now() - interval '1 day'");
      return reaped;
    },

    async position(id) {
      if (!UUID_RE.test(id)) return 0;
      const { rows } = await pool.query<{ position: number }>(
        `SELECT CASE WHEN me.status <> 'queued' THEN 0 ELSE (
           SELECT count(*)::int + 1 FROM jobs q
           WHERE q.status = 'queued'
             AND (q.priority > me.priority
                  OR (q.priority = me.priority AND q.created_at < me.created_at)))
         END AS position
         FROM jobs me WHERE me.id = $1`, [id]);
      return rows[0]?.position ?? 0;
    },

    async stats() {
      const { rows } = await pool.query<{
        queued: number; oldest: string | null; running: number; alive: number; last_seen: string | null;
      }>(
        `SELECT
           (SELECT count(*)::int FROM jobs WHERE status = 'queued') AS queued,
           (SELECT extract(epoch FROM now() - min(created_at)) FROM jobs WHERE status = 'queued') AS oldest,
           (SELECT count(*)::int FROM jobs WHERE status = 'running') AS running,
           (SELECT count(*)::int FROM workers
              WHERE seen_at > now() - ${SECONDS(WORKER_ALIVE_SECONDS)}) AS alive,
           (SELECT extract(epoch FROM now() - max(seen_at)) FROM workers) AS last_seen`);
      const r = rows[0];
      const sec = (v: string | null) => (v === null ? null : Math.max(0, Math.floor(Number(v))));
      return {
        queued: r.queued,
        oldestQueuedSec: sec(r.oldest),
        running: r.running,
        workersAlive: r.alive,
        lastWorkerSeenSec: sec(r.last_seen),
      };
    },

    subscribe(id, onChange) {
      return listen.job(id, onChange);
    },

    subscribeQueue(onQueued) {
      return listen.queue(onQueued);
    },
  };
}
```

Тип `ClaimedJob` драйверу не нужен: объект возвращается через интерфейс `JobStore`, и его форму проверяет `tsc`.

- [ ] **Step 4: Подключить драйвер в выборе**

В `src/lib/jobs/current.ts` заменить импорт клиента и удалить временную заглушку `createPgStore`:

```ts
import { db, hasDb } from '../db/client';
import { createMemoryJobStore } from './store-memory';
import { createPgJobStore } from './store-pg';
import type { Job, JobStore } from './store';
```

и в конце файла:

```ts
function createPgStore(): JobStore {
  return createPgJobStore(db());
}
```

- [ ] **Step 5: Прогнать тесты**

```bash
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow \
  npx vitest run tests/integration/jobstore-pg.test.ts tests/unit/jobstore-memory.test.ts
npm test && npx tsc --noEmit
```

Ожидается: PASS — один и тот же набор проверок зелёный на обоих драйверах.

- [ ] **Step 6: Коммит**

```bash
git add src/lib/jobs/store-pg.ts src/lib/jobs/current.ts tests/integration/jobstore-pg.test.ts
git commit -m "feat(jobs): драйвер очереди на Postgres — SKIP LOCKED, журнал с seq, NOTIFY

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Крючки пайплайна — `onSaved` и отмена доработки

**Files:**
- Modify: `src/lib/pipeline/run.ts`, `tests/unit/run.test.ts`

**Interfaces:**
- Consumes: `createSimulation`, `updateArtifact` из `src/lib/storage.ts`.
- Produces:
  - `runPipeline(ctx, input: { ownerId: string; prompt: string; imageDataUrl?: string; mode: QualityMode; onSaved?: (simulationId: string) => Promise<void> }, signal?: () => boolean): Promise<SimulationMeta>` — `onSaved` вызывается сразу после `createSimulation`, до превью и до события `done`;
  - `refineExisting(ctx, ownerId, id, instruction, opts?: { signal?: () => boolean; onSaved?: (simulationId: string) => Promise<void> }): Promise<void>` — проверяет отмену перед правкой и перед записью артефакта; `onSaved(id)` вызывается сразу после `updateArtifact`.

Изменение минимальное: пятый аргумент необязателен, поэтому существующие вызовы и тесты не меняются.

- [ ] **Step 1: Написать падающие тесты**

В `tests/unit/run.test.ts` в `describe('runPipeline', ...)` добавить:

```ts
  it('onSaved получает id сразу после сохранения, до события done', async () => {
    const { ctx } = fakeCtx();
    const order: string[] = [];
    const emit = ctx.emit;
    ctx.emit = (e) => { if (e.type === 'done') order.push('done'); emit(e); };
    const meta = await runPipeline(ctx, {
      ownerId: OWNER, prompt: 'маятник', mode: 'fast',
      onSaved: async (id) => {
        // Симуляция уже в хранилище: повторная попытка по этому id найдёт готовый результат.
        expect(await getMeta(OWNER, id)).not.toBeNull();
        order.push(`saved:${id}`);
      },
    });
    expect(order).toEqual([`saved:${meta.id}`, 'done']);
  });
```

В `describe('refineExisting', ...)` добавить:

```ts
  it('отмена до правки: CancelledError, артефакт и история не тронуты', async () => {
    const meta = await createSimulation(
      OWNER, { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>');
    const { ctx } = fakeCtx();
    await expect(refineExisting(ctx, OWNER, meta.id, 'медленнее', { signal: () => true }))
      .rejects.toBeInstanceOf(CancelledError);
    expect(callsByRole(ctx.chat, 'refiner')).toHaveLength(0);
    expect(await getArtifact(OWNER, meta.id)).toBe('<html>old</html>');
    expect(await listHistory(OWNER, meta.id)).toEqual([]);
  });

  it('отмена во время правки: до записи артефакта', async () => {
    const meta = await createSimulation(
      OWNER, { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>');
    const { ctx } = fakeCtx();
    // Первая проверка (перед правкой) пропускает, вторая (перед записью) останавливает.
    let checks = 0;
    const signal = () => checks++ > 0;
    await expect(refineExisting(ctx, OWNER, meta.id, 'медленнее', { signal }))
      .rejects.toBeInstanceOf(CancelledError);
    expect(callsByRole(ctx.chat, 'refiner')).toHaveLength(1);
    expect(await getArtifact(OWNER, meta.id)).toBe('<html>old</html>');
  });

  it('onSaved вызывается с id после записи артефакта', async () => {
    const meta = await createSimulation(
      OWNER, { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>');
    const { ctx, events } = fakeCtx();
    const saved: string[] = [];
    await refineExisting(ctx, OWNER, meta.id, 'медленнее', {
      onSaved: async (id) => {
        expect(await getArtifact(OWNER, id)).toContain('showmehow-runtime');
        expect(events.some((e) => e.type === 'done')).toBe(false);
        saved.push(id);
      },
    });
    expect(saved).toEqual([meta.id]);
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
npx vitest run tests/unit/run.test.ts
```

Ожидается: FAIL — `onSaved` не вызывается, `refineExisting` не принимает пятый аргумент (ошибка типа во время выполнения не возникнет, но тесты отмены и `onSaved` упадут на ожиданиях).

- [ ] **Step 3: Добавить крючки**

В `src/lib/pipeline/run.ts`:

1. Сигнатура `runPipeline`:

```ts
export async function runPipeline(
  ctx: Ctx,
  input: {
    ownerId: string; prompt: string; imageDataUrl?: string; mode: QualityMode;
    /**
     * Вызывается сразу после сохранения, до превью и события done. Воркер записывает
     * id в задание: повторная попытка после потери воркера не создаст вторую симуляцию.
     */
    onSaved?: (simulationId: string) => Promise<void>;
  },
  signal?: () => boolean,
): Promise<SimulationMeta> {
```

2. Сразу после `const meta = await createSimulation(...)`, перед `const shot = ...`:

```ts
  await input.onSaved?.(meta.id);
```

3. `refineExisting` целиком:

```ts
export async function refineExisting(
  ctx: Ctx, ownerId: string, id: string, instruction: string,
  opts: { signal?: () => boolean; onSaved?: (simulationId: string) => Promise<void> } = {},
): Promise<void> {
  function checkCancelled(): void {
    if (opts.signal?.()) throw new CancelledError();
  }

  const html = await getArtifact(ownerId, id);
  if (html === null) throw new Error('Симуляция не найдена');
  checkCancelled();
  emitStage(ctx, 'refining', 'start');
  try {
    let refined = await refineHtml(ctx, html, instruction);
    let report = await ctx.render(refined);
    let forbidden = findForbiddenUrls(refined, CDN_ALLOWED);
    for (let attempt = 0; (!report.ok || forbidden.length > 0) && attempt < 2; attempt++) {
      const errors = [...report.errors];
      if (forbidden.length) errors.push(`Запрещённые внешние ресурсы: ${forbidden.join(', ')}`);
      refined = await fixArtifact(ctx, refined, errors);
      report = await ctx.render(refined);
      forbidden = findForbiddenUrls(refined, CDN_ALLOWED);
    }
    if (!report.ok) throw new Error('Правка сломала симуляцию: ' + report.errors.join('; '));
    if (forbidden.length > 0) {
      throw new Error('Правка внесла запрещённые внешние ресурсы: ' + forbidden.join(', '));
    }
    // Последняя точка отмены: после записи артефакта отменять уже нечего.
    checkCancelled();
    await updateArtifact(ownerId, id, refined);
    await opts.onSaved?.(id);
    const shot = report.screenshots[1] ?? report.screenshots[0];
    if (shot) await saveThumbnail(ownerId, id, shot);
  } finally {
    emitStage(ctx, 'refining', 'end');
  }
  ctx.emit({ type: 'done', simulationId: id });
}
```

- [ ] **Step 4: Прогнать тесты**

```bash
npx vitest run tests/unit/run.test.ts
npm test && npx tsc --noEmit
```

Ожидается: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/pipeline/run.ts tests/unit/run.test.ts
git commit -m "feat(pipeline): onSaved после сохранения и кооперативная отмена доработки

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Воркер — выполнение задания и цикл захвата

**Files:**
- Create: `src/lib/worker/worker.ts`, `src/lib/worker/execute.ts`, `tests/unit/worker.test.ts`, `tests/unit/worker-execute.test.ts`

**Interfaces:**
- Consumes: `JobStore`, `ClaimedJob`, `JobOutcome`, `GenerateRequest`, `RefineRequest` из `src/lib/jobs/store.ts`; `needsRun` из `policy.ts`; `makeCtx`, `runPipeline`, `refineExisting`, `CancelledError` из `src/lib/pipeline/run.ts`.
- Produces (`src/lib/worker/worker.ts`):
  - `interface JobIO { emit(event: PipelineEvent): void; cancelled(): boolean; markSaved(simulationId: string): Promise<void> }`;
  - `type Execute = (job: ClaimedJob, io: JobIO) => Promise<JobOutcome>`;
  - `interface WorkerOptions { store: JobStore; execute: Execute; concurrency: number; drainMs: number; id?: string; host?: string; pollMs?: number; heartbeatMs?: number; reapMs?: number; onReap?: () => Promise<void>; log?: (msg: string, err?: unknown) => void }`;
  - `interface Worker { readonly id: string; start(): void; fill(): Promise<void>; heartbeat(): Promise<void>; reap(): Promise<void>; stop(): Promise<{ drained: boolean }>; running(): number; idle(): Promise<void> }`;
  - `createWorker(opts: WorkerOptions): Worker`;
  - `makeWorkerId(host?: string): string` — `host:pid:случайный суффикс`.
- Produces (`src/lib/worker/execute.ts`):
  - `interface ExecuteDeps { makeCtx: typeof makeCtx; runPipeline: typeof runPipeline; refineExisting: typeof refineExisting }`;
  - `executeJob(job: ClaimedJob, io: JobIO, deps?: ExecuteDeps): Promise<JobOutcome>` — никогда не бросает.

`worker.ts` не импортирует пайплайн: его тесты не зависят от Playwright, а отмену и ошибки в исход переводит `executeJob`.

- [ ] **Step 1: Написать падающие тесты выполнения**

`tests/unit/worker-execute.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { executeJob, type ExecuteDeps } from '@/lib/worker/execute';
import { CancelledError } from '@/lib/pipeline/run';
import { NO_PROVIDER_MESSAGE } from '@/lib/settings';
import type { ClaimedJob } from '@/lib/jobs/store';
import type { JobIO } from '@/lib/worker/worker';
import type { Ctx } from '@/lib/pipeline/stages';
import type { SimulationMeta } from '@/lib/types';

const OWNER = '11111111-1111-1111-1111-111111111111';
const SIM = '55555555-5555-5555-5555-555555555555';

function claimed(extra: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: crypto.randomUUID(), ownerId: OWNER, kind: 'generate', status: 'running', priority: 0,
    request: { prompt: 'маятник', mode: 'fast', hasImage: true },
    targetSimulationId: null, simulationId: null, error: null, attempts: 1, cancelRequested: false,
    createdAt: '2026-09-17T10:00:00.000Z', startedAt: '2026-09-17T10:00:01.000Z', finishedAt: null,
    imageDataUrl: 'data:image/png;base64,AA',
    ...extra,
  };
}

function makeIo(): JobIO {
  return { emit: vi.fn(), cancelled: vi.fn(() => false), markSaved: vi.fn(async () => {}) };
}

function makeDeps(over: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    makeCtx: vi.fn(() => ({}) as Ctx),
    runPipeline: vi.fn(async () => ({ id: SIM }) as SimulationMeta),
    refineExisting: vi.fn(async () => {}),
    ...over,
  };
}

describe('executeJob', () => {
  it('генерация: передаёт вход, картинку, отмену и onSaved', async () => {
    const io = makeIo();
    const deps = makeDeps();
    expect(await executeJob(claimed(), io, deps)).toEqual({ status: 'done', simulationId: SIM });
    expect(deps.makeCtx).toHaveBeenCalledWith(io.emit);
    expect(deps.runPipeline).toHaveBeenCalledWith({}, {
      ownerId: OWNER, prompt: 'маятник', mode: 'fast',
      imageDataUrl: 'data:image/png;base64,AA', onSaved: io.markSaved,
    }, io.cancelled);
  });

  it('доработка: правит целевую симуляцию и возвращает её id', async () => {
    const io = makeIo();
    const deps = makeDeps();
    const job = claimed({
      kind: 'refine', request: { instruction: 'медленнее' }, targetSimulationId: SIM, imageDataUrl: null,
    });
    expect(await executeJob(job, io, deps)).toEqual({ status: 'done', simulationId: SIM });
    expect(deps.refineExisting).toHaveBeenCalledWith({}, OWNER, SIM, 'медленнее',
      { signal: io.cancelled, onSaved: io.markSaved });
    expect(deps.runPipeline).not.toHaveBeenCalled();
  });

  it('сохранённое задание завершается без повторной генерации', async () => {
    const deps = makeDeps();
    expect(await executeJob(claimed({ simulationId: SIM }), makeIo(), deps))
      .toEqual({ status: 'done', simulationId: SIM });
    expect(deps.makeCtx).not.toHaveBeenCalled();
    expect(deps.runPipeline).not.toHaveBeenCalled();
  });

  it('CancelledError — отмена', async () => {
    const deps = makeDeps({ runPipeline: vi.fn(async () => { throw new CancelledError(); }) });
    expect(await executeJob(claimed(), makeIo(), deps)).toEqual({ status: 'cancelled' });
  });

  it('прочие исключения — ошибка с текстом', async () => {
    const deps = makeDeps({ runPipeline: vi.fn(async () => { throw new Error('Модель не ответила.'); }) });
    expect(await executeJob(claimed(), makeIo(), deps))
      .toEqual({ status: 'error', message: 'Модель не ответила.' });
  });

  it('провайдер не настроен — ошибка, а не падение воркера', async () => {
    const deps = makeDeps({ makeCtx: vi.fn(() => { throw new Error(NO_PROVIDER_MESSAGE); }) });
    expect(await executeJob(claimed(), makeIo(), deps))
      .toEqual({ status: 'error', message: NO_PROVIDER_MESSAGE });
  });

  it('доработка без целевой симуляции — ошибка', async () => {
    const job = claimed({ kind: 'refine', request: { instruction: 'x' }, targetSimulationId: null });
    expect(await executeJob(job, makeIo(), makeDeps()))
      .toEqual({ status: 'error', message: 'У задания доработки не указана симуляция.' });
  });
});
```

- [ ] **Step 2: Написать падающие тесты цикла**

`tests/unit/worker.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { REQUEUE_WARNING, type ClaimedJob, type JobOutcome, type JobStore, type NewJob } from '@/lib/jobs/store';
import { createWorker, type Execute, type JobIO, type Worker, type WorkerOptions } from '@/lib/worker/worker';
import { executeJob, type ExecuteDeps } from '@/lib/worker/execute';
import type { Ctx } from '@/lib/pipeline/stages';

interface Run { job: ClaimedJob; io: JobIO; finish: (o: JobOutcome) => void }

/** Исполнитель, которым управляет тест: каждое задание висит, пока тест его не завершит. */
function controlled() {
  const runs: Run[] = [];
  const execute: Execute = (job, io) =>
    new Promise<JobOutcome>((resolve) => { runs.push({ job, io, finish: resolve }); });
  return { runs, execute };
}

let clock = 0;
let store: JobStore;
let count = 0;

function makeWorker(execute: Execute, extra: Partial<WorkerOptions> = {}): Worker {
  count++;
  return createWorker({
    store, execute, concurrency: 2, drainMs: 1000, id: `w-${count}`, host: 'test', log: () => {},
    ...extra,
  });
}

const newJob = (priority = 0): NewJob => ({
  ownerId: crypto.randomUUID(), kind: 'generate', priority,
  request: { prompt: 'p', mode: 'fast', hasImage: false },
});
const done = (): JobOutcome => ({ status: 'done', simulationId: crypto.randomUUID() });

beforeEach(() => {
  clock = Date.parse('2026-09-17T10:00:00Z');
  store = createMemoryJobStore({ now: () => clock });
  count = 0;
});

describe('воркер', () => {
  it('держит не больше concurrency заданий и берёт следующее по освобождении', async () => {
    const { runs, execute } = controlled();
    for (let i = 0; i < 3; i++) await store.create(newJob());
    const w = makeWorker(execute);
    await w.fill();
    expect(runs).toHaveLength(2);
    expect(w.running()).toBe(2);
    expect((await store.stats()).queued).toBe(1);
    runs[0].finish(done());
    await vi.waitFor(() => expect(runs).toHaveLength(3));
  });

  it('берёт по приоритету, затем по времени', async () => {
    const order: string[] = [];
    const low1 = await store.create(newJob(0));
    const high = await store.create(newJob(10));
    const low2 = await store.create(newJob(0));
    const w = makeWorker(async (job) => { order.push(job.id); return done(); }, { concurrency: 1 });
    await w.fill();
    await vi.waitFor(() => expect(order).toEqual([high.id, low1.id, low2.id]));
  });

  it('пишет события по порядку, done пайплайна заменяет финальным', async () => {
    const simId = crypto.randomUUID();
    const job = await store.create(newJob());
    const w = makeWorker(async (_job, io) => {
      io.emit({ type: 'stage', stage: 'planning', status: 'start', at: 1 });
      io.emit({ type: 'warning', message: 'осторожно' });
      io.emit({ type: 'done', simulationId: simId });
      return { status: 'done', simulationId: simId };
    });
    await w.fill();
    await w.idle();
    expect((await store.events(job.id, 0)).map((e) => e.event)).toEqual([
      { type: 'stage', stage: 'planning', status: 'start', at: 1 },
      { type: 'warning', message: 'осторожно' },
      { type: 'done', simulationId: simId },
    ]);
    expect(await store.get(job.id)).toMatchObject({ status: 'done', simulationId: simId });
  });

  it('исключение исполнителя превращается в ошибку задания', async () => {
    const job = await store.create(newJob());
    const w = makeWorker(async () => { throw new Error('сломалось'); });
    await w.fill();
    await w.idle();
    expect(await store.get(job.id)).toMatchObject({ status: 'error', error: 'сломалось' });
  });

  it('отменённое в очереди задание не берётся', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    await store.cancelQueued(job.id);
    await makeWorker(execute).fill();
    expect(runs).toHaveLength(0);
  });

  it('отмена идущего доходит до пайплайна через сердцебиение', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    const w = makeWorker(execute);
    await w.fill();
    await store.requestCancel(job.id);
    expect(runs[0].io.cancelled()).toBe(false);
    await w.heartbeat();
    expect(runs[0].io.cancelled()).toBe(true);
    runs[0].finish({ status: 'cancelled' });
    await w.idle();
    expect((await store.get(job.id))?.status).toBe('cancelled');
    expect((await store.events(job.id, 0)).at(-1)?.event).toEqual({ type: 'cancelled' });
  });

  it('мягкая остановка: новых не берёт, текущие доделывает', async () => {
    const { runs, execute } = controlled();
    const first = await store.create(newJob());
    const w = makeWorker(execute, { concurrency: 1 });
    w.start();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    const second = await store.create(newJob());
    const stopping = w.stop();
    runs[0].finish(done());
    expect(await stopping).toEqual({ drained: true });
    await w.fill();
    expect(runs).toHaveLength(1);
    expect((await store.get(first.id))?.status).toBe('done');
    expect((await store.get(second.id))?.status).toBe('queued');
    expect((await store.stats()).workersAlive).toBe(0);
  });

  it('мягкая остановка ограничена по времени', async () => {
    const { execute } = controlled();
    await store.create(newJob());
    const w = makeWorker(execute, { drainMs: 20 });
    await w.fill();
    expect(await w.stop()).toEqual({ drained: false });
  });

  it('потерявший аренду воркер не завершает задание, его берёт другой', async () => {
    const { runs, execute } = controlled();
    const job = await store.create(newJob());
    const a = makeWorker(execute, { concurrency: 1 });
    await a.fill();
    clock += 5 * 60_000;
    const b = makeWorker(execute, { concurrency: 1 });
    await b.reap();
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    await a.heartbeat();
    expect(runs[0].io.cancelled()).toBe(true);
    runs[0].finish(done());
    await vi.waitFor(() => expect(a.running()).toBe(0));
    expect(await store.get(job.id)).toMatchObject({ status: 'running', attempts: 2 });
    expect((await store.events(job.id, 0)).map((e) => e.event))
      .toEqual([{ type: 'warning', message: REQUEUE_WARNING }]);
  });

  it('уборщик зовёт дополнительную уборку', async () => {
    const onReap = vi.fn(async () => {});
    await makeWorker(async () => done(), { onReap }).reap();
    expect(onReap).toHaveBeenCalledTimes(1);
  });

  it('повтор после потери завершает сохранённое задание без второй генерации', async () => {
    const simId = crypto.randomUUID();
    let generations = 0;
    const deps: ExecuteDeps = {
      makeCtx: () => ({}) as Ctx,
      runPipeline: async (_ctx, input) => {
        generations++;
        await input.onSaved?.(simId);
        return new Promise<never>(() => {});   // воркер «завис» после сохранения
      },
      refineExisting: async () => {},
    };
    const execute: Execute = (job, io) => executeJob(job, io, deps);
    const job = await store.create(newJob());
    await makeWorker(execute).fill();
    await vi.waitFor(async () => expect((await store.get(job.id))?.simulationId).toBe(simId));
    clock += 5 * 60_000;
    await makeWorker(execute).reap();
    await vi.waitFor(async () => expect((await store.get(job.id))?.status).toBe('done'));
    expect(generations).toBe(1);
    expect((await store.get(job.id))?.simulationId).toBe(simId);
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

```bash
npx vitest run tests/unit/worker.test.ts tests/unit/worker-execute.test.ts
```

Ожидается: FAIL — нет модулей `@/lib/worker/worker` и `@/lib/worker/execute`.

- [ ] **Step 4: Написать выполнение**

`src/lib/worker/execute.ts`:

```ts
import type { ClaimedJob, GenerateRequest, JobOutcome, RefineRequest } from '../jobs/store';
import { needsRun } from '../jobs/policy';
import { makeCtx, runPipeline, refineExisting, CancelledError } from '../pipeline/run';
import type { JobIO } from './worker';

export interface ExecuteDeps {
  makeCtx: typeof makeCtx;
  runPipeline: typeof runPipeline;
  refineExisting: typeof refineExisting;
}

const DEFAULT_DEPS: ExecuteDeps = { makeCtx, runPipeline, refineExisting };

/**
 * Одно задание от начала до исхода. Не бросает: отмена и любые сбои становятся исходом,
 * который воркер запишет в базу одной транзакцией.
 */
export async function executeJob(
  job: ClaimedJob, io: JobIO, deps: ExecuteDeps = DEFAULT_DEPS,
): Promise<JobOutcome> {
  if (!needsRun(job)) {
    // Прошлая попытка успела сохранить результат и потеряла воркер до завершения.
    return { status: 'done', simulationId: job.simulationId! };
  }
  try {
    const ctx = deps.makeCtx(io.emit);
    if (job.kind === 'refine') {
      const target = job.targetSimulationId;
      if (!target) return { status: 'error', message: 'У задания доработки не указана симуляция.' };
      const { instruction } = job.request as RefineRequest;
      await deps.refineExisting(ctx, job.ownerId, target, instruction,
        { signal: io.cancelled, onSaved: io.markSaved });
      return { status: 'done', simulationId: target };
    }
    const req = job.request as GenerateRequest;
    const meta = await deps.runPipeline(ctx, {
      ownerId: job.ownerId,
      prompt: req.prompt,
      mode: req.mode,
      imageDataUrl: job.imageDataUrl ?? undefined,
      onSaved: io.markSaved,
    }, io.cancelled);
    return { status: 'done', simulationId: meta.id };
  } catch (e) {
    if (e instanceof CancelledError) return { status: 'cancelled' };
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 5: Написать цикл воркера**

`src/lib/worker/worker.ts`:

```ts
import os from 'node:os';
import crypto from 'node:crypto';
import type { PipelineEvent } from '../types';
import type { ClaimedJob, JobOutcome, JobStore } from '../jobs/store';

export interface JobIO {
  emit(event: PipelineEvent): void;
  cancelled(): boolean;
  markSaved(simulationId: string): Promise<void>;
}

export type Execute = (job: ClaimedJob, io: JobIO) => Promise<JobOutcome>;

export interface WorkerOptions {
  store: JobStore;
  execute: Execute;
  concurrency: number;
  drainMs: number;
  id?: string;
  host?: string;
  pollMs?: number;
  heartbeatMs?: number;
  reapMs?: number;
  onReap?: () => Promise<void>;
  log?: (msg: string, err?: unknown) => void;
}

export interface Worker {
  readonly id: string;
  start(): void;
  fill(): Promise<void>;
  heartbeat(): Promise<void>;
  reap(): Promise<void>;
  stop(): Promise<{ drained: boolean }>;
  running(): number;
  /** Для тестов: ждёт, пока доделаются все задания, взятые на этот момент и позже. */
  idle(): Promise<void>;
}

interface Slot {
  cancel: boolean;
  /** Аренду забрал уборщик: результат этой попытки никуда не пишется. */
  lost: boolean;
  done: Promise<void>;
}

export function makeWorkerId(host: string = os.hostname()): string {
  return `${host}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;
}

function defaultLog(msg: string, err?: unknown): void {
  if (err === undefined) console.log(msg);
  else console.error(msg, err);
}

export function createWorker(opts: WorkerOptions): Worker {
  const host = opts.host ?? os.hostname();
  const id = opts.id ?? makeWorkerId(host);
  const log = opts.log ?? defaultLog;
  const slots = new Map<string, Slot>();
  let stopping = false;
  let filling: Promise<void> | null = null;
  let fillAgain = false;
  let pollTimer: NodeJS.Timeout | undefined;
  let reapTimer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let unsubscribeQueue: (() => void) | null = null;

  async function runSlot(job: ClaimedJob, slot: Slot): Promise<void> {
    // Записи событий идут цепочкой: emit синхронный, а порядок seq обязан совпасть
    // с порядком вызовов.
    let chain: Promise<unknown> = Promise.resolve();
    const io: JobIO = {
      emit(event) {
        // done пишет только finish — в одной транзакции со статусом.
        if (event.type === 'done') return;
        chain = chain
          .then(() => opts.store.appendEvent(job.id, event, id))
          .catch((e) => log(`Не удалось записать событие задания ${job.id}:`, e));
      },
      cancelled: () => slot.cancel || slot.lost,
      markSaved: (simulationId) => opts.store.markSaved(job.id, id, simulationId),
    };
    let outcome: JobOutcome;
    try {
      outcome = await opts.execute(job, io);
    } catch (e) {
      outcome = { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    await chain;
    if (slot.lost) {
      log(`Задание ${job.id}: аренду забрал уборщик, результат попытки не записан.`);
      return;
    }
    try {
      const ok = await opts.store.finish(job.id, id, outcome);
      if (!ok) log(`Задание ${job.id} уже не принадлежит воркеру ${id}.`);
    } catch (e) {
      // Задание останется running; уборщик вернёт его, а повтор увидит simulation_id.
      log(`Не удалось завершить задание ${job.id}:`, e);
    }
  }

  async function fillOnce(): Promise<void> {
    while (!stopping && slots.size < opts.concurrency) {
      let job: ClaimedJob | null;
      try {
        job = await opts.store.claim(id);
      } catch (e) {
        log('Не удалось взять задание из очереди:', e);
        return;
      }
      if (!job) return;
      const claimed = job;
      const slot: Slot = { cancel: claimed.cancelRequested, lost: false, done: Promise.resolve() };
      slots.set(claimed.id, slot);
      log(`Воркер ${id} взял задание ${claimed.id} (${claimed.kind}, попытка ${claimed.attempts}).`);
      slot.done = runSlot(claimed, slot).finally(() => {
        slots.delete(claimed.id);
        void fill();
      });
    }
  }

  function fill(): Promise<void> {
    if (filling) {
      fillAgain = true;
      return filling;
    }
    filling = (async () => {
      do {
        fillAgain = false;
        await fillOnce();
      } while (fillAgain && !stopping);
    })().finally(() => { filling = null; });
    return filling;
  }

  async function heartbeat(): Promise<void> {
    // Задания, взятые после снимка, могли не попасть в UPDATE — их не считаем потерянными.
    const known = [...slots.keys()];
    try {
      const { leased, cancelRequested } = await opts.store.heartbeat(id, host, slots.size);
      const leasedSet = new Set(leased);
      for (const jobId of cancelRequested) {
        const s = slots.get(jobId);
        if (s) s.cancel = true;
      }
      for (const jobId of known) {
        const s = slots.get(jobId);
        if (s && !leasedSet.has(jobId)) s.lost = true;
      }
    } catch (e) {
      log('Сердцебиение воркера не прошло:', e);
    }
  }

  async function reap(): Promise<void> {
    try {
      const reaped = await opts.store.reap();
      for (const r of reaped) log(`Уборщик: задание ${r.id} — ${r.decision}.`);
      if (reaped.some((r) => r.decision === 'requeue')) void fill();
      await opts.onReap?.();
    } catch (e) {
      log('Уборщик не отработал:', e);
    }
  }

  return {
    id,
    start() {
      unsubscribeQueue = opts.store.subscribeQueue(() => { void fill(); });
      pollTimer = setInterval(() => { void fill(); }, opts.pollMs ?? 5000);
      heartbeatTimer = setInterval(() => { void heartbeat(); }, opts.heartbeatMs ?? 15000);
      reapTimer = setInterval(() => { void reap(); }, opts.reapMs ?? 30000);
      void heartbeat();
      void fill();
    },
    fill,
    heartbeat,
    reap,
    async stop() {
      stopping = true;
      unsubscribeQueue?.();
      clearInterval(pollTimer);
      clearInterval(reapTimer);
      // Сердцебиение продолжается весь срок ожидания: иначе аренды истекут,
      // и другой воркер начнёт те же задания заново.
      const all = (async () => {
        while (slots.size > 0) await Promise.all([...slots.values()].map((s) => s.done));
      })();
      let timer: NodeJS.Timeout | undefined;
      const drained = await Promise.race([
        all.then(() => true),
        new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), opts.drainMs); }),
      ]);
      clearTimeout(timer);
      clearInterval(heartbeatTimer);
      await opts.store.retireWorker(id).catch((e) => log('Не удалось снять запись воркера:', e));
      return { drained };
    },
    running: () => slots.size,
    async idle() {
      while (slots.size > 0 || filling) {
        await Promise.all([...slots.values()].map((s) => s.done));
        await filling;
      }
    },
  };
}
```

- [ ] **Step 6: Прогнать тесты**

```bash
npx vitest run tests/unit/worker.test.ts tests/unit/worker-execute.test.ts
npm test && npx tsc --noEmit
```

Ожидается: PASS.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/worker tests/unit/worker.test.ts tests/unit/worker-execute.test.ts
git commit -m "feat(worker): захват по слотам, сердцебиение, уборщик и мягкая остановка

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Лимиты входа в базе и доверие к прокси

**Files:**
- Create: `src/lib/auth/client-ip.ts`, `tests/unit/client-ip.test.ts`, `tests/integration/login-attempts.test.ts`
- Modify: `src/lib/auth/rate-limit.ts`, `src/app/api/auth/login/route.ts`, `tests/unit/rate-limit.test.ts`, `tests/integration/login-limit.test.ts`, `tests/integration/auth-api.test.ts`

**Interfaces:**
- Consumes: из цикла 0 — пороги `IDENTIFIER_LIMIT`, `UNKNOWN_IP_LIMIT`, `IP_LIMIT` и правило трёх счётчиков; `db()`, `hasDb()`.
- Produces (те же имена, что в цикле 0, теперь асинхронные):
  - `isLimited(key: string, max?: number): Promise<boolean>`;
  - `recordFailure(key: string): Promise<void>`;
  - `isLoginBlocked(ip: string, identifier: string | null): Promise<boolean>`;
  - `recordLoginFailure(ip: string, identifier: string | null, accountExists: boolean): Promise<void>`;
  - `__resetAttemptsForTests(): void`.
- Produces (новое):
  - `purgeOldAttempts(): Promise<number>` — удаляет попытки старше суток;
  - `interface AttemptStore { count(key: string): Promise<number>; add(key: string): Promise<void>; purge(): Promise<number> }`;
  - `createMemoryAttemptStore(now?: () => number): AttemptStore`, `createPgAttemptStore(): AttemptStore`;
  - `__setAttemptStoreForTests(store: AttemptStore | null): void`;
  - `clientIp(req: Request, env?: NodeJS.ProcessEnv): string` — последний адрес из `x-forwarded-for` при `SHOWMEHOW_TRUST_PROXY=1`, иначе `'direct'`.

**Адрес сокета.** Спецификация просит без `SHOWMEHOW_TRUST_PROXY` брать адрес сокета. Но обработчики App Router в Next 15 его не получают (`req.ip` убран). Поэтому без доверенного прокси все запросы делят один ключ `'direct'`, а каждый аккаунт по-прежнему защищает счётчик по идентификатору. На боевом сервере `SHOWMEHOW_TRUST_PROXY=1` ставится вместе с Caddy (задача 16). Из `x-forwarded-for` берётся **последний** адрес: его дописал наш прокси, а первые клиент может подставить сам.

- [ ] **Step 1: Написать падающие тесты**

`tests/unit/client-ip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clientIp } from '@/lib/auth/client-ip';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const req = (xff?: string) =>
  new Request('http://t/api/auth/login', { headers: xff ? { 'x-forwarded-for': xff } : {} });

describe('clientIp', () => {
  it('без доверенного прокси заголовку не верит', () => {
    expect(clientIp(req('6.6.6.6'), env({}))).toBe('direct');
    expect(clientIp(req('6.6.6.6'), env({ SHOWMEHOW_TRUST_PROXY: '0' }))).toBe('direct');
  });

  it('за прокси берёт адрес, который дописал прокси', () => {
    const trusted = env({ SHOWMEHOW_TRUST_PROXY: '1' });
    expect(clientIp(req('1.2.3.4'), trusted)).toBe('1.2.3.4');
    expect(clientIp(req('6.6.6.6, 1.2.3.4'), trusted)).toBe('1.2.3.4');
    expect(clientIp(req(' 6.6.6.6 ,1.2.3.4 '), trusted)).toBe('1.2.3.4');
  });

  it('за прокси без заголовка — общий ключ', () => {
    expect(clientIp(req(), env({ SHOWMEHOW_TRUST_PROXY: '1' }))).toBe('direct');
  });
});
```

`tests/unit/rate-limit.test.ts` (версия цикла 0). Каждый `it` сделать `async`, перед каждым вызовом `isLimited`, `recordFailure`, `isLoginBlocked` и `recordLoginFailure` поставить `await`. Внутри циклов вызовы остаются последовательными. Пример:

```ts
  it('после 10 неверных паролей к одному аккаунту 11-я попытка блокируется с любого IP', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(`10.0.0.${i}`, 'ivanov', true);
    expect(await isLoginBlocked('10.0.0.99', 'ivanov')).toBe(true);
    expect(await isLoginBlocked('10.0.0.99', 'petrov')).toBe(false);
  });
```

Дописать в конец файла (новые имена добавить в импорт из `@/lib/auth/rate-limit`):

```ts
describe('хранилище попыток в памяти', () => {
  it('окно в пятнадцать минут и уборка старше суток', async () => {
    let t = 0;
    __setAttemptStoreForTests(createMemoryAttemptStore(() => t));
    try {
      for (let i = 0; i < 10; i++) await recordLoginFailure('10.0.0.1', 'ivanov', true);
      expect(await isLoginBlocked('10.0.0.2', 'ivanov')).toBe(true);
      t += 15 * 60_000;
      expect(await isLoginBlocked('10.0.0.2', 'ivanov')).toBe(false);
      expect(await purgeOldAttempts()).toBe(0);
      t += 24 * 60 * 60_000;
      // Десять попыток по идентификатору и десять по IP «все».
      expect(await purgeOldAttempts()).toBe(20);
    } finally {
      __setAttemptStoreForTests(null);
    }
  });
});
```

`tests/integration/login-attempts.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import {
  isLoginBlocked, recordLoginFailure, purgeOldAttempts, __resetAttemptsForTests,
} from '@/lib/auth/rate-limit';

const SCHEMA = 'login_attempts_test';
const pool = testDb(SCHEMA);
const IP = '203.0.113.30';

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('DELETE FROM login_attempts');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

// Те же правила, что юниты цикла 0, но счётчики лежат в базе и общие для всех процессов.
describe.skipIf(!pool)('лимиты входа в базе', () => {
  it('тридцать неудач по разным аккаунтам с одного IP не закрывают вход', async () => {
    for (let i = 0; i < 30; i++) await recordLoginFailure(IP, `ученик${i}`, true);
    expect(await isLoginBlocked(IP, 'ученик31')).toBe(false);
    expect(await isLoginBlocked(IP, 'ученик0')).toBe(false);
  });

  it('после пятидесяти входов в несуществующие аккаунты IP закрыт', async () => {
    for (let i = 0; i < 49; i++) await recordLoginFailure(IP, `ghost${i}`, false);
    expect(await isLoginBlocked(IP, 'real')).toBe(false);
    await recordLoginFailure(IP, 'ghost49', false);
    expect(await isLoginBlocked(IP, 'real')).toBe(true);
    expect(await isLoginBlocked('198.51.100.1', 'real')).toBe(false);
  });

  it('после десяти неверных паролей аккаунт закрыт с любого IP', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(`10.0.0.${i}`, 'ivanov', true);
    expect(await isLoginBlocked('10.0.0.99', 'ivanov')).toBe(true);
    expect(await isLoginBlocked('10.0.0.99', 'petrov')).toBe(false);
  });

  it('счётчики видит другой экземпляр модуля: сброс памяти их не обнуляет', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(IP, 'shared', true);
    __resetAttemptsForTests();
    expect(await isLoginBlocked(IP, 'shared')).toBe(true);
  });

  it('старые попытки не считаются и удаляются уборщиком', async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure(IP, 'old', true);
    await pool!.query("UPDATE login_attempts SET at = now() - interval '16 minutes'");
    expect(await isLoginBlocked(IP, 'old')).toBe(false);
    expect(await purgeOldAttempts()).toBe(0);
    await pool!.query("UPDATE login_attempts SET at = now() - interval '2 days'");
    expect(await purgeOldAttempts()).toBe(20);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
npx vitest run tests/unit/client-ip.test.ts tests/unit/rate-limit.test.ts
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow \
  npx vitest run tests/integration/login-attempts.test.ts
```

Ожидается: FAIL — нет `client-ip`, `purgeOldAttempts` и хранилища попыток; в интеграционном тесте счётчики пока в памяти, поэтому тест про сброс памяти падает.

- [ ] **Step 3: Перевести счётчики в базу**

`src/lib/auth/rate-limit.ts` целиком. Пороги, ключи и правило «исчерпанный IP закрывает и верные входы» — дословно из цикла 0; меняется только хранилище.

```ts
import { db, hasDb } from '../db/client';

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Неверный пароль к одному существующему аккаунту. */
export const IDENTIFIER_LIMIT = 10;
/** Входы в несуществующие аккаунты с одного IP — перебор логинов. */
export const UNKNOWN_IP_LIMIT = 50;
/**
 * Любые неудачи с одного IP. Школа выходит в интернет через один адрес, поэтому
 * порог высокий: класс с опечатками до него не доходит.
 */
export const IP_LIMIT = 300;

export interface AttemptStore {
  /** Неудачи по ключу за последние пятнадцать минут. */
  count(key: string): Promise<number>;
  add(key: string): Promise<void>;
  /** Удаляет попытки старше суток; возвращает число удалённых. */
  purge(): Promise<number>;
}

export function createMemoryAttemptStore(now: () => number = Date.now): AttemptStore {
  const attempts = new Map<string, number[]>();
  return {
    async count(key) {
      const t = now();
      return (attempts.get(key) ?? []).filter((at) => t - at < WINDOW_MS).length;
    },
    async add(key) {
      attempts.set(key, [...(attempts.get(key) ?? []), now()]);
    },
    async purge() {
      const t = now();
      let removed = 0;
      for (const [key, list] of attempts) {
        const fresh = list.filter((at) => t - at < DAY_MS);
        removed += list.length - fresh.length;
        if (fresh.length) attempts.set(key, fresh);
        else attempts.delete(key);
      }
      return removed;
    },
  };
}

/**
 * Счётчики в базе: их видят все экземпляры веба, и рестарт их не обнуляет.
 * Строки старше суток удаляет уборщик воркера.
 */
export function createPgAttemptStore(): AttemptStore {
  return {
    async count(key) {
      const { rows } = await db().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM login_attempts
         WHERE key = $1 AND at > now() - interval '${WINDOW_MINUTES} minutes'`, [key]);
      return rows[0].n;
    },
    async add(key) {
      await db().query('INSERT INTO login_attempts (key) VALUES ($1)', [key]);
    },
    async purge() {
      const r = await db().query("DELETE FROM login_attempts WHERE at < now() - interval '1 day'");
      return r.rowCount ?? 0;
    },
  };
}

let override: AttemptStore | null = null;
let memory: AttemptStore | null = null;
let pg: AttemptStore | null = null;

function attempts(): AttemptStore {
  if (override) return override;
  if (hasDb()) return (pg ??= createPgAttemptStore());
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL не задан: в продакшне лимиты входа без базы данных запрещены');
  }
  return (memory ??= createMemoryAttemptStore());
}

/** Проверка БЕЗ расхода попытки. */
export async function isLimited(key: string, max: number = IDENTIFIER_LIMIT): Promise<boolean> {
  return (await attempts().count(key)) >= max;
}

/** Расходует одну попытку. Успешный вход лимит не трогает. */
export async function recordFailure(key: string): Promise<void> {
  await attempts().add(key);
}

const idKey = (identifier: string) => `id:${identifier}`;
const ipUnknownKey = (ip: string) => `ip-unknown:${ip}`;
const ipAllKey = (ip: string) => `ip-all:${ip}`;

/**
 * Вход закрыт, если исчерпан счётчик идентификатора или любой счётчик IP.
 * Исчерпанный IP закрывает и верные входы: иначе перебор одного частого пароля
 * по списку логинов продолжал бы находить совпадения (неудачи — 429, успехи — 200).
 */
export async function isLoginBlocked(ip: string, identifier: string | null): Promise<boolean> {
  const checks = [
    isLimited(ipAllKey(ip), IP_LIMIT),
    isLimited(ipUnknownKey(ip), UNKNOWN_IP_LIMIT),
    ...(identifier !== null ? [isLimited(idKey(identifier), IDENTIFIER_LIMIT)] : []),
  ];
  return (await Promise.all(checks)).some(Boolean);
}

/**
 * accountExists сообщает только вызывающий роут; клиент видит одинаковый 401
 * в обоих случаях, поэтому разделение счётчиков оракула не создаёт.
 */
export async function recordLoginFailure(
  ip: string, identifier: string | null, accountExists: boolean,
): Promise<void> {
  await recordFailure(ipAllKey(ip));
  if (accountExists && identifier !== null) await recordFailure(idKey(identifier));
  else await recordFailure(ipUnknownKey(ip));
}

export async function purgeOldAttempts(): Promise<number> {
  return attempts().purge();
}

export function __setAttemptStoreForTests(store: AttemptStore | null): void {
  override = store;
}

/** Сбрасывает счётчики в памяти. Строки в базе тесты чистят сами: DELETE FROM login_attempts. */
export function __resetAttemptsForTests(): void {
  override = null;
  memory = null;
  pg = null;
}
```

`src/lib/auth/client-ip.ts`:

```ts
/**
 * Адрес клиента для лимитов входа. x-forwarded-for подделывается как угодно, поэтому
 * ему верим только за своим прокси (SHOWMEHOW_TRUST_PROXY=1) и берём последний адрес —
 * тот, что дописал прокси. Адреса сокета обработчики App Router не получают, так что
 * без прокси все запросы делят один ключ.
 */
export function clientIp(req: Request, env: NodeJS.ProcessEnv = process.env): string {
  if (env.SHOWMEHOW_TRUST_PROXY === '1') {
    const parts = (req.headers.get('x-forwarded-for') ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts.at(-1);
    if (last) return last;
  }
  return 'direct';
}
```

- [ ] **Step 4: Перевести роут входа**

В `src/app/api/auth/login/route.ts` (версия цикла 0):

1. Строку вычисления `ip` из `x-forwarded-for` заменить на

```ts
  const ip = clientIp(req);
```

   и добавить импорт `import { clientIp } from '@/lib/auth/client-ip';`.
2. Проверка лимита и неудача:

```ts
  // Лимит проверяем ДО обращения к базе и не расходуем на самой проверке.
  if (await isLoginBlocked(ip, key)) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }

  const fail = async (accountExists: boolean) => {
    await recordLoginFailure(ip, key, accountExists);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  };

  if (key === null || !password) return fail(false);
```

   Остальные `return fail(...)` остаются как есть: обработчик асинхронный и дождётся промиса. Выравнивание времени, 403 для заблокированного и одинаковый 401 не меняются.

- [ ] **Step 5: Поправить интеграционные тесты входа цикла 0**

Счётчики теперь в базе, и `__resetAttemptsForTests()` их не обнуляет.

- `tests/integration/login-limit.test.ts`, в `beforeEach` после `TRUNCATE`:

```ts
  await pool.query('DELETE FROM login_attempts');
```

   и в начало файла, после `const SCHOOL_IP = ...`:

```ts
// Тест различает клиентов по x-forwarded-for — так приложение работает за Caddy.
process.env.SHOWMEHOW_TRUST_PROXY = '1';
```

- `tests/integration/auth-api.test.ts`: в SQL очистки `beforeEach` добавить `DELETE FROM login_attempts;`, а в начало файла — ту же строку `process.env.SHOWMEHOW_TRUST_PROXY = '1';` с тем же комментарием.

Проверить, что других мест нет:

```bash
grep -rln "__resetAttemptsForTests\|x-forwarded-for" tests
```

Каждый найденный интеграционный файл должен очищать `login_attempts`.

- [ ] **Step 6: Прогнать тесты**

```bash
npx vitest run tests/unit/client-ip.test.ts tests/unit/rate-limit.test.ts
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npm test
npm test && npx tsc --noEmit
```

Ожидается: PASS; весь набор с базой зелёный, включая `login-limit` и `auth-api` цикла 0.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/auth/rate-limit.ts src/lib/auth/client-ip.ts src/app/api/auth/login/route.ts \
  tests/unit/client-ip.test.ts tests/unit/rate-limit.test.ts tests/integration/login-attempts.test.ts \
  tests/integration/login-limit.test.ts tests/integration/auth-api.test.ts
git commit -m "feat(auth): лимиты входа в базе и доверие к x-forwarded-for только за прокси

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Запуск воркера — служба, встроенный воркер, Docker

**Files:**
- Create: `src/lib/worker/config.ts`, `src/lib/worker/boot.ts`, `src/lib/worker/embedded.ts`, `scripts/worker.ts`, `tests/unit/worker-config.test.ts`, `tests/unit/embedded-worker.test.ts`

`src/instrumentation.ts` появляется только в задаче 9, вместе с переключением роутов. Иначе встроенный воркер в dev мог бы взять строку `queued`, которую старый код уже ведёт в памяти, и одна генерация пошла бы дважды.
- Modify: `package.json`, `docker-compose.yml`

**Interfaces:**
- Consumes: `createWorker` из `worker.ts`; `executeJob` из `execute.ts`; `getJobStore` из `jobs/current.ts`; `purgeOldAttempts` из `auth/rate-limit.ts`; `closeBrowser` из `renderer.ts`; `closeListener` из `jobs/listener.ts`; `closeDb` из `db/client.ts`.
- Produces:
  - `workerConcurrency(env?: NodeJS.ProcessEnv): number` — `WORKER_CONCURRENCY`, по умолчанию 2, от 1 до 16;
  - `drainSeconds(env?: NodeJS.ProcessEnv): number` — `WORKER_DRAIN_SECONDS`, по умолчанию 600, от 0 до 3600;
  - `embeddedWorkerEnabled(env?: NodeJS.ProcessEnv): boolean` — `SHOWMEHOW_EMBEDDED_WORKER=1|0`; без неё включён только при `NODE_ENV=development`; во время `next build` выключен всегда;
  - `bootWorker(env?: NodeJS.ProcessEnv): Worker`, `shutdownWorker(worker: Worker): Promise<void>`;
  - `startEmbeddedWorker(env?: NodeJS.ProcessEnv): Worker | null`, `__resetEmbeddedForTests(): void`;
  - npm-скрипт `worker`.

- [ ] **Step 1: Написать падающие тесты**

`tests/unit/worker-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { workerConcurrency, drainSeconds, embeddedWorkerEnabled } from '@/lib/worker/config';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('настройки воркера', () => {
  it('слоты: по умолчанию два, число из окружения, мусор — ошибка', () => {
    expect(workerConcurrency(env({}))).toBe(2);
    expect(workerConcurrency(env({ WORKER_CONCURRENCY: '4' }))).toBe(4);
    expect(() => workerConcurrency(env({ WORKER_CONCURRENCY: '0' }))).toThrow(/WORKER_CONCURRENCY/);
    expect(() => workerConcurrency(env({ WORKER_CONCURRENCY: 'два' }))).toThrow(/WORKER_CONCURRENCY/);
  });

  it('ожидание при остановке: по умолчанию десять минут', () => {
    expect(drainSeconds(env({}))).toBe(600);
    expect(drainSeconds(env({ WORKER_DRAIN_SECONDS: '0' }))).toBe(0);
    expect(() => drainSeconds(env({ WORKER_DRAIN_SECONDS: '-1' }))).toThrow(/WORKER_DRAIN_SECONDS/);
  });

  it('встроенный воркер: в dev включён, в продакшне выключен, переменная решает', () => {
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'development' }))).toBe(true);
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'production' }))).toBe(false);
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'development', SHOWMEHOW_EMBEDDED_WORKER: '0' }))).toBe(false);
    expect(embeddedWorkerEnabled(env({ NODE_ENV: 'production', SHOWMEHOW_EMBEDDED_WORKER: '1' }))).toBe(true);
  });

  it('во время сборки встроенный воркер не запускается', () => {
    expect(embeddedWorkerEnabled(env({
      NODE_ENV: 'production', SHOWMEHOW_EMBEDDED_WORKER: '1', NEXT_PHASE: 'phase-production-build',
    }))).toBe(false);
  });
});
```

`tests/unit/embedded-worker.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const boot = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/worker/boot', () => ({
  bootWorker: vi.fn(() => {
    boot.calls++;
    return { id: `w${boot.calls}` };
  }),
}));

import { startEmbeddedWorker, __resetEmbeddedForTests } from '@/lib/worker/embedded';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

beforeEach(() => {
  boot.calls = 0;
  __resetEmbeddedForTests();
});

describe('встроенный воркер', () => {
  it('в dev запускается один раз на процесс', () => {
    const first = startEmbeddedWorker(env({ NODE_ENV: 'development' }));
    const second = startEmbeddedWorker(env({ NODE_ENV: 'development' }));
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(boot.calls).toBe(1);
  });

  it('выключенный не запускается', () => {
    expect(startEmbeddedWorker(env({ NODE_ENV: 'development', SHOWMEHOW_EMBEDDED_WORKER: '0' }))).toBeNull();
    expect(startEmbeddedWorker(env({ NODE_ENV: 'production' }))).toBeNull();
    expect(boot.calls).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
npx vitest run tests/unit/worker-config.test.ts tests/unit/embedded-worker.test.ts
```

Ожидается: FAIL — нет модулей `config` и `embedded`.

- [ ] **Step 3: Написать настройки**

`src/lib/worker/config.ts`:

```ts
function intFromEnv(
  env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Переменная ${name}=${raw}: ожидается целое число от ${min} до ${max}.`);
  }
  return n;
}

/** Сколько генераций один воркер ведёт одновременно. Каждая — это Chromium. */
export function workerConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  return intFromEnv(env, 'WORKER_CONCURRENCY', 2, 1, 16);
}

/** Сколько воркер ждёт текущие задания после SIGTERM. systemd ждёт на минуту дольше. */
export function drainSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return intFromEnv(env, 'WORKER_DRAIN_SECONDS', 600, 0, 3600);
}

/**
 * Встроенный воркер нужен в `npm run dev`: там нет отдельной службы. В продакшне его
 * включают только явно, а во время `next build` не запускают никогда.
 */
export function embeddedWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  if (env.SHOWMEHOW_EMBEDDED_WORKER === '1') return true;
  if (env.SHOWMEHOW_EMBEDDED_WORKER === '0') return false;
  return env.NODE_ENV === 'development';
}
```

- [ ] **Step 4: Написать сборку воркера, встроенный запуск и точку входа**

`src/lib/worker/boot.ts`:

```ts
import { getJobStore } from '../jobs/current';
import { purgeOldAttempts } from '../auth/rate-limit';
import { closeBrowser } from '../renderer';
import { createWorker, type Worker } from './worker';
import { executeJob } from './execute';
import { drainSeconds, workerConcurrency } from './config';

export function bootWorker(env: NodeJS.ProcessEnv = process.env): Worker {
  const concurrency = workerConcurrency(env);
  const worker = createWorker({
    store: getJobStore(),
    execute: executeJob,
    concurrency,
    drainMs: drainSeconds(env) * 1000,
    // Уборщик воркера заодно чистит старые попытки входа: отдельного планировщика нет.
    onReap: async () => { await purgeOldAttempts(); },
  });
  worker.start();
  console.log(`Воркер ${worker.id} запущен, слотов: ${concurrency}.`);
  return worker;
}

export async function shutdownWorker(worker: Worker): Promise<void> {
  const { drained } = await worker.stop();
  console.log(drained
    ? `Воркер ${worker.id} остановлен: все задания доделаны.`
    : `Воркер ${worker.id} остановлен по таймауту: недоделанные задания подберёт уборщик.`);
  await closeBrowser();
}
```

`src/lib/worker/embedded.ts`:

```ts
import { embeddedWorkerEnabled } from './config';
import { bootWorker } from './boot';
import type { Worker } from './worker';

// next dev может загрузить модуль несколько раз; воркер на процесс нужен один.
const KEY = Symbol.for('tesseract.embeddedWorker');

function slot(): Record<symbol, Worker | undefined> {
  return globalThis as unknown as Record<symbol, Worker | undefined>;
}

export function startEmbeddedWorker(env: NodeJS.ProcessEnv = process.env): Worker | null {
  if (!embeddedWorkerEnabled(env)) return null;
  const g = slot();
  g[KEY] ??= bootWorker(env);
  return g[KEY]!;
}

export function __resetEmbeddedForTests(): void {
  delete slot()[KEY];
}
```

`scripts/worker.ts`:

```ts
import fs from 'node:fs';

/**
 * Точка входа службы teseract-worker. Запуск: `npm run worker` локально,
 * `node --import tsx scripts/worker.ts` в systemd и Docker — так SIGTERM приходит
 * прямо в этот процесс.
 */
async function main(): Promise<void> {
  // Служба получает переменные из EnvironmentFile; локально удобнее прочитать .env.local.
  if (fs.existsSync('.env.local') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env.local');
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан: воркеру нужна база данных.');
    process.exit(1);
  }
  const { bootWorker, shutdownWorker } = await import('../src/lib/worker/boot');
  const { closeListener } = await import('../src/lib/jobs/listener');
  const { closeDb } = await import('../src/lib/db/client');

  const worker = bootWorker();
  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(`Получен ${signal}: новые задания не берём, доделываем текущие.`);
    shutdownWorker(worker)
      .then(() => Promise.all([closeListener(), closeDb()]))
      .then(() => process.exit(0), (e) => {
        console.error('Воркер остановился с ошибкой:', e);
        process.exit(1);
      });
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

main().catch((e) => {
  console.error('Воркер не запустился:', e);
  process.exit(1);
});
```

`package.json`, в `scripts` после `"migrate:data"`:

```json
    "worker": "tsx scripts/worker.ts",
```

- [ ] **Step 5: Добавить воркер в Docker**

`docker-compose.yml` целиком:

```yaml
x-app-env: &app-env
  DATABASE_URL: postgres://showmehow:${POSTGRES_PASSWORD:-showmehow}@db:5432/showmehow
  SHOWMEHOW_API_KEY: ${SHOWMEHOW_API_KEY}
  SHOWMEHOW_MODEL: ${SHOWMEHOW_MODEL}
  SHOWMEHOW_BASE_URL: ${SHOWMEHOW_BASE_URL:-https://api.openai.com/v1}
  SHOWMEHOW_VISION_MODEL: ${SHOWMEHOW_VISION_MODEL:-}
  SHOWMEHOW_ADMIN_EMAIL: ${SHOWMEHOW_ADMIN_EMAIL:-}

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
      <<: *app-env
      SHOWMEHOW_EMBEDDED_WORKER: "0"
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data

  # Тот же образ, другой процесс. Миграции прогоняет app при старте; пока их нет,
  # воркер пишет ошибку захвата и повторяет попытку каждые пять секунд.
  worker:
    build: .
    command: ["node", "--import", "tsx", "scripts/worker.ts"]
    depends_on:
      app:
        condition: service_started
    environment:
      <<: *app-env
      WORKER_CONCURRENCY: ${WORKER_CONCURRENCY:-2}
      WORKER_DRAIN_SECONDS: ${WORKER_DRAIN_SECONDS:-600}
    volumes:
      - ./data:/app/data
    stop_grace_period: 11m

volumes:
  pgdata:
```

- [ ] **Step 6: Прогнать тесты и проверить запуск**

```bash
npx vitest run tests/unit/worker-config.test.ts tests/unit/embedded-worker.test.ts
npm test && npx tsc --noEmit
docker compose config --quiet
```

Ожидается: PASS; `docker compose config` без ошибок.

Ручная проверка с локальной базой, пока dev-сервер не запущен (роуты ещё старые, и воркер не должен видеть их задания):

```bash
npm run worker
```

Ожидается: строка «Воркер … запущен, слотов: 2.»; `Ctrl+C` печатает «Получен SIGINT…» и «…все задания доделаны.», процесс выходит с кодом 0.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/worker scripts/worker.ts package.json docker-compose.yml tests/unit/worker-config.test.ts tests/unit/embedded-worker.test.ts
git commit -m "feat(worker): служба воркера, встроенный воркер в dev и сервис в Docker

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: Роуты заданий на хранилище и встроенный воркер

**Files:**
- Create: `src/instrumentation.ts`, `tests/integration/jobs-routes.test.ts`
- Modify: `src/app/api/generate/route.ts`, `src/app/api/jobs/[id]/route.ts`, `src/app/api/jobs/[id]/cancel/route.ts`, `src/app/api/jobs/[id]/stream/route.ts`, `src/lib/quota.ts`, `tests/unit/jobs-api.test.ts`, `tests/integration/quota.test.ts`

Роуты переключаются одним коммитом: генерация, чтение, отмена и поток должны смотреть в одно хранилище. С этого коммита генерацию выполняет воркер: `npm run worker` или встроенный воркер в `npm run dev`. Старые `src/lib/jobs.ts` и `src/lib/limits.ts` ещё лежат, но роуты их больше не импортируют.

**Interfaces:**
- Consumes: `getJobStore`, `getOwnedJob` (задача 2); `ActiveJobExistsError`, `publicJob`, `isTerminalEvent`, `terminalEventFor` (задача 2); `jobPriority` (задача 2); тексты из `messages.ts`; `startEmbeddedWorker` (задача 8); из цикла 0 — `listMemberships`, `canGenerate`, `hasStaffRole`, `GENERATION_FORBIDDEN_MESSAGE`, `quotaStatus`, `quotaExhaustedMessage`.
- Produces:
  - `POST /api/generate` → `200 { jobId }` | `400 { error }` (пустой запрос, провайдер не настроен) | `401` | `403 { error }` (право, квота) | `409 { error: GENERATION_BUSY_MESSAGE }`;
  - `GET /api/jobs/[id]` → `200 PublicJob` | `401` | `404 { error: JOB_NOT_FOUND_MESSAGE }`;
  - `POST /api/jobs/[id]/cancel` → `200 { ok: true }` (повтор безвреден) | `401` | `404`;
  - `GET /api/jobs/[id]/stream` → SSE `data: PipelineEvent` из `job_events` (или `jobs.events` для старых записей), `{ type: 'queued', position }` вживую раз в 3 секунды при изменении, `: ping` раз в 5 секунд вместе со сверкой с базой; поток закрывается на терминальном событии;
  - `quotaStatus` считает только `kind = 'generate' AND status = 'done'`;
  - `register()` в `src/instrumentation.ts`.

- [ ] **Step 1: Переписать юнит-тесты роутов**

`tests/unit/jobs-api.test.ts` целиком:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { POST as postGenerate } from '@/app/api/generate/route';
import { GET as getJobRoute } from '@/app/api/jobs/[id]/route';
import { POST as postCancel } from '@/app/api/jobs/[id]/cancel/route';
import { GET as getStream } from '@/app/api/jobs/[id]/stream/route';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { __setJobStoreForTests } from '@/lib/jobs/current';
import type { JobStore, NewJob } from '@/lib/jobs/store';
import { HIGH_PRIORITY } from '@/lib/jobs/policy';
import { GENERATION_BUSY_MESSAGE, EMPTY_PROMPT_MESSAGE } from '@/lib/jobs/messages';
import { saveSettings, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { DEFAULT_ORG_SETTINGS } from '@/lib/org/settings';
import type { Membership } from '@/lib/org/types';
import type { AuthUser } from '@/lib/auth/users';
import type { PipelineEvent } from '@/lib/types';

function user(id: string, email: string): AuthUser {
  return { id, email, login: null, displayName: null, role: 'user', mustChangePassword: false };
}
const TEST_USER = user('11111111-1111-1111-1111-111111111111', 'a@t');
const OTHER_USER = user('22222222-2222-2222-2222-222222222222', 'b@t');

// Роуты вызываются напрямую, без базы и cookie: пользователя и членства выставляет тест.
const session = vi.hoisted(() => ({ current: null as AuthUser | null, memberships: [] as unknown[] }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => session.current,
  currentUserFromCookies: async () => session.current,
}));
vi.mock('@/lib/quota', async (orig) => ({
  ...(await orig<typeof import('@/lib/quota')>()),
  quotaStatus: async () => ({ limit: 10, used: 0, remaining: 10 }),
}));
vi.mock('@/lib/org/access', async (orig) => ({
  ...(await orig<typeof import('@/lib/org/access')>()),
  listMemberships: async () => session.memberships,
}));

const REQUEST = { prompt: 'маятник', mode: 'standard' as const, hasImage: false };
let store: JobStore;

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const newJob = (ownerId = TEST_USER.id): NewJob =>
  ({ ownerId, kind: 'generate', priority: 0, request: REQUEST });

function generateRequest(body: object = { prompt: 'маятник' }): Request {
  return new Request('http://t/api/generate', { method: 'POST', body: JSON.stringify(body) });
}

function withProvider<T>(fn: () => Promise<T>): Promise<T> {
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
  return fn().finally(() => {
    delete process.env.SHOWMEHOW_API_KEY;
    delete process.env.SHOWMEHOW_MODEL;
  });
}

/** Читатель SSE: пропускает комментарии `: ping`, отдаёт события по одному. */
function sse(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const queue: PipelineEvent[] = [];
  let buf = '';
  let ended = false;
  function drain() {
    let idx = buf.indexOf('\n\n');
    while (idx !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (frame.startsWith('data: ')) queue.push(JSON.parse(frame.slice(6)));
      idx = buf.indexOf('\n\n');
    }
  }
  async function next(): Promise<PipelineEvent | null> {
    while (queue.length === 0 && !ended) {
      const { value, done } = await reader.read();
      if (done) ended = true;
      else { buf += decoder.decode(value, { stream: true }); drain(); }
    }
    return queue.shift() ?? null;
  }
  async function rest(): Promise<PipelineEvent[]> {
    const out: PipelineEvent[] = [];
    for (let e = await next(); e; e = await next()) out.push(e);
    return out;
  }
  return { next, rest, cancel: () => reader.cancel() };
}

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-jobs-api-'));
  delete process.env.DATABASE_URL;
  session.current = TEST_USER;
  session.memberships = [];
  store = createMemoryJobStore();
  __setJobStoreForTests(store);
});

describe('POST /api/generate', () => {
  it('без провайдера отвечает 400 и задания не создаёт', async () => {
    saveSettings({ activeProviderId: null, providers: [], qualityMode: 'standard' });
    const res = await postGenerate(generateRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(NO_PROVIDER_MESSAGE);
    expect((await store.stats()).queued).toBe(0);
  });

  it('пустой запрос — 400', async () => {
    await withProvider(async () => {
      const res = await postGenerate(generateRequest({ prompt: '   ' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(EMPTY_PROMPT_MESSAGE);
    });
  });

  it('без сессии отвечает 401', async () => {
    session.current = null;
    expect((await postGenerate(generateRequest())).status).toBe(401);
  });

  it('ставит задание в очередь с картинкой и обычным приоритетом', async () => {
    await withProvider(async () => {
      const res = await postGenerate(generateRequest(
        { prompt: 'маятник', mode: 'fast', imageDataUrl: 'data:image/png;base64,AA' }));
      expect(res.status).toBe(200);
      const { jobId } = await res.json();
      expect(await store.get(jobId)).toMatchObject({
        ownerId: TEST_USER.id, kind: 'generate', status: 'queued', priority: 0,
        request: { prompt: 'маятник', mode: 'fast', hasImage: true },
      });
      expect((await store.claim('w1'))?.imageDataUrl).toBe('data:image/png;base64,AA');
    });
  });

  it('учитель получает высокий приоритет', async () => {
    const teacher: Membership = {
      orgId: 'o1', orgSlug: 'sch12', orgName: 'Школа №12', orgKind: 'school', role: 'teacher',
      settings: { ...DEFAULT_ORG_SETTINGS },
    };
    session.memberships = [teacher];
    await withProvider(async () => {
      const { jobId } = await (await postGenerate(generateRequest())).json();
      expect((await store.get(jobId))?.priority).toBe(HIGH_PRIORITY);
    });
  });

  it('вторая генерация того же человека — 409, в том числе параллельная', async () => {
    await withProvider(async () => {
      expect((await postGenerate(generateRequest())).status).toBe(200);
      const second = await postGenerate(generateRequest());
      expect(second.status).toBe(409);
      expect((await second.json()).error).toBe(GENERATION_BUSY_MESSAGE);

      __setJobStoreForTests(createMemoryJobStore());
      const [a, b] = await Promise.all([postGenerate(generateRequest()), postGenerate(generateRequest())]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });
  });
});

describe('GET /api/jobs/[id]', () => {
  it('неизвестное задание — 404', async () => {
    expect((await getJobRoute(new Request('http://t'), params('nope'))).status).toBe(404);
    expect((await getJobRoute(new Request('http://t'), params(crypto.randomUUID()))).status).toBe(404);
  });

  it('отдаёт задание без владельца, аренды и журнала', async () => {
    const job = await store.create(newJob());
    const res = await getJobRoute(new Request('http://t'), params(job.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: job.id, kind: 'generate', status: 'queued', createdAt: job.createdAt, request: REQUEST,
    });
  });

  it('готовое задание несёт id симуляции', async () => {
    const job = await store.create(newJob());
    await store.claim('w1');
    const simId = crypto.randomUUID();
    await store.finish(job.id, 'w1', { status: 'done', simulationId: simId });
    const body = await (await getJobRoute(new Request('http://t'), params(job.id))).json();
    expect(body).toMatchObject({ status: 'done', simulationId: simId });
  });
});

describe('POST /api/jobs/[id]/cancel', () => {
  const cancel = (id: string) => postCancel(new Request('http://t', { method: 'POST' }), params(id));

  it('неизвестное задание — 404', async () => {
    expect((await cancel('nope')).status).toBe(404);
  });

  it('ожидающее отменяется сразу, повтор безвреден', async () => {
    const job = await store.create(newJob());
    expect(await (await cancel(job.id)).json()).toEqual({ ok: true });
    expect(await (await cancel(job.id)).json()).toEqual({ ok: true });
    expect((await store.get(job.id))?.status).toBe('cancelled');
    expect(await store.events(job.id, 0)).toEqual([{ seq: 1, event: { type: 'cancelled' } }]);
  });

  it('идущее получает флаг отмены, статус меняет воркер', async () => {
    const job = await store.create(newJob());
    await store.claim('w1');
    expect((await cancel(job.id)).status).toBe(200);
    expect(await store.get(job.id)).toMatchObject({ status: 'running', cancelRequested: true });
    expect((await store.heartbeat('w1', 'h', 1)).cancelRequested).toEqual([job.id]);
  });
});

// Регрессия: по угаданному id посторонний читал чужой промпт, весь журнал пайплайна
// и мог отменить чужую генерацию — все три роута заданий обязаны проверять владельца.
describe('изоляция владельцев в роутах заданий', () => {
  it('без сессии — 401, чужое задание — 404', async () => {
    const job = await store.create(newJob());
    const post = () => new Request('http://t', { method: 'POST' });

    session.current = null;
    expect((await getJobRoute(new Request('http://t'), params(job.id))).status).toBe(401);
    expect((await getStream(new Request('http://t'), params(job.id))).status).toBe(401);
    expect((await postCancel(post(), params(job.id))).status).toBe(401);

    session.current = OTHER_USER;
    expect((await getJobRoute(new Request('http://t'), params(job.id))).status).toBe(404);
    expect((await getStream(new Request('http://t'), params(job.id))).status).toBe(404);
    expect((await postCancel(post(), params(job.id))).status).toBe(404);
    expect((await store.get(job.id))?.status).toBe('queued');
  });
});

describe('GET /api/jobs/[id]/stream', () => {
  it('неизвестное задание — 404', async () => {
    expect((await getStream(new Request('http://t'), params('nope'))).status).toBe(404);
  });

  it('реплей, живые события без дублей и закрытие на терминальном', async () => {
    const job = await store.create(newJob());
    await store.claim('w1');
    await store.appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'start', at: 1 }, 'w1');
    await store.appendEvent(job.id, { type: 'stage', stage: 'planning', status: 'end', at: 2 }, 'w1');

    const res = await getStream(new Request('http://t'), params(job.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const s = sse(res);
    expect(await s.next()).toEqual({ type: 'stage', stage: 'planning', status: 'start', at: 1 });
    expect(await s.next()).toEqual({ type: 'stage', stage: 'planning', status: 'end', at: 2 });

    await store.appendEvent(job.id, { type: 'warning', message: 'осторожно' }, 'w1');
    expect(await s.next()).toEqual({ type: 'warning', message: 'осторожно' });

    await store.finish(job.id, 'w1', { status: 'done', simulationId: 'sim-1' });
    expect(await s.rest()).toEqual([{ type: 'done', simulationId: 'sim-1' }]);
  });

  it('завершённое задание: реплей и сразу закрытие', async () => {
    const job = await store.create(newJob());
    await store.cancelQueued(job.id);
    const s = sse(await getStream(new Request('http://t'), params(job.id)));
    expect(await s.rest()).toEqual([{ type: 'cancelled' }]);
  });

  it('пока задание в очереди, поток сообщает позицию и её изменения', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      await store.create(newJob(OTHER_USER.id));
      const mine = await store.create(newJob());
      const s = sse(await getStream(new Request('http://t'), params(mine.id)));
      expect(await s.next()).toEqual({ type: 'queued', position: 2 });
      await store.claim('w1');                 // первое задание ушло из очереди
      await vi.advanceTimersByTimeAsync(3000);
      expect(await s.next()).toEqual({ type: 'queued', position: 1 });
      await store.claim('w1');
      await store.appendEvent(mine.id, { type: 'stage', stage: 'planning', status: 'start', at: 5 }, 'w1');
      expect(await s.next()).toEqual({ type: 'stage', stage: 'planning', status: 'start', at: 5 });
      // Позиция в журнал не пишется.
      expect((await store.events(mine.id, 0)).map((e) => e.event.type)).toEqual(['stage']);
      await s.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Написать интеграционный тест роутов**

`tests/integration/jobs-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createPgJobStore } from '@/lib/jobs/store-pg';
import { closeListener } from '@/lib/jobs/listener';
import { GENERATION_BUSY_MESSAGE } from '@/lib/jobs/messages';
import { POST as postGenerate } from '@/app/api/generate/route';
import { GET as getStream } from '@/app/api/jobs/[id]/stream/route';

const SCHEMA = 'jobs_routes_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM job_events; DELETE FROM jobs; DELETE FROM sessions; DELETE FROM users;');
});
afterAll(async () => {
  delete process.env.SHOWMEHOW_API_KEY;
  delete process.env.SHOWMEHOW_MODEL;
  await closeListener();
  await pool?.end();
  await closeDb();
});

async function signIn(): Promise<{ id: string; cookie: string }> {
  const u = await createUser(`u-${crypto.randomUUID()}@example.com`, 'пароль123');
  return { id: u.id, cookie: `${SESSION_COOKIE}=${await createSession(u.id)}` };
}

const generate = (cookie: string) => postGenerate(new Request('http://t/api/generate', {
  method: 'POST', headers: { cookie }, body: JSON.stringify({ prompt: 'маятник' }),
}));

async function readUntilClosed(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6)));
}

describe.skipIf(!pool)('роуты заданий на Postgres', () => {
  it('вторая активная генерация упирается в уникальный индекс и даёт 409', async () => {
    const { cookie } = await signIn();
    const [a, b] = await Promise.all([generate(cookie), generate(cookie)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const busy = a.status === 409 ? a : b;
    expect((await busy.json()).error).toBe(GENERATION_BUSY_MESSAGE);
    const { rows } = await pool!.query('SELECT count(*)::int AS n FROM jobs');
    expect(rows[0].n).toBe(1);
  });

  it('поток получает событие, записанное из другого соединения', async () => {
    const { cookie } = await signIn();
    const { jobId } = await (await generate(cookie)).json();
    const other = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const workerStore = createPgJobStore(other);
      expect((await workerStore.claim('w-int'))?.id).toBe(jobId);
      const res = await getStream(new Request('http://t', { headers: { cookie } }),
        { params: Promise.resolve({ id: jobId }) });
      const events = readUntilClosed(res);
      await new Promise((r) => setTimeout(r, 300));
      await workerStore.appendEvent(jobId, { type: 'warning', message: 'из воркера' }, 'w-int');
      await workerStore.finish(jobId, 'w-int', { status: 'error', message: 'стоп' });
      expect(await events).toEqual([
        { type: 'warning', message: 'из воркера' },
        { type: 'error', message: 'стоп' },
      ]);
    } finally {
      await other.end();
    }
  });

  it('старая запись без терминального события: журнал из jobs.events и ошибка по статусу', async () => {
    const { id, cookie } = await signIn();
    const jobId = crypto.randomUUID();
    await pool!.query(
      `INSERT INTO jobs (id, owner_id, status, request, events, error)
       VALUES ($1, $2, 'error', '{}'::jsonb, $3::jsonb, 'Сервер был перезапущен')`,
      [jobId, id, JSON.stringify([{ type: 'stage', stage: 'planning', status: 'start', at: 1 }])]);
    const res = await getStream(new Request('http://t', { headers: { cookie } }),
      { params: Promise.resolve({ id: jobId }) });
    expect(await readUntilClosed(res)).toEqual([
      { type: 'stage', stage: 'planning', status: 'start', at: 1 },
      { type: 'error', message: 'Сервер был перезапущен' },
    ]);
  });
});
```

В `tests/integration/quota.test.ts` помощник `addJob` получает вид задания, и добавляется тест:

```ts
  async function addJob(ownerId: string, status: string, kind = 'generate') {
    await pool!.query(
      "INSERT INTO jobs (id, owner_id, status, request, kind) VALUES ($1,$2,$3,'{}'::jsonb,$4)",
      [crypto.randomUUID(), ownerId, status, kind]);
  }

  it('доработки квоту не тратят', async () => {
    const u = await createUser('r@example.com', 'пароль123');
    await addJob(u.id, 'done');
    for (let i = 0; i < 5; i++) await addJob(u.id, 'done', 'refine');
    expect(await quotaStatus(u)).toEqual({ limit: TRIAL_LIMIT, used: 1, remaining: TRIAL_LIMIT - 1 });
  });
```

- [ ] **Step 3: Убедиться, что тесты падают**

```bash
npx vitest run tests/unit/jobs-api.test.ts
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow \
  npx vitest run tests/integration/jobs-routes.test.ts tests/integration/quota.test.ts
```

Ожидается: FAIL — роуты ещё работают со старым `@/lib/jobs`, квота считает доработки.

- [ ] **Step 4: Переписать роут генерации**

`src/app/api/generate/route.ts` целиком:

```ts
import { NextResponse } from 'next/server';
import { getJobStore } from '@/lib/jobs/current';
import { ActiveJobExistsError } from '@/lib/jobs/store';
import { jobPriority } from '@/lib/jobs/policy';
import { EMPTY_PROMPT_MESSAGE, GENERATION_BUSY_MESSAGE } from '@/lib/jobs/messages';
import { quotaStatus, quotaExhaustedMessage } from '@/lib/quota';
import { activeProvider, resolveMode, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { listMemberships } from '@/lib/org/access';
import { canGenerate, hasStaffRole, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';
import type { QualityMode } from '@/lib/types';

/**
 * Веб только ставит заявку в очередь: пайплайн и Chromium живут в воркере.
 * «Одна генерация на человека» держит уникальный индекс базы, а не память процесса,
 * поэтому второй одновременный POST получает 409 без всякой резервации.
 */
export async function POST(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const memberships = await listMemberships(user.id);
  if (!canGenerate(user, memberships)) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const body = (await req.json()) as { prompt?: unknown; imageDataUrl?: unknown; mode?: QualityMode };
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: EMPTY_PROMPT_MESSAGE }, { status: 400 });
  }
  // Провайдер проверяется до создания задания: без него воркеру нечего делать.
  if (!activeProvider()) {
    return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 400 });
  }
  const quota = await quotaStatus(user, memberships);
  if (quota.limit !== null && quota.remaining !== null && quota.remaining <= 0) {
    return NextResponse.json(
      { error: quotaExhaustedMessage(quota.limit, hasStaffRole(memberships)) }, { status: 403 });
  }
  const imageDataUrl = typeof body.imageDataUrl === 'string' && body.imageDataUrl
    ? body.imageDataUrl : undefined;
  try {
    const job = await getJobStore().create({
      ownerId: user.id,
      kind: 'generate',
      priority: jobPriority(user, memberships),
      request: { prompt, mode: resolveMode(body.mode), hasImage: !!imageDataUrl },
      imageDataUrl,
    });
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    if (e instanceof ActiveJobExistsError) {
      return NextResponse.json({ error: GENERATION_BUSY_MESSAGE }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 5: Переписать чтение и отмену**

`src/app/api/jobs/[id]/route.ts` целиком:

```ts
import { NextResponse } from 'next/server';
import { getOwnedJob } from '@/lib/jobs/current';
import { publicJob } from '@/lib/jobs/store';
import { JOB_NOT_FOUND_MESSAGE } from '@/lib/jobs/messages';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  // Чужое задание неотличимо от несуществующего: иначе по угаданному id
  // посторонний узнал бы чужой промпт.
  const job = await getOwnedJob(user.id, id);
  if (!job) return NextResponse.json({ error: JOB_NOT_FOUND_MESSAGE }, { status: 404 });
  // Статус читается из базы как есть: потерянные задания возвращает уборщик воркера.
  return NextResponse.json(publicJob(job));
}
```

`src/app/api/jobs/[id]/cancel/route.ts` целиком:

```ts
import { NextResponse } from 'next/server';
import { getJobStore, getOwnedJob } from '@/lib/jobs/current';
import { JOB_NOT_FOUND_MESSAGE } from '@/lib/jobs/messages';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

type P = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const job = await getOwnedJob(user.id, id);
  if (!job) return NextResponse.json({ error: JOB_NOT_FOUND_MESSAGE }, { status: 404 });
  const store = getJobStore();
  // Ожидающее закрываем сами: пайплайна, который бросил бы CancelledError, ещё нет.
  if (job.status === 'queued' && (await store.cancelQueued(id))) {
    return NextResponse.json({ ok: true });
  }
  // Идущее (или взятое воркером между чтением и отменой) останавливает воркер:
  // флаг он увидит в ближайшем сердцебиении. Для завершённого это ничего не меняет.
  await store.requestCancel(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Переписать поток**

`src/app/api/jobs/[id]/stream/route.ts` целиком:

```ts
import { getJobStore, getOwnedJob } from '@/lib/jobs/current';
import { isTerminalEvent, terminalEventFor, type JobStatus } from '@/lib/jobs/store';
import { currentUserFromRequest } from '@/lib/auth/session';
import type { PipelineEvent } from '@/lib/types';

export const maxDuration = 600;

/** Сверка с базой на случай потерянного NOTIFY; заодно держит соединение живым. */
const RECONCILE_MS = 5000;
/** Как часто ожидающее задание узнаёт своё место в очереди. */
const POSITION_MS = 3000;

type P = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: P) {
  // Поток отдаёт весь журнал пайплайна: нет сессии — 401, чужое задание — 404.
  const user = await currentUserFromRequest(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Требуется вход в систему.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const { id } = await params;
  const job = await getOwnedJob(user.id, id);
  if (!job) return new Response(null, { status: 404 });

  const store = getJobStore();
  const encoder = new TextEncoder();
  const cleanups: (() => void)[] = [];
  let closed = false;
  let lastSeq = 0;
  let lastStatus: JobStatus = job.status;
  let lastPosition = 0;
  let pulling: Promise<void> | null = null;
  let pullAgain = false;

  function cleanup(): void {
    closed = true;
    for (const c of cleanups.splice(0)) c();
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const shutdown = () => {
        if (closed) return;
        cleanup();
        try { controller.close(); } catch { /* уже закрыт */ }
      };
      const write = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { cleanup(); }
      };
      const send = (e: PipelineEvent) => {
        write(`data: ${JSON.stringify(e)}\n\n`);
        if (isTerminalEvent(e)) shutdown();
      };

      // Дочитывает журнал после lastSeq. Инвариант «без потерь и дублей» держит seq:
      // уведомления, сверка и реплей сходятся в одну очередь чтений.
      async function pullOnce(): Promise<void> {
        const readTail = async () => {
          for (const r of await store.events(id, lastSeq)) {
            if (closed) return;
            lastSeq = r.seq;
            send(r.event);
          }
        };
        await readTail();
        if (closed) return;
        const current = await store.get(id);
        if (!current) { shutdown(); return; }
        lastStatus = current.status;
        const fallback = terminalEventFor(current);
        if (fallback) {
          // Статус и терминальное событие пишутся одной транзакцией: если статус
          // терминальный, событие уже в журнале. Его нет только у старых записей.
          await readTail();
          if (!closed) send(fallback);
        }
      }

      function pull(): Promise<void> {
        if (pulling) { pullAgain = true; return pulling; }
        pulling = (async () => {
          do {
            pullAgain = false;
            try { await pullOnce(); } catch (e) { console.error(`Поток задания ${id}:`, e); }
          } while (pullAgain && !closed);
        })().finally(() => { pulling = null; });
        return pulling;
      }

      async function reportPosition(): Promise<void> {
        if (closed || lastStatus !== 'queued') return;
        try {
          const position = await store.position(id);
          if (position > 0 && position !== lastPosition) send({ type: 'queued', position });
          lastPosition = position;
        } catch (e) {
          console.error(`Позиция задания ${id}:`, e);
        }
      }

      // Подписка до реплея: всё, что появится во время чтения, дочитает pullAgain.
      cleanups.push(store.subscribe(id, () => { void pull(); }));
      const reconcile = setInterval(() => { write(': ping\n\n'); void pull(); }, RECONCILE_MS);
      const position = setInterval(() => { void reportPosition(); }, POSITION_MS);
      cleanups.push(() => clearInterval(reconcile), () => clearInterval(position));
      void pull().then(reportPosition);
    },
    cancel() {
      // Клиент ушёл — задание живёт дальше, просто перестаём читать.
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Для прокси, которые смотрят на этот заголовок; Caddy настроен flush_interval -1.
      'X-Accel-Buffering': 'no',
    },
  });
}
```

- [ ] **Step 7: Квота только за генерации и встроенный воркер**

В `src/lib/quota.ts` запрос подсчёта:

```ts
  const { rows } = await db().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM jobs
     WHERE owner_id = $1 AND kind = 'generate' AND status = 'done'`, [user.id]);
```

и в комментарии над `quotaStatus` добавить предложение: «Доработки квоту не тратят: считаются только задания вида generate.»

`src/instrumentation.ts`:

```ts
/**
 * Next вызывает register() один раз при старте сервера. Встроенный воркер нужен
 * только в dev (см. embeddedWorkerEnabled); импорт внутри условия не даёт
 * Edge-сборке тянуть pg и Playwright.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmbeddedWorker } = await import('./lib/worker/embedded');
    startEmbeddedWorker();
  }
}
```

- [ ] **Step 8: Прогнать тесты и проверить вживую**

```bash
npx vitest run tests/unit/jobs-api.test.ts
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npm test
npm test && npx tsc --noEmit && npm run build
```

Ожидается: PASS; сборка зелёная и не запускает воркер (в выводе нет строки «Воркер … запущен»).

Проверка вживую: `npm run dev`, войти, запустить генерацию в режиме «Быстро». В консоли dev-сервера есть «Воркер … запущен» и «…взял задание…», прогресс идёт, симуляция открывается. Перезагрузка страницы посреди генерации восстанавливает прогресс.

- [ ] **Step 9: Коммит**

```bash
git add src/app/api/generate/route.ts "src/app/api/jobs/[id]" src/lib/quota.ts src/instrumentation.ts \
  tests/unit/jobs-api.test.ts tests/integration/jobs-routes.test.ts tests/integration/quota.test.ts
git commit -m "feat(jobs): роуты заданий читают и пишут очередь в базе, генерацию ведёт воркер

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Доработка через очередь — роут и мастерская

**Files:**
- Create: `tests/unit/refine-api.test.ts`
- Modify: `src/app/api/simulations/[id]/refine/route.ts`, `src/components/Workbench.tsx`, `tests/unit/workbench-restore.test.ts`

**Interfaces:**
- Consumes: `getJobStore`, `ActiveJobExistsError`, `jobPriority`, `REFINE_BUSY_MESSAGE`, `EMPTY_INSTRUCTION_MESSAGE`, `SIMULATION_NOT_FOUND_MESSAGE`; `getArtifact`; из цикла 0 — `listMemberships`, `canGenerate`, `GENERATION_FORBIDDEN_MESSAGE`; тип `JobKind`, `JobStatus` из `src/lib/jobs/store.ts`.
- Produces:
  - `POST /api/simulations/[id]/refine` → `200 { jobId }` | `400` (пустая инструкция, невалидный сегмент пути, провайдер не настроен) | `401` | `403` | `404` | `409 { error: REFINE_BUSY_MESSAGE }`. Квоту не тратит;
  - в `Workbench.tsx`: `restoredJobAction(status: JobStatus)` без изменений; новые `doneMessage(kind: JobKind): string` и `reconnectDelay(attempt: number): number | null`;
  - клиент переподключается к потоку после обрыва (рестарт веба), восстанавливает и доработку.

- [ ] **Step 1: Написать падающие тесты**

`tests/unit/refine-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { POST as postRefine } from '@/app/api/simulations/[id]/refine/route';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { __setJobStoreForTests } from '@/lib/jobs/current';
import type { JobStore } from '@/lib/jobs/store';
import { REFINE_BUSY_MESSAGE, EMPTY_INSTRUCTION_MESSAGE } from '@/lib/jobs/messages';
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';
import { createSimulation } from '@/lib/storage';
import type { AuthUser } from '@/lib/auth/users';

const OWNER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111', email: 'a@t', login: null, displayName: null,
  role: 'user', mustChangePassword: false,
};
const STRANGER: AuthUser = { ...OWNER, id: '22222222-2222-2222-2222-222222222222', email: 'b@t' };

const session = vi.hoisted(() => ({ current: null as AuthUser | null }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => session.current,
}));
vi.mock('@/lib/org/access', async (orig) => ({
  ...(await orig<typeof import('@/lib/org/access')>()),
  listMemberships: async () => [],
}));

let store: JobStore;
let simId = '';

const refine = (id: string, body: object = { instruction: 'медленнее' }) =>
  postRefine(new Request('http://t', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) });

beforeEach(async () => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-refine-'));
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
  delete process.env.DATABASE_URL;
  __setRepoForTests(createMemoryRepo());
  store = createMemoryJobStore();
  __setJobStoreForTests(store);
  session.current = OWNER;
  simId = (await createSimulation(OWNER.id,
    { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>')).id;
});

describe('POST /api/simulations/[id]/refine', () => {
  it('ставит доработку в очередь и сразу отвечает id задания', async () => {
    const res = await refine(simId);
    expect(res.status).toBe(200);
    const { jobId } = await res.json();
    expect(await store.get(jobId)).toMatchObject({
      ownerId: OWNER.id, kind: 'refine', status: 'queued', targetSimulationId: simId,
      request: { instruction: 'медленнее' },
    });
  });

  it('вторая доработка — 409, а генерация рядом разрешена', async () => {
    expect((await refine(simId)).status).toBe(200);
    const again = await refine(simId);
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe(REFINE_BUSY_MESSAGE);
    await expect(store.create({
      ownerId: OWNER.id, kind: 'generate', priority: 0,
      request: { prompt: 'p', mode: 'fast', hasImage: false },
    })).resolves.toMatchObject({ kind: 'generate' });
  });

  it('пустая инструкция — 400', async () => {
    const res = await refine(simId, { instruction: '  ' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(EMPTY_INSTRUCTION_MESSAGE);
  });

  it('чужая и несуществующая симуляция — 404, обход каталога — 400', async () => {
    session.current = STRANGER;
    expect((await refine(simId)).status).toBe(404);
    expect((await refine(crypto.randomUUID())).status).toBe(404);
    expect((await refine('..%2Fevil')).status).toBe(400);
    expect((await store.stats()).queued).toBe(0);
  });

  it('без сессии — 401', async () => {
    session.current = null;
    expect((await refine(simId)).status).toBe(401);
  });
});
```

В `tests/unit/workbench-restore.test.ts` импорт заменить на

```ts
import { restoredJobAction, doneMessage, reconnectDelay } from '@/components/Workbench';
```

и дописать:

```ts
describe('doneMessage', () => {
  it('генерация и доработка завершаются разными фразами', () => {
    expect(doneMessage('generate')).toBe('Готово. Симуляция справа — можно показывать или дорабатывать.');
    expect(doneMessage('refine')).toBe('Готово, обновил.');
  });
});

describe('reconnectDelay', () => {
  it('растёт и через полторы минуты сдаётся', () => {
    expect(reconnectDelay(0)).toBe(1000);
    const delays: number[] = [];
    for (let i = 0; reconnectDelay(i) !== null; i++) delays.push(reconnectDelay(i)!);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(90_000);
    expect(reconnectDelay(delays.length)).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
npx vitest run tests/unit/refine-api.test.ts tests/unit/workbench-restore.test.ts
```

Ожидается: FAIL — старый роут выполняет доработку прямо в запросе и не возвращает `jobId`; `doneMessage` и `reconnectDelay` не экспортируются.

- [ ] **Step 3: Переписать роут доработки**

`src/app/api/simulations/[id]/refine/route.ts` целиком:

```ts
import { NextResponse } from 'next/server';
import { getArtifact } from '@/lib/storage';
import { getJobStore } from '@/lib/jobs/current';
import { ActiveJobExistsError } from '@/lib/jobs/store';
import { jobPriority } from '@/lib/jobs/policy';
import {
  EMPTY_INSTRUCTION_MESSAGE, REFINE_BUSY_MESSAGE, SIMULATION_NOT_FOUND_MESSAGE,
} from '@/lib/jobs/messages';
import { activeProvider, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { listMemberships } from '@/lib/org/access';
import { canGenerate, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

/**
 * Доработка — такое же задание, как генерация: её выполняет воркер, и Chromium
 * больше не поднимается в веб-процессе в обход очереди. Квоту она не тратит.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  // Право проверяется до поиска симуляции и ничего о ней не выдаёт.
  const memberships = await listMemberships(user.id);
  if (!canGenerate(user, memberships)) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json()) as { instruction?: unknown };
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) {
    return NextResponse.json({ error: EMPTY_INSTRUCTION_MESSAGE }, { status: 400 });
  }
  // Чужая и несуществующая симуляции дают 404; обход каталога в id — 400.
  try {
    if ((await getArtifact(user.id, id)) === null) {
      return NextResponse.json({ error: SIMULATION_NOT_FOUND_MESSAGE }, { status: 404 });
    }
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: SIMULATION_NOT_FOUND_MESSAGE }, { status });
  }
  if (!activeProvider()) {
    return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 400 });
  }
  try {
    const job = await getJobStore().create({
      ownerId: user.id,
      kind: 'refine',
      priority: jobPriority(user, memberships),
      request: { instruction },
      targetSimulationId: id,
    });
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    if (e instanceof ActiveJobExistsError) {
      return NextResponse.json({ error: REFINE_BUSY_MESSAGE }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Перевести мастерскую на поток для доработки**

В `src/components/Workbench.tsx`:

1. Импорт типа:

```ts
import type { JobKind, JobStatus } from '@/lib/jobs/store';
```

2. После `restoredJobAction` добавить:

```ts
export function doneMessage(kind: JobKind): string {
  return kind === 'refine'
    ? 'Готово, обновил.'
    : 'Готово. Симуляция справа — можно показывать или дорабатывать.';
}

// Паузы между попытками переподключения к потоку. Их суммы хватает, чтобы пережить
// рестарт веба при выкладке; генерация на воркере тем временем идёт дальше.
const RECONNECT_DELAYS_MS = [1000, 2000, 3000, 5000, 5000, 10000, 10000, 15000, 15000, 30000];

/** Пауза перед попыткой номер attempt (с нуля); null — пора сдаться. */
export function reconnectDelay(attempt: number): number | null {
  return RECONNECT_DELAYS_MS[attempt] ?? null;
}
```

3. Рядом с `jobId` — состояние вида задания:

```ts
  const [jobKind, setJobKind] = useState<JobKind>('generate');
```

4. `consumeJobStream` получает вид задания и возвращает, чем кончился поток. Заменить заголовок и тело обработки событий:

```ts
  async function consumeJobStream(res: Response, kind: JobKind): Promise<'terminal' | 'dropped'> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop()!;
        for (const part of parts) {
          // Строки `: ping` — сердцебиение потока, событий в них нет.
          if (!part.startsWith('data: ')) continue;
          const e = JSON.parse(part.slice(6)) as PipelineEvent;
          setEvents((prev) => [...prev, e]);
          if (e.type === 'done') {
            clearActiveJob();
            say('bot', doneMessage(kind));
            setActiveTab('preview');
            await openSimulation(e.simulationId);
            // Квоту тратит только генерация.
            if (kind === 'generate') fetchQuota();
            return 'terminal';
          }
          if (e.type === 'error') {
            clearActiveJob();
            // Текст ошибки уже показывает ProgressView из этого же события.
            setPhase('error');
            return 'terminal';
          }
          if (e.type === 'cancelled') {
            clearActiveJob();
            // Отменённая доработка оставляет открытой прежнюю версию симуляции.
            setPhase(kind === 'refine' ? 'ready' : 'idle');
            return 'terminal';
          }
        }
      }
    } catch {
      // Обрыв посреди чтения — то же, что закрытие без терминального события.
    }
    return 'dropped';
  }
```

5. `connectToJob` целиком:

```ts
  async function connectToJob(id: string, kind: JobKind) {
    // Идемпотентность по jobId: второй вызов не открывает параллельное подключение.
    if (connectedJobRef.current === id) return;
    connectedJobRef.current = id;
    setJobKind(kind);
    setPhase('generating');
    try {
      for (let attempt = 0; ; attempt++) {
        // Каждое подключение начинает реплей с чистого листа — дублей не будет.
        setEvents([]);
        let res: Response | null = null;
        try {
          res = await fetch(`/api/jobs/${id}/stream`);
        } catch {
          res = null;   // сеть или рестарт веба — попробуем ещё раз
        }
        if (res && !res.ok && res.status < 500) {
          clearActiveJob();
          setError(res.status === 404 ? 'Задание не найдено' : `Ошибка сервера (${res.status})`);
          setPhase('error');
          return;
        }
        if (res && res.ok && (await consumeJobStream(res, kind)) === 'terminal') return;
        const delay = reconnectDelay(attempt);
        if (delay === null) {
          // Ключ не чистим: задание может ещё идти, перезагрузка страницы подхватит его.
          setError('Связь с сервером потеряна. Перезагрузите страницу — работа продолжается на сервере.');
          setPhase('error');
          return;
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    } finally {
      if (connectedJobRef.current === id) connectedJobRef.current = null;
    }
  }
```

6. В `generate()` вызов `await connectToJob(newJobId);` заменить на `await connectToJob(newJobId, 'generate');`.

7. `refine()` целиком (комментарий над ней про «мимо job-пайплайна» удалить):

```ts
  // Доработка — такое же задание, как генерация: тот же поток, та же отмена,
  // то же восстановление после перезагрузки страницы.
  async function refine(instruction: string) {
    if (!simId) return;
    say('user', instruction);
    setPhase('generating'); setError(null); setEvents([]); setCancelling(false);
    try {
      const res = await fetch(`/api/simulations/${simId}/refine`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Ошибка сервера (${res.status})`);
        setPhase('error');
        return;
      }
      localStorage.setItem(ACTIVE_JOB_KEY, body.jobId);
      setJobId(body.jobId);
      await connectToJob(body.jobId, 'refine');
    } catch (err) {
      setError('Ошибка сети: ' + (err instanceof Error ? err.message : String(err)));
      setPhase('error');
    }
  }
```

8. В эффекте восстановления `switch` целиком:

```ts
        const kind: JobKind = job.kind === 'refine' ? 'refine' : 'generate';
        const target: string | undefined = job.targetSimulationId;
        switch (restoredJobAction(job.status)) {
          case 'reconnect':
            setJobId(activeJobId);
            // Доработка идёт поверх открытой симуляции — сначала показываем её.
            if (kind === 'refine' && target) await openSimulation(target);
            await connectToJob(activeJobId, kind);
            break;
          case 'open':
            localStorage.removeItem(ACTIVE_JOB_KEY);
            if (job.simulationId) await openSimulation(job.simulationId);
            break;
          case 'cancelled':
            localStorage.removeItem(ACTIVE_JOB_KEY);
            if (kind === 'refine' && target) {
              await openSimulation(target);
            } else {
              setError('Генерация отменена');
              setPhase('idle');
            }
            break;
          default:
            localStorage.removeItem(ACTIVE_JOB_KEY);
            if (kind === 'refine' && target) await openSimulation(target);
            setError(job.error ?? (kind === 'refine' ? 'Ошибка доработки' : 'Ошибка генерации'));
            setPhase('error');
            break;
        }
```

9. В ленте, перед `<ProgressView events={events} />`:

```tsx
          {busy && jobKind === 'refine' && (
            <div className="msg msg-bot"><div className="bubble">Дорабатываю…</div></div>
          )}
```

Кнопка «Отменить» уже показывается при `busy && jobId` и работает для доработки без изменений.

- [ ] **Step 5: Прогнать тесты и проверить вживую**

```bash
npx vitest run tests/unit/refine-api.test.ts tests/unit/workbench-restore.test.ts
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npm test
npm test && npx tsc --noEmit
```

Ожидается: PASS, включая `org-generation.test.ts` цикла 0 (403 для ученика на доработке).

Проверка вживую в `npm run dev`:
- открыть симуляцию, отправить «сделай медленнее»: появляется «Дорабатываю…» и кнопка «Отменить», по готовности — «Готово, обновил.», в «Версиях» на одну запись больше;
- отправить доработку и нажать «Отменить»: симуляция остаётся прежней, композер доступен;
- отправить доработку и перезагрузить страницу: симуляция открыта, прогресс доработки восстановлен;
- во время генерации остановить `npm run dev` и через пять секунд запустить снова: мастерская сама переподключается, прогресс виден, генерация доходит до конца.

- [ ] **Step 6: Коммит**

```bash
git add "src/app/api/simulations/[id]/refine/route.ts" src/components/Workbench.tsx \
  tests/unit/refine-api.test.ts tests/unit/workbench-restore.test.ts
git commit -m "feat(refine): доработка через очередь, отмена и восстановление в мастерской

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Удаление старых модулей и README

**Files:**
- Delete: `src/lib/jobs.ts`, `src/lib/limits.ts`, `tests/unit/jobs.test.ts`, `tests/unit/limits.test.ts`, `tests/integration/jobs-db.test.ts`
- Modify: `tests/integration/quota.test.ts`, `tests/integration/org-generation.test.ts`, `README.md`, `docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md`

**Interfaces:**
- Consumes: всё из задач 2–10.
- Produces: в коде нет ни одного импорта `@/lib/jobs` (без `/…`) и `@/lib/limits`.

Гарантии удаляемых тестов уже покрыты: `jobs.test.ts` и `jobs-db.test.ts` — набором `tests/jobstore-contract.ts` на обоих драйверах и `jobs-routes.test.ts`; `limits.test.ts` — уникальными индексами и тестами воркера на слоты и порядок.

- [ ] **Step 1: Удалить модули и найти остатки**

```bash
git rm src/lib/jobs.ts src/lib/limits.ts tests/unit/jobs.test.ts tests/unit/limits.test.ts tests/integration/jobs-db.test.ts
grep -rnE "@/lib/(jobs|limits)['\"]|lib/jobs['\"]|lib/limits['\"]|__clearForTests|__resetLimitsForTests|flushJobWrites" src tests scripts e2e
```

Ожидается: совпадения только в `tests/integration/quota.test.ts` и `tests/integration/org-generation.test.ts`.

- [ ] **Step 2: Убрать остатки из тестов**

`tests/integration/quota.test.ts`: удалить строки импорта `__resetLimitsForTests` и `__clearForTests` и их вызовы в `beforeEach`.

`tests/integration/org-generation.test.ts`: удалить импорты `__resetLimitsForTests`, `__clearForTests` и их вызовы; удалить подмену `vi.mock('@/lib/pipeline/run', …)` (роут генерации пайплайн больше не импортирует) и `vi` из импорта vitest, если он больше не используется. В `beforeEach` к `TRUNCATE organizations, users CASCADE` ничего добавлять не нужно: `jobs` и `job_events` удаляются каскадом.

- [ ] **Step 3: Обновить README**

В `README.md` раздел «### Задания и прогресс» заменить на:

~~~markdown
### Задания и прогресс

Генерация и доработка — задания в очереди Postgres. Веб только принимает заявку и
отдаёт прогресс; выполняет задания отдельный процесс-воркер. Воркер пишет журнал
событий пайплайна (план готов, кандидат, вердикты, круг доводки) в таблицу
`job_events`, веб отдаёт его по SSE и узнаёт о новых событиях через `LISTEN/NOTIFY`.

Поэтому перезагрузка страницы, рестарт веба и даже второй экземпляр веба не теряют
прогресс. Упавший воркер тоже не теряет задание: через полторы минуты его подберёт
другой воркер (или тот же после рестарта) и начнёт заново — один раз. У каждого
человека одновременно не больше одной генерации и одной доработки. Учителя и
администраторы организаций идут в очереди раньше. Пока задание выполняется, можно
нажать «Отменить»: пайплайн остановится в ближайшей безопасной точке, в течение
пятнадцати секунд.

### Воркер

```bash
npm run worker        # отдельный процесс, нужен DATABASE_URL
```

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `WORKER_CONCURRENCY` | `2` | сколько генераций воркер ведёт одновременно |
| `WORKER_DRAIN_SECONDS` | `600` | сколько ждать текущие задания после `SIGTERM` |
| `SHOWMEHOW_EMBEDDED_WORKER` | `1` в `npm run dev`, иначе `0` | запускать воркер внутри веб-процесса |
| `SHOWMEHOW_TRUST_PROXY` | не задана | `1` — доверять `x-forwarded-for` (только за Caddy) |

В `npm run dev` воркер встроен и отдельно не запускается. На боевом сервере это служба
`teseract-worker`, см. `docs/ops/deploy.md`.
~~~

В разделе «## Команды» добавить строку `- \`npm run worker\` — воркер очереди генераций`. В разделе «## Запуск в Docker» заменить первое предложение после блока кода на: «`docker-compose.yml` поднимает Postgres, веб-приложение и воркер из того же образа; при старте контейнер приложения сам прогоняет `npm run migrate` перед `npm start`.»

- [ ] **Step 4: Записать известные отступления в спецификацию**

В конец `docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md` добавить:

```markdown
## 13. Известные отступления

- **Playwright в веб-процессе остался в двух местах:** восстановление версии
  (`POST /api/simulations/<id>/history` перерисовывает превью) и автоустановка
  встроенных примеров (`GET /api/simulations` → `ensureDemosForUser`). Генерация и
  доработка из веба ушли полностью. Перенос этих двух путей в воркер — отдельная задача.
- **Адрес сокета недоступен.** Обработчики App Router в Next 15 не получают адрес
  клиента, поэтому без `SHOWMEHOW_TRUST_PROXY=1` все входы делят один ключ IP
  (`direct`). Защиту аккаунтов по-прежнему даёт счётчик по идентификатору.
- **Отмена потерянного задания.** Если воркер потерян, а отмену уже попросили,
  уборщик не перезапускает задание, а сразу отменяет его.
- **Старые активные задания.** Миграция `005` помечает задания в статусах
  `queued` и `running` ошибкой «Сервер был перезапущен», как это делал прежний код
  при чтении. Без этого уникальные индексы могли не создаться.
```

- [ ] **Step 5: Прогнать всё**

```bash
npm test && npx tsc --noEmit && npm run build
SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npm test
```

Ожидается: PASS.

- [ ] **Step 6: Коммит**

```bash
git add -A src tests README.md docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md
git commit -m "refactor(jobs): удалить задания и ограничитель в памяти процесса

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Проверка здоровья `/api/health`

**Files:**
- Create: `src/app/api/health/route.ts`, `tests/unit/health-api.test.ts`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `getJobStore().stats()`; `healthCode` из `policy.ts`.
- Produces: `GET /api/health` без входа → `200 | 503` с телом `{ db: 'ok', queued, oldestQueuedSec, running, workersAlive, lastWorkerSeenSec }` или `503 { db: 'error' }`; `Cache-Control: no-store`. Персональных данных нет.

- [ ] **Step 1: Написать падающий тест**

`tests/unit/health-api.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET as health } from '@/app/api/health/route';
import { middleware } from '@/middleware';
import { createMemoryJobStore } from '@/lib/jobs/store-memory';
import { __setJobStoreForTests } from '@/lib/jobs/current';
import type { JobStore } from '@/lib/jobs/store';

let store: JobStore;

beforeEach(() => {
  delete process.env.DATABASE_URL;
  store = createMemoryJobStore();
  __setJobStoreForTests(store);
});

const queue = () => store.create({
  ownerId: crypto.randomUUID(), kind: 'generate', priority: 0,
  request: { prompt: 'p', mode: 'fast', hasImage: false },
});

describe('GET /api/health', () => {
  it('пустая очередь без воркеров — 200', async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      db: 'ok', queued: 0, oldestQueuedSec: null, running: 0, workersAlive: 0, lastWorkerSeenSec: null,
    });
  });

  it('очередь стоит, воркеров нет — 503', async () => {
    await queue();
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ db: 'ok', queued: 1, workersAlive: 0 });
  });

  it('живой воркер — 200', async () => {
    await queue();
    await store.heartbeat('w1', 'host', 0);
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ queued: 1, workersAlive: 1 });
  });

  it('база недоступна — 503 без подробностей', async () => {
    __setJobStoreForTests({
      ...store,
      stats: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5435'); },
    });
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ db: 'error' });
  });

  it('открыта без входа', () => {
    const res = middleware(new NextRequest('http://t/api/health'));
    expect(res.status).not.toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npx vitest run tests/unit/health-api.test.ts
```

Ожидается: FAIL — роута нет.

- [ ] **Step 3: Написать роут и открыть его**

`src/app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getJobStore } from '@/lib/jobs/current';
import { healthCode } from '@/lib/jobs/policy';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Открыта без входа: её опрашивает внешний мониторинг. Только счётчики — ни id,
 * ни промптов, ни имён. 503 — база не отвечает или очередь стоит без воркеров.
 */
export async function GET() {
  try {
    const stats = await getJobStore().stats();
    return NextResponse.json({ db: 'ok', ...stats },
      { status: healthCode(stats), headers: NO_STORE });
  } catch (e) {
    console.error('Проверка здоровья: база недоступна:', e);
    return NextResponse.json({ db: 'error' }, { status: 503, headers: NO_STORE });
  }
}
```

В `src/middleware.ts`:

```ts
// /api/health — для мониторинга; отдаёт только счётчики очереди.
const PUBLIC_PREFIXES = ['/login', '/register', '/api/auth/', '/api/health', '/lab/', '/labs/'];
```

(комментарий про лаборатории над константой сохранить).

- [ ] **Step 4: Прогнать тесты**

```bash
npx vitest run tests/unit/health-api.test.ts
npm test && npx tsc --noEmit
```

Ожидается: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/app/api/health/route.ts src/middleware.ts tests/unit/health-api.test.ts
git commit -m "feat(ops): /api/health — очередь и живость воркеров без входа

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: e2e снова зелёный

**Files:**
- Create: `e2e/auth.ts`, `e2e/global-setup.ts`
- Modify: `playwright.config.ts`, `e2e/mock-provider.ts`, `e2e/generate.spec.ts`, `e2e/reload.spec.ts`, `e2e/demos.spec.ts`

**Interfaces:**
- Consumes: `applyMigrations`; `POST /api/auth/register`; встроенный воркер (задача 8).
- Produces:
  - `signUp(page: Page, prefix: string): Promise<void>` — регистрирует нового человека; cookie сессии попадает в контекст страницы;
  - `startMockProvider(port: number, opts?: { generatorDelayMs?: number }): Promise<() => Promise<void>>`;
  - `npm run test:e2e` запускает `next dev` со встроенным воркером, мок-провайдером из переменных окружения и базой из `SHOWMEHOW_E2E_DATABASE_URL` (или `DATABASE_URL` из `.env.local`).

Почему e2e был красным: `next dev` раздавал роутам разные экземпляры модуля с картой заданий, спеки не входили в систему (после аккаунтов middleware уводит на `/login`), а ожидания библиотеки устарели (примеры теперь раскладываются сами, кнопки «Установить 10 примеров» и текста «Пока пусто» нет). Ещё одно изменение: отмена теперь доходит до пайплайна через сердцебиение, за время до 15 секунд плюс текущий шаг, поэтому спеке отмены нужен медленный генератор.

- [ ] **Step 1: Прогнать e2e и записать исходное состояние**

```bash
npm run test:e2e 2>&1 | tail -40
```

Ожидается: красные `generate`, `reload`, `demos`; записать список упавших тестов в описание коммита этой задачи.

- [ ] **Step 2: Вход и база для e2e**

`e2e/auth.ts`:

```ts
import crypto from 'node:crypto';
import type { Page } from '@playwright/test';

/** Новый человек на каждый тест: у него своя пустая очередь и своя библиотека. */
export async function signUp(page: Page, prefix: string): Promise<void> {
  const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const res = await page.request.post('/api/auth/register',
    { data: { email, password: 'e2e-demo-pass-123' } });
  if (!res.ok()) throw new Error(`Регистрация не прошла: ${res.status()} ${await res.text()}`);
}
```

`e2e/global-setup.ts`:

```ts
import fs from 'node:fs';
import { Pool } from 'pg';
import { applyMigrations } from '../scripts/migrate';

/** Dev-сервер e2e работает с настоящей базой: без неё встроенному воркеру нечего брать. */
export default async function globalSetup(): Promise<void> {
  if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
  const url = process.env.SHOWMEHOW_E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Для e2e нужна база: задайте SHOWMEHOW_E2E_DATABASE_URL или DATABASE_URL в .env.local.');
  }
  const pool = new Pool({ connectionString: url });
  try {
    await applyMigrations(pool);
  } finally {
    await pool.end();
  }
}
```

`playwright.config.ts` целиком:

```ts
import { defineConfig } from '@playwright/test';

// Провайдер задаётся окружением: оно сильнее .env.local, и e2e никогда не ходит
// в настоящую модель. Адрес — мок из e2e/mock-provider.ts.
const MOCK_PROVIDER = {
  SHOWMEHOW_API_KEY: 'test',
  SHOWMEHOW_MODEL: 'mock-gen',
  SHOWMEHOW_VISION_MODEL: 'mock-vision',
  SHOWMEHOW_BASE_URL: 'http://localhost:3399/v1',
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  globalSetup: './e2e/global-setup.ts',
  // Один воркер Playwright: спеки делят SHOWMEHOW_DATA_DIR и порт мок-провайдера.
  workers: 1,
  use: { baseURL: 'http://localhost:3300' },
  webServer: {
    command: 'npm run dev -- --port 3300',
    port: 3300,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      SHOWMEHOW_DATA_DIR: './e2e/.data',
      SHOWMEHOW_EMBEDDED_WORKER: '1',
      ...MOCK_PROVIDER,
      ...(process.env.SHOWMEHOW_E2E_DATABASE_URL
        ? { DATABASE_URL: process.env.SHOWMEHOW_E2E_DATABASE_URL } : {}),
    },
  },
});
```

В `e2e/mock-provider.ts` — задержка генератора параметром:

```ts
export function startMockProvider(
  port: number, opts: { generatorDelayMs?: number } = {},
): Promise<() => Promise<void>> {
  const delay = opts.generatorDelayMs ?? GENERATOR_DELAY_MS;
```

и внутри `req.on('end', …)` строку с `setTimeout` заменить на

```ts
      if (system.includes(GENERATOR_MARKER)) setTimeout(send, delay);
```

- [ ] **Step 3: Поправить спеки**

В каждой спеке запись `settings.json` в `beforeAll` можно оставить: провайдер теперь приходит из окружения, файл ничему не мешает.

`e2e/generate.spec.ts`: импорт `import { signUp } from './auth';`, первой строкой теста `await signUp(page, 'gen');`, а проверку библиотеки заменить на точное совпадение: встроенный пример называется «Диффузия духов в комнате».

```ts
  await page.goto('/library');
  await expect(page.getByText('Диффузия духов', { exact: true })).toBeVisible({ timeout: 240_000 });
```

`e2e/reload.spec.ts`:
- импорт `signUp`; в `beforeAll` — `stop = await startMockProvider(3399, { generatorDelayMs: 20_000 });` с комментарием «генератор отвечает долго: отмена должна успеть дойти до воркера через сердцебиение»;
- добавить `test.beforeEach(async ({ page }) => { await signUp(page, 'reload'); });` — у каждого теста свой человек, поэтому комментарий о порядке тестов удалить;
- в тесте отмены:

```ts
  await expect(page.getByText('Генерация отменена')).toBeVisible({ timeout: 45_000 });

  await page.goto('/library');
  // Примеры раскладываются при первом входе; своей симуляции среди них быть не должно.
  await expect(page.locator('.sim-card')).toHaveCount(10, { timeout: 240_000 });
  await expect(page.getByText('Диффузия духов', { exact: true })).toHaveCount(0);
```

- в тесте перезагрузки проверку библиотеки заменить так же, как в `generate.spec.ts`, а ожидание превью после перезагрузки поднять до `{ timeout: 120_000 }`.

`e2e/demos.spec.ts` целиком:

```ts
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { signUp } from './auth';

test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
});

test('новый человек получает десять встроенных примеров', async ({ page }) => {
  await signUp(page, 'demos');
  await page.goto('/library');
  // Превью рендерятся на сервере при первом заходе — ждём с запасом.
  await expect(page.locator('.sim-card')).toHaveCount(10, { timeout: 240_000 });
  await expect(page.getByText('Диффузия духов в комнате')).toBeVisible();
  await expect(page.getByText('Математический маятник')).toBeVisible();
  await expect(page.getByText('Осмос через полупроницаемую мембрану')).toBeVisible();
});
```

Если какого-то из этих заголовков нет в `demos/*/meta.json`, взять заголовок оттуда.

- [ ] **Step 4: Прогнать e2e**

```bash
SHOWMEHOW_E2E_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npm run test:e2e
```

Ожидается: весь набор зелёный. Если что-то осталось красным по причинам вне цикла (например, рендер превью на медленной машине), разобрать по superpowers:systematic-debugging. Если причина всё же вне цикла, дописать в раздел «13. Известные отступления» спецификации пункт «**e2e:** тест …, причина …, что нужно, чтобы починить» — замалчивать нельзя.

- [ ] **Step 5: Коммит**

```bash
git add e2e playwright.config.ts docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md
git commit -m "test(e2e): вход в спеках, встроенный воркер и мок-провайдер из окружения

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Бэкапы и документы эксплуатации

**Files:**
- Create: `scripts/backup.sh`, `tests/unit/backup-script.test.ts`, `ops/systemd/teseract-worker.service`, `ops/systemd/teseract-backup.service`, `ops/systemd/teseract-backup.timer`, `ops/systemd/showmehow-override.conf`, `ops/caddy/teseract.caddy`, `docs/ops/deploy.md`, `docs/ops/restore.md`

**Interfaces:**
- Consumes: контейнер `teseract-pg` (база и пользователь `teseract`), каталог `/home/user/teseract/data`.
- Produces:
  - `scripts/backup.sh` — переменные `TESERACT_ROOT` (по умолчанию `/home/user/teseract`), `TESERACT_BACKUP_DIR` (`$HOME/teseract-backups`), `TESERACT_PG_CONTAINER` (`teseract-pg`), `TESERACT_PG_USER` и `TESERACT_PG_DB` (`teseract`), `TESERACT_BACKUP_KEEP_DAYS` (`14`), `TESERACT_BACKUP_STAMP` (`date +%F`, нужен тестам); код выхода 0 при успехе и не 0 при любой ошибке;
  - `ops/systemd/*`, `ops/caddy/teseract.caddy` — готовые тексты юнитов и блока сайта; путь к `node`/`npm` и домен подставляются при установке через `sed`;
  - `docs/ops/deploy.md` — службы, переменные, установка, порядок выкладки;
  - `docs/ops/restore.md` — процедура восстановления и журнал проверок.

- [ ] **Step 1: Написать падающий тест скрипта**

`tests/unit/backup-script.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = path.resolve('scripts/backup.sh');
const hasTools = ['bash', 'rsync', 'gzip'].every((t) => spawnSync(t, ['--version']).status === 0);

let root: string;
let dest: string;
let bin: string;

/** Подменный docker: печатает «дамп» или падает, если так попросили. */
function fakeDocker(fail: boolean): void {
  fs.writeFileSync(path.join(bin, 'docker'), fail
    ? '#!/bin/sh\necho "no such container" >&2\nexit 3\n'
    : '#!/bin/sh\necho "-- dump for: $*"\n', { mode: 0o755 });
}

function run(stamp: string) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TESERACT_ROOT: root,
      TESERACT_BACKUP_DIR: dest,
      TESERACT_BACKUP_STAMP: stamp,
    },
  });
}

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-backup-'));
  root = path.join(base, 'app');
  dest = path.join(base, 'backups');
  bin = path.join(base, 'bin');
  fs.mkdirSync(path.join(root, 'data', 'simulations', 'a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'simulations', 'a', 'artifact.html'), '<html></html>');
  fs.mkdirSync(bin);
});

describe.skipIf(!hasTools)('scripts/backup.sh', () => {
  it('пишет сжатый дамп и копию data/', () => {
    fakeDocker(false);
    const r = run('2026-09-17');
    expect(r.status).toBe(0);
    const dump = path.join(dest, 'db', '2026-09-17.sql.gz');
    expect(spawnSync('gzip', ['-dc', dump], { encoding: 'utf8' }).stdout)
      .toContain('pg_dump -U teseract --no-owner teseract');
    expect(fs.readFileSync(path.join(dest, 'data', '2026-09-17', 'simulations', 'a', 'artifact.html'), 'utf8'))
      .toBe('<html></html>');
    expect(r.stdout).toContain('готово');
  });

  it('неизменённые файлы — жёсткие ссылки на прошлую копию', () => {
    fakeDocker(false);
    expect(run('2026-09-16').status).toBe(0);
    expect(run('2026-09-17').status).toBe(0);
    const file = (d: string) => path.join(dest, 'data', d, 'simulations', 'a', 'artifact.html');
    expect(fs.statSync(file('2026-09-17')).ino).toBe(fs.statSync(file('2026-09-16')).ino);
  });

  it('удаляет копии старше срока хранения', () => {
    fakeDocker(false);
    fs.mkdirSync(path.join(dest, 'db'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'db', '2000-01-01.sql.gz'), '');
    fs.mkdirSync(path.join(dest, 'data', '2000-01-01'), { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    expect(run(today).status).toBe(0);
    expect(fs.existsSync(path.join(dest, 'db', '2000-01-01.sql.gz'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'data', '2000-01-01'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'db', `${today}.sql.gz`))).toBe(true);
  });

  it('сбой дампа — ненулевой код и никакого «готового» файла', () => {
    fakeDocker(true);
    const r = run('2026-09-17');
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(dest, 'db', '2026-09-17.sql.gz'))).toBe(false);
    expect(r.stdout + r.stderr).toContain('ОШИБКА');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npx vitest run tests/unit/backup-script.test.ts
```

Ожидается: FAIL — скрипта нет.

- [ ] **Step 3: Написать скрипт**

`scripts/backup.sh`:

```bash
#!/usr/bin/env bash
# Ежесуточный бэкап Tesseract: дамп базы и копия data/ с жёсткими ссылками.
# Трогает только свои каталоги. При любой ошибке выходит с ненулевым кодом —
# systemd помечает запуск сбоем.
set -Eeuo pipefail

ROOT="${TESERACT_ROOT:-/home/user/teseract}"
DEST="${TESERACT_BACKUP_DIR:-$HOME/teseract-backups}"
CONTAINER="${TESERACT_PG_CONTAINER:-teseract-pg}"
DB_USER="${TESERACT_PG_USER:-teseract}"
DB_NAME="${TESERACT_PG_DB:-teseract}"
KEEP_DAYS="${TESERACT_BACKUP_KEEP_DAYS:-14}"
STAMP="${TESERACT_BACKUP_STAMP:-$(date +%F)}"

log() { echo "[backup $(date '+%F %T')] $*"; }
fail() { log "ОШИБКА: $*"; exit 1; }
trap 'fail "команда в строке $LINENO завершилась с кодом $?"' ERR

[ -d "$ROOT/data" ] || fail "нет каталога $ROOT/data"
mkdir -p "$DEST/db" "$DEST/data"

# 1. База. Пишем во временный файл: оборванный дамп не должен выглядеть готовым.
dump="$DEST/db/$STAMP.sql.gz"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" --no-owner "$DB_NAME" | gzip > "$dump.part"
gzip -t < "$dump.part"
mv "$dump.part" "$dump"
log "дамп базы: $dump ($(du -h "$dump" | cut -f1))"

# 2. Файлы. Неизменённые файлы становятся жёсткими ссылками на предыдущую копию.
target="$DEST/data/$STAMP"
prev="$(find "$DEST/data" -mindepth 1 -maxdepth 1 -type d ! -name "$STAMP" ! -name '*.part' | sort | tail -n 1)"
rm -rf "$target.part"
if [ -n "$prev" ]; then
  rsync -a --delete --link-dest="$prev" "$ROOT/data/" "$target.part/"
else
  rsync -a --delete "$ROOT/data/" "$target.part/"
fi
rm -rf "$target"
mv "$target.part" "$target"
log "копия data/: $target${prev:+ (ссылки на $prev)}"

# 3. Ротация по дате в имени: время изменения каталога rsync берёт из источника.
cutoff="$(date -d "$KEEP_DAYS days ago" +%F 2>/dev/null || date -v-"$KEEP_DAYS"d +%F)"
for f in "$DEST"/db/*.sql.gz; do
  [ -e "$f" ] || continue
  name="$(basename "$f" .sql.gz)"
  if [[ "$name" < "$cutoff" ]]; then rm -f "$f"; log "удалён старый дамп $name"; fi
done
for d in "$DEST"/data/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  if [[ "$name" < "$cutoff" ]]; then rm -rf "$d"; log "удалена старая копия $name"; fi
done

log "готово"
```

```bash
chmod +x scripts/backup.sh
```

- [ ] **Step 4: Написать юниты и блок сайта**

`ops/systemd/teseract-worker.service`:

```ini
[Unit]
Description=Tesseract worker (очередь генераций)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/teseract
EnvironmentFile=/home/user/teseract/.env.local
Environment=NODE_ENV=production
Environment=WORKER_CONCURRENCY=2
Environment=WORKER_DRAIN_SECONDS=600
# node напрямую, без npm: SIGTERM должен прийти в процесс воркера.
ExecStart=/usr/bin/node --import tsx scripts/worker.ts
# SIGTERM — только главному процессу: Chromium доделывает текущие рендеры.
KillMode=mixed
KillSignal=SIGTERM
# Воркер ждёт задания до 600 секунд, systemd — на минуту дольше.
TimeoutStopSec=660
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`ops/systemd/teseract-backup.service`:

```ini
[Unit]
Description=Tesseract backup (дамп базы и копия data/)

[Service]
Type=oneshot
User=user
ExecStart=/home/user/teseract/scripts/backup.sh
```

`ops/systemd/teseract-backup.timer`:

```ini
[Unit]
Description=Tesseract backup каждый день в 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

`ops/systemd/showmehow-override.conf` (`/usr/bin/npm` и аргументы сверить со строкой `ExecStart` службы `showmehow` при установке):

```ini
[Service]
Environment=SHOWMEHOW_TRUST_PROXY=1
ExecStart=
ExecStart=/usr/bin/npm start -- -H 127.0.0.1
```

`ops/caddy/teseract.caddy`:

```
TESERACT_DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3100 {
		flush_interval -1
	}
}
```

- [ ] **Step 5: Написать `docs/ops/deploy.md`**

````markdown
# Tesseract: службы и выкладка

Машина общая. Трогаем только своё: `/home/user/teseract`, `/home/user/showmehow`
(прежняя версия, откат), службы `showmehow` и `teseract-*`, контейнер `teseract-pg`
и блок сайта Tesseract в Caddy. **`git reset --hard` на сервере не выполнять никогда.**

## Процессы

| Служба | Что | Порт |
|---|---|---|
| `showmehow` | веб (`npm start`), имя историческое | `127.0.0.1:3100` |
| `teseract-worker` | воркер очереди генераций | — |
| `teseract-backup.timer` | бэкап в 03:00 | — |
| `teseract-pg` (Docker) | Postgres 16 | `127.0.0.1:5435` |
| Caddy | HTTPS для `<домен>` → `127.0.0.1:3100` | 443 |

## Переменные

Все лежат в `/home/user/teseract/.env.local` (вне git), обе службы читают их через
`EnvironmentFile`.

| Переменная | Кто читает | Значение на боевом |
|---|---|---|
| `DATABASE_URL` | веб, воркер, миграции | `postgres://teseract:…@127.0.0.1:5435/teseract` |
| `SHOWMEHOW_ADMIN_EMAIL` | веб | почта администратора |
| `SHOWMEHOW_TRUST_PROXY` | веб | `1` — только когда перед вебом Caddy |
| `SHOWMEHOW_EMBEDDED_WORKER` | веб | не задавать (в продакшне выключен) |
| `WORKER_CONCURRENCY` | воркер | `2` |
| `WORKER_DRAIN_SECONDS` | воркер | `600` |

Ключ провайдера лежит в `/home/user/teseract/data/settings.json`.

## Юнит воркера

Текст юнита — `ops/systemd/teseract-worker.service`. `ExecStart` там с `/usr/bin/node`; при установке путь заменяется на настоящий (см. «Установка»).

## Веб за Caddy

Дополнение к `showmehow` ставится в `/etc/systemd/system/showmehow.service.d/override.conf`: веб слушает только `127.0.0.1`, `x-forwarded-for` доверяется.
Текст — `ops/systemd/showmehow-override.conf`; `ExecStart` там с `/usr/bin/npm`, при установке заменяется на путь из `systemctl cat showmehow`.

Блок сайта добавляется в конфигурацию Caddy, остальные сайты не трогаются. Текст — `ops/caddy/teseract.caddy`, домен в нём — `TESERACT_DOMAIN`, при установке заменяется на настоящий.

`flush_interval -1` отключает буферизацию — без него SSE прогресса приходит пачками.
Cookie получает `Secure` сама: `isSecureRequest` смотрит на `x-forwarded-proto`.

## Бэкап

Юниты — `ops/systemd/teseract-backup.service` и `ops/systemd/teseract-backup.timer`.

Копии: `~/teseract-backups/db/<дата>.sql.gz` и `~/teseract-backups/data/<дата>/`,
хранятся 14 дней. Журнал: `journalctl -u teseract-backup`. Внешней копии пока нет —
площадку должен дать владелец.

## Установка

Выполняется один раз, только с подтверждения владельца (задача 16 плана цикла 1).

```bash
cd /home/user/teseract
NODE=$(which node); NPM=$(which npm)        # под пользователем user
sed "s#/usr/bin/node#$NODE#" ops/systemd/teseract-worker.service \
  | sudo tee /etc/systemd/system/teseract-worker.service > /dev/null
sudo cp ops/systemd/teseract-backup.service ops/systemd/teseract-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teseract-worker teseract-backup.timer

# только когда есть домен и Caddy проксирует его:
sed "s#TESERACT_DOMAIN#<домен>#" ops/caddy/teseract.caddy     # дописать в конфигурацию Caddy
sudo caddy validate --config <Caddyfile> --adapter caddyfile && sudo systemctl reload caddy
sudo mkdir -p /etc/systemd/system/showmehow.service.d
sed "s#/usr/bin/npm#$NPM#" ops/systemd/showmehow-override.conf \
  | sudo tee /etc/systemd/system/showmehow.service.d/override.conf > /dev/null
sudo systemctl daemon-reload && sudo systemctl restart showmehow
```

## Выкладка

```bash
cd /home/user/teseract
git fetch origin <ветка>
git merge --ff-only origin/<ветка>        # остановится, если на сервере свои коммиты
npm ci                                     # только если менялся package-lock.json
set -a; . ./.env.local; set +a
npm run migrate                            # миграции совместимы с работающим кодом
npm run build
sudo systemctl restart showmehow
sudo systemctl restart teseract-worker     # ждёт текущие генерации до 10 минут
curl -s http://127.0.0.1:3100/api/health
```

Рестарт веба генерации не прерывает: их ведёт воркер, мастерская переподключается
сама. Рестарт воркера ждёт текущие задания; недоделанные за 10 минут подберёт
уборщик после старта.

**Миграция 005** помечает ошибкой задания, которые вёл в памяти старый код. Выкладывать
её лучше, когда `SELECT count(*) FROM jobs WHERE status IN ('queued','running')` даёт 0.

## Проверка

- `curl -s https://<домен>/api/health` — `200`, `workersAlive` ≥ 1;
- `systemctl status teseract-worker` — `active (running)`;
- `journalctl -u teseract-worker -n 50` — «Воркер … запущен», «…взял задание…»;
- `systemctl list-timers teseract-backup.timer` — следующий запуск в 03:00.
````

- [ ] **Step 6: Написать `docs/ops/restore.md`**

````markdown
# Tesseract: восстановление из бэкапа

Процедура поднимает копию рядом с боевой и ничего боевого не трогает: отдельный
контейнер, отдельный порт, отдельный каталог данных.

## Шаги

```bash
DATE=2026-09-18                                   # дата копии
WORK=$HOME/teseract-restore-check

# 1. Чистый Postgres на свободном локальном порту.
docker run -d --name teseract-restore-pg -e POSTGRES_USER=teseract \
  -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=teseract \
  -p 127.0.0.1:5437:5432 postgres:16-alpine
until docker exec teseract-restore-pg pg_isready -U teseract; do sleep 1; done

# 2. Дамп.
gunzip -c ~/teseract-backups/db/$DATE.sql.gz | docker exec -i teseract-restore-pg psql -U teseract -d teseract -v ON_ERROR_STOP=1

# 3. Данные — копией, а не ссылками: проверка не должна менять бэкап.
mkdir -p $WORK && cp -a ~/teseract-backups/data/$DATE $WORK/data

# 4. Приложение на копии.
cd /home/user/teseract
export DATABASE_URL=postgres://teseract:restore@127.0.0.1:5437/teseract
export SHOWMEHOW_DATA_DIR=$WORK/data
npm run migrate                                   # «Новых миграций нет»
npx next start -H 127.0.0.1 -p 3199 &

# 5. Вход: временный пароль администратору в копии базы.
npm run org -- reset-password --user nurkal836@gmail.com
```

Дальше через ssh-туннель (`ssh -L 3199:127.0.0.1:3199 user@95.141.135.244`) открыть
`http://localhost:3199`, войти с временным паролем, сменить его, открыть библиотеку и любую
симуляцию, убедиться, что превью и сама симуляция показываются.

## Уборка

```bash
kill %1
docker rm -f teseract-restore-pg
rm -rf $WORK
```

## Журнал проверок

| Дата | Копия | Размер дампа | Время восстановления | Результат | Кто |
|---|---|---|---|---|---|
````

- [ ] **Step 7: Прогнать тесты**

```bash
npx vitest run tests/unit/backup-script.test.ts
systemd-analyze verify ops/systemd/*.service 2>/dev/null || echo "systemd-analyze есть только на Linux — проверка юнитов переносится на сервер"
bash -n scripts/backup.sh
npm test && npx tsc --noEmit
```

Ожидается: PASS; `bash -n` без ошибок.

- [ ] **Step 8: Коммит**

```bash
git add scripts/backup.sh tests/unit/backup-script.test.ts ops docs/ops/deploy.md docs/ops/restore.md
git commit -m "feat(ops): скрипт бэкапа, службы systemd, Caddy и процедура восстановления

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Нагрузочный прогон — скрипт и отчёт

**Files:**
- Create: `scripts/load/stats.ts`, `scripts/load/run.ts`, `scripts/load/mock-provider.ts`, `tests/unit/load-stats.test.ts`, `docs/ops/load-2026-09.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: HTTP API приложения (`/api/auth/register`, `/api/auth/login`, `/api/simulations`, `/api/generate`, `/api/jobs/[id]/stream`, `/library`, `/`); `SESSION_COOKIE`; `REQUEUE_WARNING`; `startMockProvider(port, { generatorDelayMs })` (задача 13).
- Produces:
  - `percentile(values: number[], p: number): number`, `summarize(latencies: number[], errors?: number): Summary`, `interface Summary { count: number; errors: number; p50: number; p95: number; max: number }`, `isNonIncreasing(values: number[]): boolean`, `reportSection(title: string, rows: [string, string][], passed: boolean): string`;
  - `npm run load -- --base <url> --scenario pages|logins|generations|kill-worker|restart-web [--users 30] [--sessions 300] [--rounds 3] [--out docs/ops/load-2026-09.md] [--kill-cmd "…"] [--restart-cmd "…"]` — код выхода 1, если цель сценария не достигнута;
  - `npm run load:mock` — мок-провайдер на `MOCK_PORT` (3399) с задержкой генератора `MOCK_GENERATOR_DELAY_MS` (20000).

Сценарии и цели — из раздела 10 спецификации:

| Сценарий | `--scenario` | Цель |
|---|---|---|
| 300 одновременных сессий открывают библиотеку и страницу симуляции | `pages` | p95 < 500 мс |
| 300 входов за минуту с одного IP, 10 % с ошибкой | `logins` | ни одного 429 для верных |
| 20 генераций одновременно при двух воркерах по 2 слота | `generations` | все завершаются; позиции честные; p95 страниц не хуже прогона без генераций более чем вдвое |
| `kill -9` воркера посреди генерации | `kill-worker` | задание перезапущено и завершено вторым воркером |
| Рестарт веба посреди генерации | `restart-web` | SSE переподключается, прогресс не теряется |

300 сессий делятся между 30 пользователями по 10 входов. Иначе подготовка разложила бы примеры 300 раз, и каждый раз с рендером превью в Chromium.

- [ ] **Step 1: Написать падающий тест статистики**

`tests/unit/load-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { percentile, summarize, isNonIncreasing, reportSection } from '../../scripts/load/stats';

describe('статистика нагрузочного прогона', () => {
  it('перцентиль по рангу', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile([7], 95)).toBe(7);
    expect(Number.isNaN(percentile([], 95))).toBe(true);
  });

  it('сводка не зависит от порядка', () => {
    expect(summarize([30, 10, 20], 1)).toEqual({ count: 3, errors: 1, p50: 20, p95: 30, max: 30 });
  });

  it('позиция в очереди только убывает', () => {
    expect(isNonIncreasing([5, 4, 4, 1])).toBe(true);
    expect(isNonIncreasing([])).toBe(true);
    expect(isNonIncreasing([2, 3])).toBe(false);
  });

  it('раздел отчёта', () => {
    const md = reportSection('Страницы', [['p95', '120 мс']], true);
    expect(md).toContain('### Страницы — цель достигнута');
    expect(md).toContain('| p95 | 120 мс |');
    expect(reportSection('Входы', [], false)).toContain('цель НЕ достигнута');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npx vitest run tests/unit/load-stats.test.ts
```

Ожидается: FAIL — нет `scripts/load/stats.ts`.

- [ ] **Step 3: Написать статистику**

`scripts/load/stats.ts`:

```ts
export interface Summary {
  count: number;
  errors: number;
  p50: number;
  p95: number;
  max: number;
}

/** Перцентиль по рангу (nearest-rank): значение, не меньше которого p% выборки. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function summarize(latencies: number[], errors = 0): Summary {
  return {
    count: latencies.length,
    errors,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    max: latencies.length ? Math.max(...latencies) : Number.NaN,
  };
}

/** «Позиции честные»: место в очереди у задания может только уменьшаться. */
export function isNonIncreasing(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v <= values[i - 1]);
}

export function reportSection(title: string, rows: [string, string][], passed: boolean): string {
  const verdict = passed ? 'цель достигнута' : 'цель НЕ достигнута';
  return [
    `### ${title} — ${verdict}`,
    '',
    '| Показатель | Значение |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Написать прогон и мок**

`scripts/load/run.ts`:

```ts
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { SESSION_COOKIE } from '../../src/lib/auth/session-cookie';
import { REQUEUE_WARNING } from '../../src/lib/jobs/store';
import type { PipelineEvent } from '../../src/lib/types';
import { isNonIncreasing, reportSection, summarize, type Summary } from './stats';

interface Args {
  base: string; scenario: string; users: number; sessions: number; rounds: number;
  out?: string; killCmd?: string; restartCmd?: string;
}

interface LoadUser { email: string; cookie: string; simId: string }

const PASSWORD = 'load-test-pass-123';
const PAGE_P95_TARGET_MS = 500;

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const base = get('base');
  const scenario = get('scenario');
  if (!base || !scenario) {
    throw new Error('Нужны --base <адрес> и --scenario pages|logins|generations|kill-worker|restart-web.');
  }
  return {
    base: base.replace(/\/$/, ''),
    scenario,
    users: Number(get('users') ?? 30),
    sessions: Number(get('sessions') ?? 300),
    rounds: Number(get('rounds') ?? 3),
    out: get('out'),
    killCmd: get('kill-cmd'),
    restartCmd: get('restart-cmd'),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sessionCookie(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) throw new Error(`Сервер не выдал cookie сессии (код ${res.status}).`);
  return raw.split(';')[0];
}

function login(base: string, identifier: string, password: string): Promise<Response> {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
}

async function signIn(base: string, email: string): Promise<string> {
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (reg.ok) return sessionCookie(reg);
  const res = await login(base, email, PASSWORD);
  if (!res.ok) throw new Error(`Не удалось войти как ${email}: ${res.status}`);
  return sessionCookie(res);
}

async function inPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** Подготовка не входит в замеры: первый заход раскладывает примеры с рендером превью. */
async function prepareUsers(a: Args): Promise<LoadUser[]> {
  const users: LoadUser[] = [];
  const emails = Array.from({ length: a.users }, (_, i) => `load-${i}@example.test`);
  await inPool(emails, 2, async (email) => {
    const cookie = await signIn(a.base, email);
    const res = await fetch(`${a.base}/api/simulations`, { headers: { cookie } });
    const list = (await res.json()) as { id: string }[];
    if (!list[0]) throw new Error(`У ${email} пустая библиотека: примеры не разложились.`);
    users.push({ email, cookie, simId: list[0].id });
  });
  console.log(`Подготовлено пользователей: ${users.length}.`);
  return users;
}

async function pageLatencies(a: Args, users: LoadUser[], rounds: number): Promise<Summary> {
  const perUser = Math.ceil(a.sessions / users.length);
  const sessions: LoadUser[] = [];
  for (const u of users) {
    for (let i = 0; i < perUser && sessions.length < a.sessions; i++) {
      sessions.push({ ...u, cookie: sessionCookie(await login(a.base, u.email, PASSWORD)) });
    }
  }
  const latencies: number[] = [];
  let errors = 0;
  for (let r = 0; r < rounds; r++) {
    await Promise.all(sessions.map(async (s) => {
      for (const path of ['/library', '/api/simulations', `/api/simulations/${s.simId}`, `/?id=${s.simId}`]) {
        const t0 = performance.now();
        try {
          const res = await fetch(`${a.base}${path}`, { headers: { cookie: s.cookie } });
          await res.arrayBuffer();
          if (!res.ok) errors++;
        } catch {
          errors++;
        }
        latencies.push(performance.now() - t0);
      }
    }));
  }
  return summarize(latencies, errors);
}

const ms = (v: number) => `${Math.round(v)} мс`;

async function pages(a: Args): Promise<[string, [string, string][], boolean]> {
  const s = await pageLatencies(a, await prepareUsers(a), a.rounds);
  return ['300 сессий: библиотека и страница симуляции', [
    ['запросов', String(s.count)], ['ошибок', String(s.errors)],
    ['p50', ms(s.p50)], ['p95', ms(s.p95)], ['максимум', ms(s.max)],
  ], s.p95 < PAGE_P95_TARGET_MS && s.errors === 0];
}

async function logins(a: Args): Promise<[string, [string, string][], boolean]> {
  const users = await prepareUsers(a);
  const total = 300;
  let correct429 = 0;
  let correctOther = 0;
  let wrong = 0;
  const pending: Promise<void>[] = [];
  for (let i = 0; i < total; i++) {
    const isWrong = i % 10 === 9;
    const u = users[i % users.length];
    pending.push((async () => {
      const res = await login(a.base, u.email, isWrong ? 'неверный-пароль' : PASSWORD);
      if (isWrong) wrong++;
      else if (res.status === 429) correct429++;
      else if (res.status !== 200) correctOther++;
    })());
    await sleep(60_000 / total);
  }
  await Promise.all(pending);
  return ['300 входов за минуту с одного IP', [
    ['верных', String(total - wrong)], ['с ошибкой', String(wrong)],
    ['429 для верных', String(correct429)], ['иные отказы верным', String(correctOther)],
  ], correct429 === 0 && correctOther === 0];
}

interface Followed { status: string; events: PipelineEvent[]; positions: number[]; reconnects: number }

/** Идёт за заданием как мастерская: при обрыве переподключается и читает журнал заново. */
async function follow(
  a: Args, cookie: string, jobId: string, onEvent?: (e: PipelineEvent) => void,
): Promise<Followed> {
  const positions: number[] = [];
  let reconnects = 0;
  let longest = 0;
  for (let attempt = 0; attempt < 120; attempt++) {
    const events: PipelineEvent[] = [];
    try {
      const res = await fetch(`${a.base}/api/jobs/${jobId}/stream`, { headers: { cookie } });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop()!;
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            const e = JSON.parse(part.slice(6)) as PipelineEvent;
            if (e.type === 'queued') positions.push(e.position);
            else events.push(e);
            onEvent?.(e);
            if (e.type === 'done' || e.type === 'error' || e.type === 'cancelled') {
              if (events.length < longest) throw new Error(`Журнал ${jobId} после переподключения короче.`);
              return { status: e.type, events, positions, reconnects };
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Журнал')) throw e;
    }
    longest = Math.max(longest, events.length);
    reconnects++;
    await sleep(3000);
  }
  return { status: 'lost', events: [], positions, reconnects };
}

async function startGeneration(a: Args, u: LoadUser): Promise<string> {
  const res = await fetch(`${a.base}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: u.cookie },
    body: JSON.stringify({ prompt: 'диффузия духов в комнате', mode: 'fast' }),
  });
  if (!res.ok) throw new Error(`Генерация для ${u.email} не принята: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { jobId: string }).jobId;
}

async function generations(a: Args): Promise<[string, [string, string][], boolean]> {
  const users = await prepareUsers(a);
  const baseline = await pageLatencies(a, users, 1);
  const runners = users.slice(0, 20);
  const jobs = await Promise.all(runners.map((u) => startGeneration(a, u)));
  const [followed, loaded] = await Promise.all([
    Promise.all(jobs.map((id, i) => follow(a, runners[i].cookie, id))),
    pageLatencies(a, users, 1),
  ]);
  const done = followed.filter((f) => f.status === 'done').length;
  const honest = followed.every((f) => isNonIncreasing(f.positions));
  const maxPos = Math.max(0, ...followed.flatMap((f) => f.positions));
  const ratio = loaded.p95 / baseline.p95;
  return ['20 генераций при двух воркерах по два слота', [
    ['завершено', `${done} из ${jobs.length}`],
    ['позиции только убывали', honest ? 'да' : 'нет'],
    ['наибольшая позиция', String(maxPos)],
    ['p95 страниц без генераций', ms(baseline.p95)],
    ['p95 страниц с генерациями', ms(loaded.p95)],
    ['отношение', ratio.toFixed(2)],
  ], done === jobs.length && honest && ratio <= 2];
}

async function interrupted(
  a: Args, title: string, cmd: string | undefined, flag: string,
  check: (f: Followed) => boolean,
): Promise<[string, [string, string][], boolean]> {
  if (!cmd) throw new Error(`Для этого сценария нужен ${flag} "<команда>".`);
  const [u] = await prepareUsers({ ...a, users: 1 });
  const jobId = await startGeneration(a, u);
  let fired = false;
  const f = await follow(a, u.cookie, jobId, (e) => {
    if (!fired && e.type === 'plan-ready') {
      fired = true;
      console.log(`Выполняю: ${cmd}`);
      execSync(cmd, { stdio: 'inherit' });
    }
  });
  return [title, [
    ['итог задания', f.status],
    ['переподключений', String(f.reconnects)],
    ['событий в журнале', String(f.events.length)],
    ['предупреждение о перезапуске', f.events.some((e) => e.type === 'warning' && e.message === REQUEUE_WARNING) ? 'да' : 'нет'],
  ], fired && f.status === 'done' && check(f)];
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const scenarios: Record<string, () => Promise<[string, [string, string][], boolean]>> = {
    pages: () => pages(a),
    logins: () => logins(a),
    generations: () => generations(a),
    'kill-worker': () => interrupted(a, 'kill -9 воркера посреди генерации', a.killCmd, '--kill-cmd',
      (f) => f.events.some((e) => e.type === 'warning' && e.message === REQUEUE_WARNING)),
    'restart-web': () => interrupted(a, 'Рестарт веба посреди генерации', a.restartCmd, '--restart-cmd',
      (f) => f.reconnects >= 1),
  };
  const run = scenarios[a.scenario];
  if (!run) throw new Error(`Неизвестный сценарий ${a.scenario}.`);
  const [title, rows, passed] = await run();
  const section = reportSection(`${title} (${new Date().toISOString().slice(0, 16)})`, rows, passed);
  console.log(section);
  if (a.out) fs.appendFileSync(a.out, `\n${section}`);
  process.exitCode = passed ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

`scripts/load/mock-provider.ts`:

```ts
import { startMockProvider } from '../../e2e/mock-provider';

// Мок модели для нагрузочного прогона: генератор отвечает медленно, чтобы генерации
// успели выстроиться в очередь и их можно было прервать посередине.
const port = Number(process.env.MOCK_PORT ?? 3399);
const delay = Number(process.env.MOCK_GENERATOR_DELAY_MS ?? 20000);
await startMockProvider(port, { generatorDelayMs: delay });
console.log(`Мок-провайдер слушает :${port}, задержка генератора ${delay} мс.`);
```

`package.json`, в `scripts`:

```json
    "load": "tsx scripts/load/run.ts",
    "load:mock": "tsx scripts/load/mock-provider.ts",
```

`docs/ops/load-2026-09.md`:

```markdown
# Нагрузочный прогон, сентябрь 2026

Спецификация: `docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md`, раздел 10.

## Стенд

Копия приложения на боевой машине: отдельный каталог, отдельный контейнер Postgres,
веб на `127.0.0.1:3200`, два воркера по два слота, мок-провайдер с задержкой
генератора 20 секунд. Боевые службы и база в прогоне не участвуют. Подробности и
команды — задача 16 плана `docs/superpowers/plans/2026-09-17-worker-queue-ops.md`.

| Сценарий | Цель |
|---|---|
| 300 одновременных сессий открывают библиотеку и страницу симуляции | p95 < 500 мс |
| 300 входов за минуту с одного IP, 10 % с ошибкой | ни одного 429 для верных |
| 20 генераций одновременно при двух воркерах по 2 слота | все завершаются; позиции честные; p95 страниц не хуже прогона без генераций более чем вдвое |
| `kill -9` воркера посреди генерации | задание перезапущено и завершено вторым воркером |
| Рестарт веба посреди генерации | SSE переподключается, прогресс не теряется |

## Результаты

Разделы ниже дописывает `npm run load -- … --out docs/ops/load-2026-09.md`.
```

- [ ] **Step 5: Прогнать тесты и сделать сухой прогон локально**

```bash
npx vitest run tests/unit/load-stats.test.ts
npm test && npx tsc --noEmit
```

Локально, с `npm run build`, одним вебом без встроенного воркера и двумя воркерами:

```bash
npm run load:mock &
SHOWMEHOW_API_KEY=test SHOWMEHOW_MODEL=mock-gen SHOWMEHOW_VISION_MODEL=mock-vision \
  SHOWMEHOW_BASE_URL=http://localhost:3399/v1 SHOWMEHOW_TRUST_PROXY=1 npx next start -p 3200 &
for i in 1 2; do SHOWMEHOW_API_KEY=test SHOWMEHOW_MODEL=mock-gen SHOWMEHOW_VISION_MODEL=mock-vision \
  SHOWMEHOW_BASE_URL=http://localhost:3399/v1 npm run worker & done
npm run load -- --base http://127.0.0.1:3200 --scenario pages --users 3 --sessions 30 --rounds 1
npm run load -- --base http://127.0.0.1:3200 --scenario kill-worker \
  --kill-cmd "kill -9 \$(psql \"\$DATABASE_URL\" -tAc \"SELECT split_part(locked_by, ':', 2) FROM jobs WHERE status = 'running' LIMIT 1\")"
```

Команда убивает именно тот воркер, что держит задание: в `locked_by` записан `host:pid:суффикс`.

Ожидается: оба сценария печатают раздел отчёта. `kill-worker` завершается «цель достигнута» примерно через две минуты: аренда 60 секунд, запас 30 секунд, уборщик раз в 30 секунд. Результаты локального прогона в отчёт не записывать. После прогона остановить фоновые процессы (`kill %1 %2 %3 %4`) и удалить учётки `load-*@example.test` из локальной базы.

- [ ] **Step 6: Коммит**

```bash
git add scripts/load tests/unit/load-stats.test.ts docs/ops/load-2026-09.md package.json
git commit -m "feat(ops): сценарии нагрузочного прогона и шаблон отчёта

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Эксплуатация на сервере

> **⚠ ТОЛЬКО С ПОДТВЕРЖДЕНИЯ ВЛАДЕЛЬЦА.** Всё в этой задаче выполняется на общей боевой машине `95.141.135.244`. Перед каждым блоком, помеченным **СТОП**, нужно получить явный ответ владельца в чате. Агент не начинает задачу сам после задачи 15: он сообщает, что код готов, и ждёт. Запрещено: `git reset --hard`, правка чужих служб, сайтов Caddy и контейнеров, перезапуск Docker и Caddy целиком (только `caddy reload` после `caddy validate`), любые действия с `/home/user/showmehow`, кроме чтения.

**Files:**
- Modify: `docs/ops/restore.md` (журнал проверок), `docs/ops/load-2026-09.md` (результаты), `docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md` (статус приёмки), заметка памяти `/Users/nurlykhan/.claude/projects/-Users-nurlykhan-pets-ShowMeHow/memory/tesseract-server-access.md`
- На сервере (копии файлов из `ops/`): `/etc/systemd/system/teseract-worker.service`, `/etc/systemd/system/teseract-backup.{service,timer}`, `/etc/systemd/system/showmehow.service.d/override.conf`, блок сайта Tesseract в конфигурации Caddy

**Interfaces:**
- Consumes: ветка `worker-queue-ops`, влитая по решению владельца; `docs/ops/deploy.md`, `docs/ops/restore.md`, `scripts/backup.sh`, `scripts/load/*`.
- Produces: закрытые пункты 6–9 критериев приёмки, записанные в спецификацию.

Вход: `ssh -o PubkeyAuthentication=no user@95.141.135.244`. Пароль спросить у владельца, в файлы и память не записывать.

- [ ] **Step 1: СТОП — получить от владельца**

Спросить одним сообщением:
1. разрешение выкладывать цикл на боевой сервер и в какую ветку (сейчас сервер на `instrument-ui`);
2. домен для HTTPS и подтверждение, что A-запись указывает на `95.141.135.244`;
3. разрешение на нагрузочный прогон на этой машине (он займёт память и процессор примерно на час);
4. площадку для внешней копии бэкапов (если её нет — пункт остаётся открытым в спецификации);
5. пароль ssh.

Без ответа на пункт 1 дальше не идти. Без пункта 2 пропустить шаг 5, без пункта 3 — шаг 7.

- [ ] **Step 2: Осмотр без изменений**

```bash
cd /home/user/teseract
git status --short && git log --oneline -3 && git branch --show-current
node -v                                  # нужен ≥ 20.12 (process.loadEnvFile)
which node npm
systemctl cat showmehow
docker ps --filter name=teseract-pg --format '{{.Names}} {{.Status}}'
docker exec teseract-pg pg_isready -U teseract
id -nG | tr ' ' '\n' | grep -x docker || echo "нет группы docker"
systemctl cat caddy | head -20
caddy version
df -h ~ && free -m
set -a; . ./.env.local; set +a
psql "$DATABASE_URL" -tAc "SELECT count(*) FROM jobs WHERE status IN ('queued','running')" \
  || docker exec teseract-pg psql -U teseract -tAc "SELECT count(*) FROM jobs WHERE status IN ('queued','running')"
```

Записать для себя: путь к `node` и `npm`, строку `ExecStart` службы `showmehow`, где лежит Caddyfile (`ExecStart` службы caddy, `--config`) и есть ли в нём `import` отдельных файлов, доступен ли пользователю `docker` без `sudo`, свободное место и память. Если `git status` показывает изменения или на сервере есть свои коммиты, **остановиться и сообщить владельцу**.

- [ ] **Step 3: СТОП — выкладка кода**

Показать владельцу план: ветка, число активных заданий (миграция 005 пометит их ошибкой), ожидаемый простой веба (секунды на рестарт). После «да»:

```bash
cd /home/user/teseract
git fetch origin <ветка>
git merge --ff-only origin/<ветка>
git diff --stat HEAD@{1} -- package-lock.json | tail -1   # если файл менялся — npm ci
set -a; . ./.env.local; set +a
npm run migrate            # ожидается «Применено: 004_organizations.sql, 005_job_queue.sql» или часть из них
npm run build
```

Установить службу воркера из `ops/systemd/`, подставив путь к `node` из шага 2:

```bash
sed "s#/usr/bin/node#$(which node)#" ops/systemd/teseract-worker.service \
  | sudo tee /etc/systemd/system/teseract-worker.service > /dev/null
sudo systemd-analyze verify /etc/systemd/system/teseract-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now teseract-worker
sudo systemctl restart showmehow
sleep 5
systemctl is-active showmehow teseract-worker
journalctl -u teseract-worker -n 20 --no-pager
curl -s http://127.0.0.1:3100/api/health
```

Ожидается: обе службы `active`; в журнале «Воркер … запущен, слотов: 2.»; health — `200` и `"workersAlive":1`. Затем попросить владельца запустить одну генерацию и одну доработку через браузер и проверить `journalctl -u teseract-worker` («взял задание»). Если что-то не так — откат: `sudo systemctl disable --now teseract-worker`, `git merge --ff-only` на прежний коммит невозможен, поэтому откат кода — `git checkout <прежний коммит>` по согласованию с владельцем, затем `npm run build` и рестарт `showmehow`. Миграции 004–005 со старым кодом совместимы.

- [ ] **Step 4: СТОП — таймер бэкапа**

После «да»:

```bash
chmod +x /home/user/teseract/scripts/backup.sh
sudo cp /home/user/teseract/ops/systemd/teseract-backup.service /home/user/teseract/ops/systemd/teseract-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start teseract-backup.service
journalctl -u teseract-backup -n 20 --no-pager
ls -la ~/teseract-backups/db ~/teseract-backups/data
sudo systemctl enable --now teseract-backup.timer
systemctl list-timers teseract-backup.timer --no-pager
```

Ожидается: запуск завершён успешно, есть `db/<сегодня>.sql.gz` и `data/<сегодня>/`, таймер показывает следующий запуск в 03:00. Если у пользователя нет доступа к `docker` без `sudo`, добавить в юнит `SupplementaryGroups=docker` — только с согласия владельца.

- [ ] **Step 5: СТОП — HTTPS (нужен домен)**

Показать владельцу блок сайта и файл, куда он ляжет. После «да»:

```bash
DOMAIN=<домен от владельца>
dig +short $DOMAIN                         # должен вернуть 95.141.135.244
sudo cp <Caddyfile> <Caddyfile>.bak-$(date +%F)
# Блок сайта — в конец Caddyfile, либо отдельным файлом, если Caddyfile импортирует каталог.
# Другие блоки не трогать.
sed "s#TESERACT_DOMAIN#$DOMAIN#" /home/user/teseract/ops/caddy/teseract.caddy | sudo tee -a <Caddyfile> > /dev/null
sudo caddy validate --config <Caddyfile> --adapter caddyfile
sudo systemctl reload caddy
curl -sI https://$DOMAIN/login | head -1   # HTTP/2 200
curl -s https://$DOMAIN/api/health
```

Затем привязать веб к localhost и включить доверие прокси:

```bash
sudo mkdir -p /etc/systemd/system/showmehow.service.d
# ExecStart в файле — «/usr/bin/npm start -- -H 127.0.0.1»; если в шаге 2 ExecStart
# службы был другим, поправить файл так, чтобы отличался только хвост «-- -H 127.0.0.1».
sed "s#/usr/bin/npm#$(which npm)#" /home/user/teseract/ops/systemd/showmehow-override.conf \
  | sudo tee /etc/systemd/system/showmehow.service.d/override.conf > /dev/null
sudo systemctl daemon-reload
sudo systemctl restart showmehow
ss -ltnp | grep 3100                       # слушает только 127.0.0.1:3100
curl -s https://$DOMAIN/api/health
```

С локальной машины:

```bash
curl -m 5 http://95.141.135.244:3100/login || echo "порт 3100 снаружи закрыт"
```

Попросить владельца открыть `https://<домен>`, войти (cookie с `Secure`), запустить генерацию, открыть «Лаборатории» и убедиться, что кнопка входа в VR появилась. Если HTTPS не поднялся — вернуть `Caddyfile` из `.bak`, `caddy reload`, удалить `override.conf`, `daemon-reload`, рестарт `showmehow`.

- [ ] **Step 6: Проверка восстановления**

По `docs/ops/restore.md` с копией из шага 4, порт 5437 и 3199 — только на `127.0.0.1`. Перед запуском убедиться, что порты свободны (`ss -ltn | grep -E '5437|3199'`). После проверки выполнить уборку из того же документа и дописать строку в «Журнал проверок»: дата, копия, размер дампа, время от начала до открытой симуляции, результат.

- [ ] **Step 7: СТОП — нагрузочный прогон на копии**

Условие: владелец разрешил, `free -m` показывает не меньше 3 ГБ свободной памяти, генераций на боевом нет. Стенд полностью отдельный:

```bash
git clone /home/user/teseract ~/teseract-load && cd ~/teseract-load
git checkout <коммит, который выложен>
docker run -d --name teseract-load-pg -e POSTGRES_USER=teseract -e POSTGRES_PASSWORD=load \
  -e POSTGRES_DB=teseract -p 127.0.0.1:5436:5432 postgres:16-alpine
until docker exec teseract-load-pg pg_isready -U teseract; do sleep 1; done
npm ci
cat > .env.local <<'ENV'
DATABASE_URL=postgres://teseract:load@127.0.0.1:5436/teseract
SHOWMEHOW_API_KEY=test
SHOWMEHOW_MODEL=mock-gen
SHOWMEHOW_VISION_MODEL=mock-vision
SHOWMEHOW_BASE_URL=http://127.0.0.1:3399/v1
SHOWMEHOW_DATA_DIR=/home/user/teseract-load/data
SHOWMEHOW_TRUST_PROXY=1
ENV
set -a; . ./.env.local; set +a
npm run migrate && npm run build
mkdir -p logs
# Процессы стенда запускаются напрямую через node, а их pid пишутся в logs/pids:
# при уборке убиваем только их и никогда — по имени (рядом работает боевой воркер).
nohup node --import tsx scripts/load/mock-provider.ts > logs/mock.log 2>&1 & echo $! >> logs/pids
nohup node_modules/.bin/next start -H 127.0.0.1 -p 3200 > logs/web.log 2>&1 & echo $! >> logs/pids
for i in 1 2; do
  WORKER_CONCURRENCY=2 nohup node --import tsx scripts/worker.ts > logs/worker$i.log 2>&1 & echo $! >> logs/pids
done
sleep 10 && curl -s http://127.0.0.1:3200/api/health
```

Прогон, каждый сценарий отдельно, с записью в отчёт:

```bash
OUT=docs/ops/load-2026-09.md
B=http://127.0.0.1:3200
npm run load -- --base $B --scenario pages --out $OUT
npm run load -- --base $B --scenario logins --out $OUT
npm run load -- --base $B --scenario generations --out $OUT
npm run load -- --base $B --scenario kill-worker --out $OUT --kill-cmd \
  "kill -9 \$(docker exec teseract-load-pg psql -U teseract -tAc \"SELECT split_part(locked_by, ':', 2) FROM jobs WHERE status = 'running' LIMIT 1\")"
# вернуть убитый воркер перед следующим сценарием
WORKER_CONCURRENCY=2 nohup node --import tsx scripts/worker.ts > logs/worker3.log 2>&1 & echo $! >> logs/pids
npm run load -- --base $B --scenario restart-web --out $OUT --restart-cmd \
  "kill \$(sed -n 2p logs/pids); sleep 2; nohup node_modules/.bin/next start -H 127.0.0.1 -p 3200 > logs/web2.log 2>&1 & echo \$! >> logs/pids"
```

Вторая строка `logs/pids` — первый веб стенда (порт 3200); боевой веб на 3100 команда не трогает.

Во время прогона раз в минуту смотреть `free -m` и `uptime`. Если свободной памяти меньше 1 ГБ или боевой `/api/health` отвечает дольше секунды — прервать прогон (`Ctrl+C`) и перейти к уборке.

Уборка — обязательно, даже после сбоя:

```bash
cd ~/teseract-load
xargs -r kill < logs/pids 2>/dev/null; sleep 3; xargs -r kill -9 < logs/pids 2>/dev/null
ss -ltn | grep -E ':3200|:3399|:5436' || echo "порты стенда свободны"
for pid in $(pgrep -f scripts/worker.ts); do ls -l /proc/$pid/cwd; done   # ни одного ~/teseract-load
docker rm -f teseract-load-pg
cp docs/ops/load-2026-09.md /tmp/load-2026-09.md
cd ~ && rm -rf ~/teseract-load
systemctl is-active showmehow teseract-worker      # обе active
```

Если после `kill` остался процесс с рабочим каталогом `~/teseract-load`, убить его по pid. Процессы службы `teseract-worker` (рабочий каталог `/home/user/teseract`) не трогать.

Скопировать отчёт на локальную машину (`scp -o PubkeyAuthentication=no user@95.141.135.244:/tmp/load-2026-09.md docs/ops/load-2026-09.md`), удалить `/tmp/load-2026-09.md` на сервере. Если какая-то цель не достигнута, дописать под результатами раздел «Разбор»: что видно в `logs/*`, что предлагается.

- [ ] **Step 8: Итог приёмки и память**

В спецификацию `docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md` добавить раздел:

```markdown
## 14. Приёмка

| № | Критерий | Статус | Чем подтверждено |
|---|---|---|---|
| 1 | Генерация и доработка выполняются воркером | … | … |
| 2 | Рестарт веба не прерывает генерацию | … | сценарий `restart-web` |
| 3 | Убитый воркер не теряет задание | … | сценарий `kill-worker` |
| 4 | Два экземпляра веба — один прогресс и одна очередь | … | `jobs-routes.test.ts` (поток из другого соединения) |
| 5 | `npm run dev` генерирует, e2e зелёный | … | задача 13 |
| 6 | HTTPS, порт 3100 закрыт, VR-кнопки | … | шаг 5 |
| 7 | Бэкап по таймеру, восстановление проверено | … | `docs/ops/restore.md` |
| 8 | `/api/health` | … | шаг 3 |
| 9 | Нагрузочный прогон | … | `docs/ops/load-2026-09.md` |
| 10 | `npm test`, `tsc`, `build` | … | задача 11 |
```

Заполнить статусы фактами («закрыт», «открыт: нет домена» и т. п.). Статус спецификации в шапке — «реализована» только если закрыты все пункты.

Обновить заметку памяти `tesseract-server-access.md`: порядок выкладки дополняется `sudo systemctl restart teseract-worker`; добавить строки про службу `teseract-worker`, таймер `teseract-backup.timer`, каталог `~/teseract-backups`, домен (если появился) и то, что веб теперь слушает только `127.0.0.1:3100`. Пароль в память не записывать.

```bash
git add docs/ops/restore.md docs/ops/load-2026-09.md docs/superpowers/specs/2026-09-17-worker-queue-ops-design.md
git commit -m "docs(ops): итоги выкладки цикла 1 — восстановление, нагрузка, приёмка

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Покрытие спецификации

| Раздел спецификации | Задача |
|---|---|
| 2. Архитектура, где работает воркер | 8 (служба, Docker, dev), 9 (`instrumentation.ts`), 14 (systemd) |
| 3. Миграция 005, старые записи, квота только за генерации | 1, 4 (`events` с запасным `jobs.events`), 9 (квота) |
| 4. Создание, приоритет, 409 по уникальному индексу | 2 (`jobPriority`), 4 (`ActiveJobExistsError`), 9, 10 |
| 4. Захват `SKIP LOCKED`, `WORKER_CONCURRENCY`, захват по NOTIFY и раз в 5 с | 4, 6, 8 |
| 4. Выполнение: события с `seq` + NOTIFY, цепочка записей, сердцебиение 15 с, завершение одной транзакцией, `done` после транзакции | 4, 6 |
| 4. Отмена ожидающего и идущего | 4, 6, 9 |
| 4. Уборщик 30 с, одна повторная попытка, защита от двойного сохранения | 2, 4, 5 (`onSaved`), 6 |
| 4. Мягкая остановка, `WORKER_DRAIN_SECONDS`, `TimeoutStopSec=660` | 6, 8, 14 |
| 5. Поток: реплей, дочитывание по `seq`, позиция раз в 3 с, сверка раз в 5 с, одно соединение `LISTEN` | 3, 9 |
| 5. `GET /api/jobs/<id>` из базы | 9 |
| 6. Мастерская: доработка через поток, отмена, восстановление | 10 |
| 7. Лимиты входа в `login_attempts`, чистка старше суток, `SHOWMEHOW_TRUST_PROXY` | 7, 8 (`onReap`) |
| 8. HTTPS, бэкапы, проверка восстановления, `/api/health`, выкладка | 12, 14, 16 |
| 9. Модули, удаление `limits.ts` и `jobs.ts`, `npm run worker` | 2–8, 11 |
| 10. Юниты, интеграционные, e2e, нагрузочный прогон | 2–15, 16 |
| 11. Критерии приёмки | 16, шаг 8 |
