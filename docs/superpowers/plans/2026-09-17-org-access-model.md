# Цикл 0. Модель доступа: организации, членства, вход по логину — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заложить B2B-фундамент: организации, членства с ролью, группы, вход по логину без почты, лимит входа, который не блокирует класс за одним IP, короткие сессии учеников, принудительная смена временного пароля, блокировка аккаунта, право на генерацию и квота с учётом членств, консольный скрипт управления организациями. Пользователь без членств не замечает изменений.

**Architecture:** Миграция `004_organizations.sql` добавляет таблицы организаций, членств и групп и новые колонки `users`/`sessions`. Чистая логика (разбор идентификатора, настройки, политика, лимит входа, генератор пароля) живёт в модулях без базы и покрыта юнитами. `src/lib/org/access.ts` — единственное место, которое читает членства и отвечает «кто что может». `currentUserFromRequest`/`currentUserFromCookies` отсекают пользователей с временным паролем; немногие исключения читают пользователя через `currentUserAllowingPasswordChange*`. Роуты и layout берут членства из `listMemberships` и передают их в чистые функции `policy.ts`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Postgres 16 через `pg`, vitest, `tsx` для скриптов.

**Spec:** `docs/superpowers/specs/2026-09-17-org-access-model-design.md`
**Карта:** `docs/superpowers/2026-09-16-b2b-platform-roadmap.md`, цикл 0

## Global Constraints

- **Ветка.** Работа идёт в новой ветке `org-access-model`, созданной от `instrument-ui` (Task 1, шаг 1).
- **Никаких новых зависимостей.** `package.json` меняется только добавлением скрипта `org`.
- **`npm test` обязан оставаться зелёным без базы.** Тесты с Postgres читают `SHOWMEHOW_TEST_DATABASE_URL`, работают в своей схеме через `testDb(SCHEMA)`/`resetSchema` из `tests/db.ts` и объявляются через `describe.skipIf(!pool)`.
- **Не запускать `npm run test:e2e`** в этом цикле.
- **Комментарии по-русски, идентификаторы по-английски, строки для пользователя — целыми предложениями по-русски.**
- **Чужой или недоступный `id` даёт 404, а не 403.** Функции `access.ts` при отказе возвращают `null`/`false`, роут превращает это в 404. Единственные 403 цикла — «генерация недоступна», исчерпанная квота и «аккаунт заблокирован» при верном пароле.
- Шаблонные строки рантайма `src/lib/runtime/*` — строго ES5, этот цикл их **не трогает**.
- **Пользователь без членств не видит изменений:** регистрация, вход по почте, мастерская, библиотека, лаборатории, профиль, квота 10 и её текст остаются прежними.
- Существующие тесты не меняются по смыслу. Допустимые правки: вызовы `findUserByEmail` → `findUserByIdentifier`, новые поля в фикстурах `AuthUser`, подмена `listMemberships` в юнит-тестах роутов.
- Команда для наборов с базой в этом плане:
  `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run <файл>`.
  Без переменной такие наборы пропускаются — это не считается проверкой; если базы нет, отметить в отчёте.
- Каждый коммит заканчивается строкой:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Карта файлов

| Файл | Что | Задача |
|---|---|---|
| `migrations/004_organizations.sql` | схема цикла | 1 |
| `src/lib/auth/identifier.ts` | разбор идентификатора, `userLabel`, `userContact` (чисто) | 2 |
| `src/lib/auth/users.ts` | новые поля `AuthUser`, `findUserByIdentifier`, `createLoginUser`, `findActiveUserById`, `disableUser`, `setTemporaryPassword` | 3, 7, 8 |
| `src/lib/auth/rate-limit.ts` | три счётчика | 4 |
| `src/lib/org/types.ts` | `OrgRole`, `OrgKind`, `Membership`, `OrgError` | 5 |
| `src/lib/org/settings.ts` | настройки организации (чисто) | 5 |
| `src/lib/org/policy.ts` | `navSections`, `canGenerate`, `sessionKind`, `generationLimit` (чисто) | 5 |
| `src/lib/org/access.ts` | `listMemberships`, `orgRoleOf`, `requireOrgRole`, `canManageGroup`, `isPlatformAdmin` | 6 |
| `src/lib/org/orgs.ts` | создание и поиск организаций, членства, запись настроек | 6 |
| `src/lib/org/groups.ts` | группы, `addToGroup`, `assignTeacher` | 6 |
| `src/lib/auth/session.ts`, `src/lib/auth/cookie.ts` | короткие сессии, разрешающие варианты | 7, 8 |
| `src/components/ForcePasswordChange.tsx` | форма «Придумайте свой пароль» | 9 |
| `src/lib/auth/temp-password.ts` | трёхсловный временный пароль (чисто) | 12 |
| `scripts/org.ts` | консольное управление | 13 |

---

### Task 1: Ветка и миграция `004_organizations.sql`

**Files:**
- Create: `migrations/004_organizations.sql`, `tests/integration/org-migration.test.ts`

**Interfaces:**
- Consumes: `applyMigrations(pool)` из `scripts/migrate.ts`, `testDb`/`resetSchema` из `tests/db.ts`, `POST` из `src/app/api/auth/login/route.ts`.
- Produces: таблицы `organizations`, `memberships`, `groups`, `group_members`, `group_teachers`; колонки `users.login`, `users.must_change_password`, `users.disabled_at`, `sessions.sliding`; `users.email` допускает `NULL`; ограничение `users_has_identifier`.

- [ ] **Step 1: Создать ветку**

```bash
git checkout instrument-ui
git checkout -b org-access-model
```

- [ ] **Step 2: Написать падающий тест**

`tests/integration/org-migration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { POST as login } from '@/app/api/auth/login/route';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'org_migration_test';
const pool = testDb(SCHEMA);

/** Накатывает только миграции до `last` включительно — так получается база прежней схемы. */
async function applyUpTo(last: string): Promise<void> {
  const p = pool!;
  await p.query(
    'CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(process.cwd(), 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && f <= last).sort();
  for (const f of files) {
    await p.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await p.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
  }
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('миграция 004 на базе прежней схемы', () => {
  it('накатывается поверх данных, и старый пользователь входит почтой', async () => {
    const p = pool!;
    await applyUpTo('003_demos_seeded.sql');
    const oldId = crypto.randomUUID();
    await p.query(
      "INSERT INTO users (id, email, password_hash, role) VALUES ($1, 'old@example.com', $2, 'user')",
      [oldId, hashPassword('пароль123')]);
    await p.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h1', $1, now() + interval '1 day')",
      [oldId]);

    expect(await applyMigrations(p)).toEqual(['004_organizations.sql']);

    const { rows } = await p.query<{ login: string | null; must_change_password: boolean; disabled_at: Date | null }>(
      'SELECT login, must_change_password, disabled_at FROM users WHERE id = $1', [oldId]);
    expect(rows[0]).toEqual({ login: null, must_change_password: false, disabled_at: null });
    const s = await p.query<{ sliding: boolean }>('SELECT sliding FROM sessions');
    expect(s.rows[0].sliding).toBe(true);

    __resetAttemptsForTests();
    const res = await login(new Request('http://t', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'old@example.com', password: 'пароль123' }),
    }));
    expect(res.status).toBe(200);
  });

  it('не пускает пользователя без почты и без логина и держит логин уникальным', async () => {
    const p = pool!;
    await expect(p.query(
      "INSERT INTO users (id, password_hash, role) VALUES ($1, 'x', 'user')", [crypto.randomUUID()]))
      .rejects.toThrow(/users_has_identifier/);
    await p.query("INSERT INTO users (id, login, password_hash, role) VALUES ($1, 'ivanov.i.sch12', 'x', 'user')",
      [crypto.randomUUID()]);
    await expect(p.query(
      "INSERT INTO users (id, login, password_hash, role) VALUES ($1, 'ivanov.i.sch12', 'x', 'user')",
      [crypto.randomUUID()])).rejects.toThrow(/duplicate key/);
  });

  it('роли и типы организаций ограничены схемой', async () => {
    const p = pool!;
    await expect(p.query(
      "INSERT INTO organizations (id, slug, name, kind) VALUES ($1, 'x1', 'X', 'kindergarten')",
      [crypto.randomUUID()])).rejects.toThrow(/check constraint/);
    const orgId = crypto.randomUUID();
    await p.query("INSERT INTO organizations (id, slug, name, kind) VALUES ($1, 'x2', 'X', 'school')", [orgId]);
    const u = await p.query<{ id: string }>("SELECT id FROM users WHERE email = 'old@example.com'");
    await expect(p.query(
      "INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'director')", [orgId, u.rows[0].id]))
      .rejects.toThrow(/check constraint/);
    const org = await p.query<{ settings: unknown }>('SELECT settings FROM organizations WHERE id = $1', [orgId]);
    expect(org.rows[0].settings).toEqual({});
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/org-migration.test.ts`
Expected: FAIL — `applyMigrations` возвращает `[]` вместо `['004_organizations.sql']`.

- [ ] **Step 4: Написать миграцию**

`migrations/004_organizations.sql`:

```sql
-- Организации, членства с ролью, группы и учителя групп.
-- Ученик группы обязан быть членом той же организации; этот инвариант держит
-- единственная функция записи addToGroup (src/lib/org/groups.ts), а не внешний ключ.
CREATE TABLE organizations (
  id          uuid PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('school','college','university')),
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('org_admin','teacher','student')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user ON memberships (user_id);

CREATE TABLE groups (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title       text NOT NULL,
  join_code   text UNIQUE,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX groups_org ON groups (org_id);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user ON group_members (user_id);

CREATE TABLE group_teachers (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Вход по логину: у ученика почты может не быть, но хоть один идентификатор обязан быть.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN login text UNIQUE;
ALTER TABLE users ADD CONSTRAINT users_has_identifier
  CHECK (email IS NOT NULL OR login IS NOT NULL);
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN disabled_at timestamptz;

-- Короткие сессии учеников не продлеваются; прежние сессии остаются скользящими.
ALTER TABLE sessions ADD COLUMN sliding boolean NOT NULL DEFAULT true;
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/org-migration.test.ts tests/integration/migrate.test.ts`
Expected: PASS.

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`
Expected: зелёно (наборы с базой без переменной пропущены).

```bash
git add migrations/004_organizations.sql tests/integration/org-migration.test.ts
git commit -m "feat(db): миграция 004 — организации, членства, группы, логин

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Разбор идентификатора и подпись пользователя

**Files:**
- Create: `src/lib/auth/identifier.ts`, `tests/unit/identifier.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:

```ts
export const LOGIN_RE: RegExp;                       // /^[a-z0-9][a-z0-9._-]{2,39}$/
export type Identifier = { kind: 'email'; value: string } | { kind: 'login'; value: string };
export function normalizeIdentifier(raw: string): string;
export function isValidLogin(value: string): boolean;
export function parseIdentifier(raw: unknown): Identifier | null;
export interface LabeledUser { displayName: string | null; email: string | null; login: string | null }
export function userLabel(u: LabeledUser): string;
export function userContact(u: Pick<LabeledUser, 'email' | 'login'>): string;
```

Модуль не импортирует ни `pg`, ни `node:crypto`: его подключают клиентские компоненты.

- [ ] **Step 1: Написать падающий тест**

`tests/unit/identifier.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseIdentifier, normalizeIdentifier, isValidLogin, userLabel, userContact,
} from '@/lib/auth/identifier';

describe('разбор идентификатора', () => {
  it('ввод с @ — почта, нормализованная', () => {
    expect(parseIdentifier('  Ivan@Example.COM ')).toEqual({ kind: 'email', value: 'ivan@example.com' });
  });

  it('ввод без @ — логин в нижнем регистре', () => {
    expect(parseIdentifier(' Ivanov.I.SCH12 ')).toEqual({ kind: 'login', value: 'ivanov.i.sch12' });
  });

  it('пустое, не строка и недопустимый логин дают null', () => {
    expect(parseIdentifier('')).toBeNull();
    expect(parseIdentifier('   ')).toBeNull();
    expect(parseIdentifier(undefined)).toBeNull();
    expect(parseIdentifier(42)).toBeNull();
    expect(parseIdentifier('ab')).toBeNull();            // короче трёх
    expect(parseIdentifier('.ivanov')).toBeNull();       // начинается не с буквы или цифры
    expect(parseIdentifier('иванов')).toBeNull();        // кириллица
    expect(parseIdentifier('ivan ov')).toBeNull();       // пробел внутри
    expect(parseIdentifier('a'.repeat(41))).toBeNull();  // длиннее сорока
  });

  it('алфавит логина: буквы, цифры, точка, дефис, подчёркивание', () => {
    expect(isValidLogin('ivanov.i.sch12')).toBe(true);
    expect(isValidLogin('a_b-c.d')).toBe(true);
    expect(isValidLogin('abc')).toBe(true);
    expect(isValidLogin('a'.repeat(40))).toBe(true);
    expect(isValidLogin('ivanov@sch12')).toBe(false);
    expect(isValidLogin('Ivanov')).toBe(false);
  });

  it('нормализация — trim и нижний регистр', () => {
    expect(normalizeIdentifier('  AbC ')).toBe('abc');
  });
});

describe('userLabel и userContact', () => {
  it('имя важнее почты, почта важнее логина', () => {
    expect(userLabel({ displayName: 'Иван', email: 'i@e.com', login: 'ivan' })).toBe('Иван');
    expect(userLabel({ displayName: null, email: 'i@e.com', login: 'ivan' })).toBe('i@e.com');
    expect(userLabel({ displayName: null, email: null, login: 'ivan' })).toBe('ivan');
    expect(userLabel({ displayName: '', email: null, login: 'ivan' })).toBe('ivan');
  });

  it('контакт — почта, иначе логин', () => {
    expect(userContact({ email: 'i@e.com', login: 'ivan' })).toBe('i@e.com');
    expect(userContact({ email: null, login: 'ivan' })).toBe('ivan');
    expect(userContact({ email: null, login: null })).toBe('');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/identifier.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/auth/identifier"`.

- [ ] **Step 3: Реализовать**

`src/lib/auth/identifier.ts`:

```ts
/**
 * Идентификатор входа: почта или логин. Различаются по символу @ — у почты он
 * есть всегда, у логина не бывает никогда. Модуль без зависимостей от базы и
 * node:crypto: его импортируют клиентские компоненты.
 */
export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export type Identifier = { kind: 'email'; value: string } | { kind: 'login'; value: string };

export function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidLogin(value: string): boolean {
  return LOGIN_RE.test(value);
}

/** null — ввод пустой или это не почта и не допустимый логин: такого аккаунта быть не может. */
export function parseIdentifier(raw: unknown): Identifier | null {
  if (typeof raw !== 'string') return null;
  const value = normalizeIdentifier(raw);
  if (!value) return null;
  if (value.includes('@')) return { kind: 'email', value };
  return isValidLogin(value) ? { kind: 'login', value } : null;
}

export interface LabeledUser {
  displayName: string | null;
  email: string | null;
  login: string | null;
}

/** Как показывать человека в шапке и профиле: у ученика почты может не быть. */
export function userLabel(u: LabeledUser): string {
  return u.displayName || u.email || u.login || '';
}

/** Строка «чем человек входит»: почта, а если её нет — логин. */
export function userContact(u: Pick<LabeledUser, 'email' | 'login'>): string {
  return u.email ?? u.login ?? '';
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/unit/identifier.test.ts`
Expected: PASS.

- [ ] **Step 5: Закоммитить**

```bash
git add src/lib/auth/identifier.ts tests/unit/identifier.test.ts
git commit -m "feat(auth): разбор идентификатора входа и подпись пользователя

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Новые поля `AuthUser`, вход по логину, подпись в интерфейсе

**Files:**
- Modify: `src/lib/auth/users.ts`, `src/app/api/auth/login/route.ts`, `scripts/migrate-to-db.ts`, `scripts/seed-demos.ts`, `src/app/layout.tsx`, `src/components/NavLinks.tsx`, `src/components/ProfileView.tsx`, `tests/integration/auth-session.test.ts`, `tests/unit/jobs-api.test.ts`
- Test: `tests/integration/login-identifier.test.ts`

**Interfaces:**
- Consumes: `parseIdentifier`, `normalizeIdentifier`, `isValidLogin`, `userLabel`, `userContact` из Task 2.
- Produces (в `src/lib/auth/users.ts`):

```ts
export interface AuthUser {
  id: string;
  email: string | null;
  login: string | null;
  displayName: string | null;
  role: Role;
  mustChangePassword: boolean;
}
export type StoredUser = AuthUser & { passwordHash: string; disabledAt: Date | null };
export class LoginTakenError extends Error {}
export class InvalidLoginError extends Error {}
export function findUserByIdentifier(raw: string): Promise<StoredUser | null>;   // заменяет findUserByEmail
export function createLoginUser(input: {
  login: string; displayName: string | null; password: string; mustChangePassword: boolean;
}): Promise<AuthUser>;
export interface UserProfile extends AuthUser { prefs: UserPrefs; createdAt: string }
```

- `POST /api/auth/login` принимает `{ identifier, password }` и по-прежнему `{ email, password }`; текст ошибки — «Неверный логин, почта или пароль.»
- `NavLinks` получает `user?: { label: string; role: string }`.

- [ ] **Step 1: Написать падающий тест**

`tests/integration/login-identifier.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/me/route';
import {
  createUser, createLoginUser, findUserByIdentifier, InvalidLoginError, LoginTakenError,
} from '@/lib/auth/users';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'login_identifier_test';
const pool = testDb(SCHEMA);

function post(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('вход по логину и по почте', () => {
  it('ученик входит логином в любом регистре, а /api/me отдаёт новые поля', async () => {
    await createLoginUser({
      login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false,
    });
    const res = await login(post({ identifier: ' Ivanov.I.Sch12 ', password: 'пароль123' }));
    expect(res.status).toBe(200);
    const body = await (await me(new Request('http://t', { headers: { cookie: cookieOf(res) } }))).json();
    expect(body.user).toMatchObject({
      email: null, login: 'ivanov.i.sch12', displayName: 'Иванов Иван', role: 'user', mustChangePassword: false,
    });
  });

  it('почта входит и через identifier, и через старое поле email', async () => {
    await createUser('a@example.com', 'пароль123');
    expect((await login(post({ identifier: 'A@example.com', password: 'пароль123' }))).status).toBe(200);
    expect((await login(post({ email: 'a@example.com', password: 'пароль123' }))).status).toBe(200);
  });

  it('неверный логин, неверная почта и неверный пароль дают один и тот же 401', async () => {
    await createLoginUser({ login: 'petrov', displayName: null, password: 'пароль123', mustChangePassword: false });
    const wrongPass = await login(post({ identifier: 'petrov', password: 'неверный1' }));
    const noLogin = await login(post({ identifier: 'sidorov', password: 'неверный1' }));
    const badLogin = await login(post({ identifier: 'ив', password: 'неверный1' }));
    const noEmail = await login(post({ identifier: 'нет@example.com', password: 'неверный1' }));
    for (const r of [wrongPass, noLogin, badLogin, noEmail]) expect(r.status).toBe(401);
    const bodies = await Promise.all([wrongPass, noLogin, badLogin, noEmail].map((r) => r.json()));
    for (const b of bodies) expect(b).toEqual({ error: 'Неверный логин, почта или пароль.' });
  });

  it('findUserByIdentifier ищет по почте или логину и отдаёт хеш', async () => {
    await createUser('b@example.com', 'пароль123');
    await createLoginUser({ login: 'kim.a', displayName: null, password: 'пароль123', mustChangePassword: true });
    expect((await findUserByIdentifier('B@Example.com'))?.passwordHash.startsWith('scrypt$')).toBe(true);
    const byLogin = await findUserByIdentifier('KIM.A');
    expect(byLogin).toMatchObject({ login: 'kim.a', email: null, mustChangePassword: true, disabledAt: null });
    expect(await findUserByIdentifier('нет-такого')).toBeNull();
  });

  it('createLoginUser отклоняет недопустимый и занятый логин', async () => {
    await expect(createLoginUser({
      login: 'ivanov@sch12', displayName: null, password: 'пароль123', mustChangePassword: true,
    })).rejects.toBeInstanceOf(InvalidLoginError);
    await createLoginUser({ login: 'lee', displayName: null, password: 'пароль123', mustChangePassword: true });
    await expect(createLoginUser({
      login: 'LEE', displayName: null, password: 'пароль123', mustChangePassword: true,
    })).rejects.toBeInstanceOf(LoginTakenError);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/login-identifier.test.ts`
Expected: FAIL — `createLoginUser` не экспортируется.

- [ ] **Step 3: Переписать `src/lib/auth/users.ts`**

Заменить верх файла (от `export type Role` до конца `findUserById`) на:

```ts
import crypto from 'node:crypto';
import { db } from '../db/client';
import { hashPassword } from './password';
import { mergePrefs, sanitizePrefs, type UserPrefs } from './prefs';
import { isValidLogin, normalizeIdentifier, parseIdentifier } from './identifier';

export type Role = 'admin' | 'user';

/**
 * То, что нужно для проверки доступа на каждом запросе. Почты может не быть —
 * ученику логин выдаёт организация. displayName нужен шапке: у ученика это
 * единственная человеческая подпись.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  login: string | null;
  displayName: string | null;
  role: Role;
  mustChangePassword: boolean;
}

/** Пользователь вместе с тем, что нужно только входу. Наружу не отдаётся. */
export type StoredUser = AuthUser & { passwordHash: string; disabledAt: Date | null };

export class EmailTakenError extends Error {
  constructor() { super('Такая почта уже зарегистрирована'); }
}

export class LoginTakenError extends Error {
  constructor(login: string) { super(`Логин «${login}» уже занят.`); }
}

export class InvalidLoginError extends Error {
  constructor() {
    super('Логин может содержать только строчные латинские буквы, цифры, точку, дефис и подчёркивание, '
      + 'от 3 до 40 символов, и начинаться с буквы или цифры.');
  }
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Админ ровно один и задаётся окружением: отдельного интерфейса управления ролями нет. */
export function roleForEmail(email: string): Role {
  const admin = process.env.SHOWMEHOW_ADMIN_EMAIL;
  return admin && normalizeEmail(admin) === normalizeEmail(email) ? 'admin' : 'user';
}

const USER_COLUMNS = 'id, email, login, display_name, role, must_change_password, disabled_at';

interface UserRow {
  id: string;
  email: string | null;
  login: string | null;
  display_name: string | null;
  role: Role;
  must_change_password: boolean;
  disabled_at: Date | null;
}

function toAuthUser(r: UserRow): AuthUser {
  return {
    id: r.id, email: r.email, login: r.login, displayName: r.display_name,
    role: r.role, mustChangePassword: r.must_change_password,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

export async function createUser(rawEmail: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(rawEmail);
  const user: AuthUser = {
    id: crypto.randomUUID(), email, login: null, displayName: null,
    role: roleForEmail(email), mustChangePassword: false,
  };
  try {
    await db().query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1,$2,$3,$4)',
      [user.id, email, hashPassword(password), user.role]);
  } catch (e) {
    // 23505 — нарушение UNIQUE по email.
    if (isUniqueViolation(e)) throw new EmailTakenError();
    throw e;
  }
  return user;
}

/**
 * Аккаунт без почты: логин выдаёт организация или скрипт scripts/org.ts.
 * Роль платформы всегда 'user' — админ определяется только почтой.
 */
export async function createLoginUser(input: {
  login: string; displayName: string | null; password: string; mustChangePassword: boolean;
}): Promise<AuthUser> {
  const login = normalizeIdentifier(input.login);
  if (!isValidLogin(login)) throw new InvalidLoginError();
  const user: AuthUser = {
    id: crypto.randomUUID(), email: null, login, displayName: input.displayName,
    role: 'user', mustChangePassword: input.mustChangePassword,
  };
  try {
    await db().query(
      `INSERT INTO users (id, login, display_name, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,'user',$5)`,
      [user.id, login, input.displayName, hashPassword(input.password), input.mustChangePassword]);
  } catch (e) {
    if (isUniqueViolation(e)) throw new LoginTakenError(login);
    throw e;
  }
  return user;
}

/** Почта, если во вводе есть @, иначе логин. Недопустимый ввод — null без запроса к базе. */
export async function findUserByIdentifier(raw: string): Promise<StoredUser | null> {
  const id = parseIdentifier(raw);
  if (!id) return null;
  const column = id.kind === 'email' ? 'email' : 'login';
  const { rows } = await db().query<UserRow & { password_hash: string }>(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE ${column} = $1`, [id.value]);
  const r = rows[0];
  return r ? { ...toAuthUser(r), passwordHash: r.password_hash, disabledAt: r.disabled_at } : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await db().query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? toAuthUser(rows[0]) : null;
}
```

Заменить `UserProfile` и `getProfile` на:

```ts
/**
 * Профиль отделён от AuthUser намеренно: AuthUser — то, что нужно для проверки
 * доступа на каждом запросе, и он не должен раздуваться настройками интерфейса.
 */
export interface UserProfile extends AuthUser {
  prefs: UserPrefs;
  createdAt: string;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { rows } = await db().query<UserRow & { prefs: unknown; created_at: Date }>(
    `SELECT ${USER_COLUMNS}, prefs, created_at FROM users WHERE id = $1`, [userId]);
  const r = rows[0];
  if (!r) return null;
  return { ...toAuthUser(r), prefs: sanitizePrefs(r.prefs), createdAt: r.created_at.toISOString() };
}
```

Функцию `findUserByEmail` удалить. `updateProfile`, `updatePassword`, `findUserPasswordHash` не меняются.

- [ ] **Step 4: Перевести вход на идентификатор**

`src/app/api/auth/login/route.ts` целиком:

```ts
import { NextResponse } from 'next/server';
import { findUserByIdentifier, type AuthUser } from '@/lib/auth/users';
import { normalizeIdentifier } from '@/lib/auth/identifier';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { isLimited, recordFailure } from '@/lib/auth/rate-limit';
import { setSessionCookie, isSecureRequest } from '@/lib/auth/cookie';

// Один и тот же текст для неизвестного аккаунта и неверного пароля: иначе форма входа
// превращается в способ узнать, кто зарегистрирован.
const WRONG = 'Неверный логин, почта или пароль.';

// Хеш-пустышка того же формата и стоимости scrypt, что и у настоящих паролей.
// Сверяем с ним пароль, когда аккаунт не найден: иначе время ответа выдаёт,
// существует ли аккаунт.
const DUMMY_PASSWORD_HASH = hashPassword('заглушка-для-константного-времени-ответа');

export async function POST(req: Request) {
  const body = (await req.json()) as { identifier?: unknown; email?: unknown; password?: string };
  // Старые клиенты присылают поле email — принимаем его как идентификатор.
  const raw = body.identifier ?? body.email;
  const password = body.password;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const key = typeof raw === 'string' && raw.trim() ? normalizeIdentifier(raw) : undefined;

  if (isLimited(ip) || (key !== undefined && isLimited(key))) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }

  const fail = () => {
    recordFailure(ip);
    if (key !== undefined) recordFailure(key);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  };

  if (key === undefined || !password) return fail();

  const found = await findUserByIdentifier(key);
  const passwordOk = verifyPassword(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!found || !passwordOk) return fail();

  const token = await createSession(found.id);
  const user: AuthUser = {
    id: found.id, email: found.email, login: found.login, displayName: found.displayName,
    role: found.role, mustChangePassword: found.mustChangePassword,
  };
  return setSessionCookie(NextResponse.json({ user }), token, isSecureRequest(req));
}
```

- [ ] **Step 5: Перевести скрипты и старый тест**

`scripts/migrate-to-db.ts`: импорт `findUserByEmail` заменить на `findUserByIdentifier`, строку `const existing = await findUserByEmail(email);` — на `const existing = await findUserByIdentifier(email);`.

`scripts/seed-demos.ts`: импорт — на `findUserByIdentifier`; строку `const user = await findUserByEmail(email);` — на `const user = await findUserByIdentifier(email);`. Подсказку об ошибке оставить как есть.

`tests/integration/auth-session.test.ts`: в импорте `findUserByEmail` → `findUserByIdentifier`; последний тест блока «пользователи и сессии»:

```ts
  it('пароль проверяется через findUserByIdentifier', async () => {
    await createUser('d@example.com', 'пароль123');
    const found = await findUserByIdentifier('D@Example.com');
    expect(found?.passwordHash.startsWith('scrypt$')).toBe(true);
  });
```

`tests/unit/jobs-api.test.ts`: фикстуры получают новые поля. Сразу после импортов вставить помощник и заменить объявления `TEST_USER`, `OTHER_USER` и двух пользователей в тесте «не освобождает третий слот»:

```ts
function testUser(id: string, email: string): AuthUser {
  return { id, email, login: null, displayName: null, role: 'user', mustChangePassword: false };
}
const TEST_USER: AuthUser = testUser('11111111-1111-1111-1111-111111111111', 'a@t');
const OTHER_USER: AuthUser = testUser('22222222-2222-2222-2222-222222222222', 'b@t');
```

```ts
    const users: AuthUser[] = [
      TEST_USER, OTHER_USER,
      testUser('33333333-3333-3333-3333-333333333333', 'c@t'),
      testUser('44444444-4444-4444-4444-444444444444', 'd@t'),
    ];
```

- [ ] **Step 6: Подпись вместо почты в шапке и профиле**

Шапка показывает `userContact` (почту, а если её нет — логин), а не `userLabel`: так
у пользователя без членств меню аккаунта остаётся ровно прежним, даже если он задал себе
имя. Имя, как и раньше, видно только в профиле.

`src/components/NavLinks.tsx`: `interface NavUser { email: string; role: string }` → `interface NavUser { label: string; role: string }`; `{user.email.slice(0, 1)}` → `{user.label.slice(0, 1)}`; `<strong>{user.email}</strong>` → `<strong>{user.label}</strong>`.

`src/app/layout.tsx`: добавить `import { userContact } from '@/lib/auth/identifier';` и заменить строку с `NavLinks` на

```tsx
          <NavLinks user={user ? { label: userContact(user), role: user.role } : undefined} />
```

`src/components/ProfileView.tsx`: добавить `import { userContact, userLabel } from '@/lib/auth/identifier';`. Строку `const initial = ...` заменить на

```tsx
  const label = userLabel(profile);
  const contact = userContact(profile);
  const initial = label.slice(0, 1);
```

и блок подписи внутри первого `.row`:

```tsx
          <div className="row-label">
            <strong>{label}</strong>
            <span>
              {/* Без имени подписью уже служит почта или логин — второй раз её не повторяем. */}
              {profile.displayName && contact ? `${contact} · ` : ''}
              {profile.role === 'admin' ? 'администратор' : 'пользователь'}
            </span>
          </div>
```

- [ ] **Step 7: Запустить — убедиться, что проходит**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/login-identifier.test.ts tests/integration/auth-api.test.ts tests/integration/auth-session.test.ts tests/integration/profile-api.test.ts`
Expected: PASS.

Run: `npx vitest run && npx tsc --noEmit && grep -rn findUserByEmail src scripts tests`
Expected: тесты и типы зелёные, `grep` ничего не находит.

- [ ] **Step 8: Закоммитить**

```bash
git add src/lib/auth/users.ts src/app/api/auth/login/route.ts scripts/migrate-to-db.ts scripts/seed-demos.ts \
  src/app/layout.tsx src/components/NavLinks.tsx src/components/ProfileView.tsx \
  tests/integration/auth-session.test.ts tests/unit/jobs-api.test.ts tests/integration/login-identifier.test.ts
git commit -m "feat(auth): вход по логину или почте, подпись пользователя вместо почты

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Три счётчика неудачных входов

**Files:**
- Modify: `src/lib/auth/rate-limit.ts`, `src/app/api/auth/login/route.ts`, `tests/unit/rate-limit.test.ts`
- Test: `tests/integration/login-limit.test.ts`

**Interfaces:**
- Consumes: `findUserByIdentifier` из Task 3.
- Produces:

```ts
export const IDENTIFIER_LIMIT = 10;
export const UNKNOWN_IP_LIMIT = 50;
export const IP_LIMIT = 300;
export function isLimited(key: string, max?: number): boolean;         // max по умолчанию IDENTIFIER_LIMIT
export function recordFailure(key: string): void;
export function isLoginBlocked(ip: string, identifier: string | null): boolean;
export function recordLoginFailure(ip: string, identifier: string | null, accountExists: boolean): void;
export function __resetAttemptsForTests(): void;
```

- [ ] **Step 1: Написать падающий юнит-тест**

Дописать в конец `tests/unit/rate-limit.test.ts` (существующие тесты не трогать; в импорт добавить новые имена):

```ts
import {
  isLoginBlocked, recordLoginFailure, IDENTIFIER_LIMIT, UNKNOWN_IP_LIMIT, IP_LIMIT,
} from '@/lib/auth/rate-limit';

describe('лимит входа по трём счётчикам', () => {
  beforeEach(() => __resetAttemptsForTests());
  const IP = '203.0.113.7';

  it('пороги: 10 по идентификатору, 50 неизвестных и 300 всего с одного IP', () => {
    expect([IDENTIFIER_LIMIT, UNKNOWN_IP_LIMIT, IP_LIMIT]).toEqual([10, 50, 300]);
  });

  it('30 неудач по разным существующим аккаунтам с одного IP не блокируют вход', () => {
    for (let i = 0; i < 30; i++) recordLoginFailure(IP, `student${i}`, true);
    expect(isLoginBlocked(IP, 'student31')).toBe(false);
    expect(isLoginBlocked(IP, 'student0')).toBe(false);
  });

  it('после 50 неудач по несуществующим аккаунтам 51-я попытка блокируется для всех', () => {
    for (let i = 0; i < 49; i++) recordLoginFailure(IP, `ghost${i}`, false);
    expect(isLoginBlocked(IP, 'ghost-next')).toBe(false);
    recordLoginFailure(IP, 'ghost49', false);
    expect(isLoginBlocked(IP, 'ghost-next')).toBe(true);
    // Исчерпанный счётчик IP закрывает вход и в существующий аккаунт.
    expect(isLoginBlocked(IP, 'real.student')).toBe(true);
    expect(isLoginBlocked('198.51.100.1', 'real.student')).toBe(false);
  });

  it('после 10 неверных паролей к одному аккаунту 11-я попытка блокируется с любого IP', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure(`10.0.0.${i}`, 'ivanov', true);
    expect(isLoginBlocked('10.0.0.99', 'ivanov')).toBe(true);
    expect(isLoginBlocked('10.0.0.99', 'petrov')).toBe(false);
  });

  it('неудача по несуществующему аккаунту не растит счётчик идентификатора', () => {
    for (let i = 0; i < 20; i++) recordLoginFailure(`10.1.0.${i}`, 'nobody', false);
    expect(isLoginBlocked('10.9.9.9', 'nobody')).toBe(false);
  });

  it('300 неудач любого рода с одного IP закрывают вход', () => {
    for (let i = 0; i < 299; i++) recordLoginFailure(IP, `s${i % 25}x${i}`, true);
    expect(isLoginBlocked(IP, 'fresh')).toBe(false);
    recordLoginFailure(IP, 'last', true);
    expect(isLoginBlocked(IP, 'fresh')).toBe(true);
  });

  it('без идентификатора проверяются только счётчики IP', () => {
    expect(isLoginBlocked(IP, null)).toBe(false);
    recordLoginFailure(IP, null, true);  // без идентификатора считается как неизвестный
    for (let i = 0; i < 49; i++) recordLoginFailure(IP, null, false);
    expect(isLoginBlocked(IP, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/rate-limit.test.ts`
Expected: FAIL — `isLoginBlocked is not a function`.

- [ ] **Step 3: Реализовать**

`src/lib/auth/rate-limit.ts` целиком:

```ts
const WINDOW_MS = 15 * 60 * 1000;

/** Неверный пароль к одному существующему аккаунту. */
export const IDENTIFIER_LIMIT = 10;
/** Входы в несуществующие аккаунты с одного IP — перебор логинов. */
export const UNKNOWN_IP_LIMIT = 50;
/**
 * Любые неудачи с одного IP. Школа выходит в интернет через один адрес, поэтому
 * порог высокий: класс с опечатками до него не доходит.
 */
export const IP_LIMIT = 300;

const attempts = new Map<string, number[]>();

/**
 * Скользящее окно в памяти процесса. В базу хранилище переносит цикл 1.
 * Пустые окна удаляются, чтобы карта не росла от одних проверок.
 */
function pruned(key: string): number[] {
  const now = Date.now();
  const fresh = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (fresh.length) attempts.set(key, fresh);
  else attempts.delete(key);
  return fresh;
}

/** Проверка БЕЗ расхода попытки. */
export function isLimited(key: string, max: number = IDENTIFIER_LIMIT): boolean {
  return pruned(key).length >= max;
}

/** Расходует одну попытку. Успешный вход лимит не трогает. */
export function recordFailure(key: string): void {
  const fresh = pruned(key);
  fresh.push(Date.now());
  attempts.set(key, fresh);
}

const idKey = (identifier: string) => `id:${identifier}`;
const ipUnknownKey = (ip: string) => `ip-unknown:${ip}`;
const ipAllKey = (ip: string) => `ip-all:${ip}`;

/**
 * Вход закрыт, если исчерпан счётчик идентификатора или любой счётчик IP.
 * Исчерпанный IP закрывает и верные входы: иначе перебор одного частого пароля
 * по списку логинов продолжал бы находить совпадения (неудачи — 429, успехи — 200).
 */
export function isLoginBlocked(ip: string, identifier: string | null): boolean {
  return isLimited(ipAllKey(ip), IP_LIMIT)
    || isLimited(ipUnknownKey(ip), UNKNOWN_IP_LIMIT)
    || (identifier !== null && isLimited(idKey(identifier), IDENTIFIER_LIMIT));
}

/**
 * accountExists сообщает только вызывающий роут; клиент видит одинаковый 401
 * в обоих случаях, поэтому разделение счётчиков оракула не создаёт.
 */
export function recordLoginFailure(ip: string, identifier: string | null, accountExists: boolean): void {
  recordFailure(ipAllKey(ip));
  if (accountExists && identifier !== null) recordFailure(idKey(identifier));
  else recordFailure(ipUnknownKey(ip));
}

export function __resetAttemptsForTests(): void {
  attempts.clear();
}
```

- [ ] **Step 4: Подключить к роуту входа**

В `src/app/api/auth/login/route.ts`:
- импорт `isLimited, recordFailure` заменить на `isLoginBlocked, recordLoginFailure`;
- `const key = ... ? normalizeIdentifier(raw) : undefined;` → `... : null;`
- проверку лимита и `fail` заменить на:

```ts
  // Лимит проверяем ДО обращения к базе и не расходуем на самой проверке.
  if (isLoginBlocked(ip, key)) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }

  const fail = (accountExists: boolean) => {
    recordLoginFailure(ip, key, accountExists);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  };

  if (key === null || !password) return fail(false);

  const found = await findUserByIdentifier(key);
  const passwordOk = verifyPassword(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!found || !passwordOk) return fail(found !== null);
```

- [ ] **Step 5: Написать интеграционный тест**

`tests/integration/login-limit.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { createLoginUser } from '@/lib/auth/users';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'login_limit_test';
const pool = testDb(SCHEMA);
const SCHOOL_IP = { 'x-forwarded-for': '203.0.113.20' };

function post(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...SCHOOL_IP }, body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('класс за одним IP', () => {
  it('тридцать неудач по разным аккаунтам не мешают тридцать первому верному входу', async () => {
    for (let i = 0; i < 31; i++) {
      await createLoginUser({ login: `s${i}.sch12`, displayName: null, password: 'пароль123', mustChangePassword: false });
    }
    for (let i = 0; i < 30; i++) {
      expect((await login(post({ identifier: `s${i}.sch12`, password: 'опечатка1' }))).status).toBe(401);
    }
    expect((await login(post({ identifier: 's30.sch12', password: 'пароль123' }))).status).toBe(200);
  });

  it('пятьдесят входов в несуществующие аккаунты закрывают вход и верному паролю', async () => {
    await createLoginUser({ login: 'real.sch12', displayName: null, password: 'пароль123', mustChangePassword: false });
    for (let i = 0; i < 50; i++) {
      expect((await login(post({ identifier: `ghost${i}`, password: 'пароль123' }))).status).toBe(401);
    }
    expect((await login(post({ identifier: 'real.sch12', password: 'пароль123' }))).status).toBe(429);
  });
});
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/unit/rate-limit.test.ts`
Expected: PASS.

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/login-limit.test.ts tests/integration/auth-api.test.ts`
Expected: PASS (в том числе прежние «одиннадцатая попытка входа отклоняется с 429» и «лимит по почте не обходится сменой x-forwarded-for»).

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/lib/auth/rate-limit.ts src/app/api/auth/login/route.ts tests/unit/rate-limit.test.ts tests/integration/login-limit.test.ts
git commit -m "feat(auth): три счётчика неудачных входов вместо одного на IP

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Типы, настройки и политика организации (чистые модули)

**Files:**
- Create: `src/lib/org/types.ts`, `src/lib/org/settings.ts`, `src/lib/org/policy.ts`, `tests/unit/org-settings.test.ts`, `tests/unit/org-policy.test.ts`

**Interfaces:**
- Consumes: тип `AuthUser` из Task 3 (только `import type`).
- Produces:

```ts
// src/lib/org/types.ts
export type OrgRole = 'org_admin' | 'teacher' | 'student';
export const ORG_ROLES: readonly OrgRole[];
export type OrgKind = 'school' | 'college' | 'university';
export const ORG_KINDS: readonly OrgKind[];
export interface Membership {
  orgId: string; orgSlug: string; orgName: string;
  orgKind: OrgKind;
  role: OrgRole;
  settings: OrgSettings;
}
export class OrgError extends Error {}
export function isOrgRole(v: unknown): v is OrgRole;
export function isOrgKind(v: unknown): v is OrgKind;

// src/lib/org/settings.ts
export interface OrgSettings { studentsCanGenerate: boolean; studentLongSessions: boolean; teacherGenerationLimit: number }
export type StoredOrgSettings = Partial<OrgSettings>;
export const DEFAULT_ORG_SETTINGS: Readonly<OrgSettings>;
export const ORG_SETTING_KEYS: readonly ['studentsCanGenerate', 'studentLongSessions', 'teacherGenerationLimit'];
export type OrgSettingKey = (typeof ORG_SETTING_KEYS)[number];
export const MAX_TEACHER_GENERATION_LIMIT = 100000;
export function sanitizeOrgSettings(raw: unknown): StoredOrgSettings;
export function mergeOrgSettings(current: unknown, patch: unknown): StoredOrgSettings;
export function resolveOrgSettings(stored: unknown): OrgSettings;

// src/lib/org/policy.ts
export const TRIAL_LIMIT = 10;
export const GENERATION_FORBIDDEN_MESSAGE = 'Генерация недоступна для учеников вашей организации.';
export type SessionKind = 'long' | 'short';
export type NavSectionKey = 'create' | 'library' | 'labs';
export interface NavSection { key: NavSectionKey; href: string; label: string }
export const ALL_NAV_SECTIONS: readonly NavSection[];
type PolicyUser = Pick<AuthUser, 'role'>;
export function isPlatformAdmin(user: PolicyUser): boolean;
export function hasStaffRole(memberships: Membership[]): boolean;
export function navSections(user: PolicyUser, memberships: Membership[]): NavSection[];
export function canGenerate(user: PolicyUser, memberships: Membership[]): boolean;
export function sessionKind(user: PolicyUser, memberships: Membership[]): SessionKind;
export function generationLimit(user: PolicyUser, memberships: Membership[]): number | null;
```

`Pick<AuthUser, 'role'>` принимает полный `AuthUser`, поэтому сигнатуры спецификации соблюдены, а тестам достаточно `{ role }`.

- [ ] **Step 1: Написать падающие тесты**

`tests/unit/org-settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  sanitizeOrgSettings, mergeOrgSettings, resolveOrgSettings, DEFAULT_ORG_SETTINGS, ORG_SETTING_KEYS,
} from '@/lib/org/settings';

describe('настройки организации', () => {
  it('значения по умолчанию', () => {
    expect(DEFAULT_ORG_SETTINGS).toEqual({
      studentsCanGenerate: false, studentLongSessions: false, teacherGenerationLimit: 100,
    });
    expect([...ORG_SETTING_KEYS]).toEqual(['studentsCanGenerate', 'studentLongSessions', 'teacherGenerationLimit']);
  });

  it('белый список: неизвестные ключи и неверные типы отбрасываются', () => {
    expect(sanitizeOrgSettings({
      studentsCanGenerate: true, studentLongSessions: 'да', teacherGenerationLimit: 50, hack: 1,
    })).toEqual({ studentsCanGenerate: true, teacherGenerationLimit: 50 });
    expect(sanitizeOrgSettings(null)).toEqual({});
    expect(sanitizeOrgSettings([true])).toEqual({});
    expect(sanitizeOrgSettings('x')).toEqual({});
  });

  it('лимит учителя — целое от 0 до 100000', () => {
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 0 })).toEqual({ teacherGenerationLimit: 0 });
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 100000 })).toEqual({ teacherGenerationLimit: 100000 });
    expect(sanitizeOrgSettings({ teacherGenerationLimit: -1 })).toEqual({});
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 2.5 })).toEqual({});
    expect(sanitizeOrgSettings({ teacherGenerationLimit: 100001 })).toEqual({});
    expect(sanitizeOrgSettings({ teacherGenerationLimit: Number.NaN })).toEqual({});
  });

  it('слияние перекрывает пришедшие ключи и сохраняет остальные', () => {
    expect(mergeOrgSettings({ studentsCanGenerate: true, junk: 1 }, { teacherGenerationLimit: 5, other: 2 }))
      .toEqual({ studentsCanGenerate: true, teacherGenerationLimit: 5 });
    expect(mergeOrgSettings({ studentsCanGenerate: true }, { studentsCanGenerate: false }))
      .toEqual({ studentsCanGenerate: false });
  });

  it('разрешённые настройки дополняются значениями по умолчанию', () => {
    expect(resolveOrgSettings({ studentLongSessions: true })).toEqual({
      studentsCanGenerate: false, studentLongSessions: true, teacherGenerationLimit: 100,
    });
    expect(resolveOrgSettings(undefined)).toEqual(DEFAULT_ORG_SETTINGS);
  });
});
```

`tests/unit/org-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  navSections, canGenerate, sessionKind, generationLimit, hasStaffRole, isPlatformAdmin,
  ALL_NAV_SECTIONS, TRIAL_LIMIT,
} from '@/lib/org/policy';
import { resolveOrgSettings, type OrgSettings } from '@/lib/org/settings';
import type { Membership, OrgRole } from '@/lib/org/types';

const USER = { role: 'user' as const };
const ADMIN = { role: 'admin' as const };

function member(role: OrgRole, settings: Partial<OrgSettings> = {}, orgId = 'o1'): Membership {
  return {
    orgId, orgSlug: orgId, orgName: `Организация ${orgId}`, orgKind: 'school',
    role, settings: resolveOrgSettings(settings),
  };
}

describe('право на генерацию', () => {
  it('платформенный админ — да, даже если он только ученик', () => {
    expect(canGenerate(ADMIN, [member('student')])).toBe(true);
  });
  it('без членств — да', () => {
    expect(canGenerate(USER, [])).toBe(true);
  });
  it('учитель или админ организации — да', () => {
    expect(canGenerate(USER, [member('teacher')])).toBe(true);
    expect(canGenerate(USER, [member('org_admin')])).toBe(true);
    expect(canGenerate(USER, [member('student', {}, 'o1'), member('teacher', {}, 'o2')])).toBe(true);
  });
  it('только ученик — нет, пока ни одна организация не разрешила', () => {
    expect(canGenerate(USER, [member('student')])).toBe(false);
    expect(canGenerate(USER, [member('student', {}, 'o1'), member('student', {}, 'o2')])).toBe(false);
  });
  it('ученик двух организаций с разными настройками — разрешает любая', () => {
    expect(canGenerate(USER, [
      member('student', { studentsCanGenerate: false }, 'o1'),
      member('student', { studentsCanGenerate: true }, 'o2'),
    ])).toBe(true);
  });
});

describe('лимит генераций', () => {
  it('платформенный админ — без лимита', () => {
    expect(generationLimit(ADMIN, [member('teacher')])).toBeNull();
  });
  it('без членств и ученик — пробные 10', () => {
    expect(TRIAL_LIMIT).toBe(10);
    expect(generationLimit(USER, [])).toBe(10);
    expect(generationLimit(USER, [member('student', { studentsCanGenerate: true })])).toBe(10);
  });
  it('учитель — лимит организации, по умолчанию 100', () => {
    expect(generationLimit(USER, [member('teacher')])).toBe(100);
    expect(generationLimit(USER, [member('org_admin', { teacherGenerationLimit: 7 })])).toBe(7);
  });
  it('учитель нескольких организаций — наибольший лимит среди них', () => {
    expect(generationLimit(USER, [
      member('teacher', { teacherGenerationLimit: 20 }, 'o1'),
      member('org_admin', { teacherGenerationLimit: 300 }, 'o2'),
      member('student', { teacherGenerationLimit: 5000 }, 'o3'),
    ])).toBe(300);
  });
});

describe('тип сессии', () => {
  it('платформенный админ — всегда обычная', () => {
    expect(sessionKind(ADMIN, [member('student')])).toBe('long');
  });
  it('без членств — обычная', () => {
    expect(sessionKind(USER, [])).toBe('long');
  });
  it('только ученик — короткая', () => {
    expect(sessionKind(USER, [member('student')])).toBe('short');
  });
  it('ученик и учитель одновременно — обычная', () => {
    expect(sessionKind(USER, [member('student', {}, 'o1'), member('teacher', {}, 'o2')])).toBe('long');
    expect(sessionKind(USER, [member('student', {}, 'o1'), member('org_admin', {}, 'o2')])).toBe('long');
  });
  it('организация включила длинные сессии ученикам — обычная', () => {
    expect(sessionKind(USER, [
      member('student', {}, 'o1'), member('student', { studentLongSessions: true }, 'o2'),
    ])).toBe('long');
  });
});

describe('разделы навигации', () => {
  const keys = (s: { key: string }[]) => s.map((x) => x.key);

  it('полный список — Создать, Библиотека, Лаборатории', () => {
    expect(ALL_NAV_SECTIONS.map((s) => [s.key, s.href, s.label])).toEqual([
      ['create', '/', 'Создать'],
      ['library', '/library', 'Библиотека'],
      ['labs', '/labs', 'Лаборатории'],
    ]);
  });
  it('без членств, учитель и админ видят все три', () => {
    expect(keys(navSections(USER, []))).toEqual(['create', 'library', 'labs']);
    expect(keys(navSections(USER, [member('teacher')]))).toEqual(['create', 'library', 'labs']);
    expect(keys(navSections(ADMIN, [member('student')]))).toEqual(['create', 'library', 'labs']);
  });
  it('ученик без права генерации не видит «Создать»', () => {
    expect(keys(navSections(USER, [member('student')]))).toEqual(['library', 'labs']);
    expect(keys(navSections(USER, [member('student', { studentsCanGenerate: true })])))
      .toEqual(['create', 'library', 'labs']);
  });
});

describe('вспомогательные', () => {
  it('hasStaffRole и isPlatformAdmin', () => {
    expect(hasStaffRole([])).toBe(false);
    expect(hasStaffRole([member('student')])).toBe(false);
    expect(hasStaffRole([member('teacher')])).toBe(true);
    expect(isPlatformAdmin(ADMIN)).toBe(true);
    expect(isPlatformAdmin(USER)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run tests/unit/org-settings.test.ts tests/unit/org-policy.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/org/settings"`.

- [ ] **Step 3: Реализовать `settings.ts`**

`src/lib/org/settings.ts`:

```ts
/**
 * Настройки организации (organizations.settings). Белый список по образцу
 * sanitizePrefs: неизвестные ключи и неверные значения не попадают в базу.
 * Модуль чистый — без базы.
 */
export interface OrgSettings {
  /** Ученики этой организации могут генерировать. */
  studentsCanGenerate: boolean;
  /** Ученикам — обычные 30-дневные сессии вместо 12-часовых. */
  studentLongSessions: boolean;
  /** Лимит генераций учителя за всё время. */
  teacherGenerationLimit: number;
}

/** То, что хранится в jsonb: только явно заданные ключи. */
export type StoredOrgSettings = Partial<OrgSettings>;

export const DEFAULT_ORG_SETTINGS: Readonly<OrgSettings> = Object.freeze({
  studentsCanGenerate: false,
  studentLongSessions: false,
  teacherGenerationLimit: 100,
});

export const ORG_SETTING_KEYS = ['studentsCanGenerate', 'studentLongSessions', 'teacherGenerationLimit'] as const;
export type OrgSettingKey = (typeof ORG_SETTING_KEYS)[number];

export const MAX_TEACHER_GENERATION_LIMIT = 100000;

export function sanitizeOrgSettings(raw: unknown): StoredOrgSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: StoredOrgSettings = {};
  if (typeof src.studentsCanGenerate === 'boolean') out.studentsCanGenerate = src.studentsCanGenerate;
  if (typeof src.studentLongSessions === 'boolean') out.studentLongSessions = src.studentLongSessions;
  const limit = src.teacherGenerationLimit;
  if (typeof limit === 'number' && Number.isInteger(limit)
    && limit >= 0 && limit <= MAX_TEACHER_GENERATION_LIMIT) {
    out.teacherGenerationLimit = limit;
  }
  return out;
}

/** Частичное обновление: пришедшие ключи перекрывают старые, остальные сохраняются. */
export function mergeOrgSettings(current: unknown, patch: unknown): StoredOrgSettings {
  return { ...sanitizeOrgSettings(current), ...sanitizeOrgSettings(patch) };
}

/** Полные настройки для проверок прав: хранимое поверх значений по умолчанию. */
export function resolveOrgSettings(stored: unknown): OrgSettings {
  return { ...DEFAULT_ORG_SETTINGS, ...sanitizeOrgSettings(stored) };
}
```

- [ ] **Step 4: Реализовать `types.ts`**

`src/lib/org/types.ts`:

```ts
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
```

- [ ] **Step 5: Реализовать `policy.ts`**

`src/lib/org/policy.ts`:

```ts
import type { AuthUser } from '../auth/users';
import type { Membership } from './types';

/**
 * Кто что может — как чистые функции от пользователя и его членств.
 * Членства приходят из listMemberships (архивные организации туда не попадают).
 * Модуль без базы: его зовут роуты, layout и юнит-тесты.
 */

export const TRIAL_LIMIT = 10;

export const GENERATION_FORBIDDEN_MESSAGE = 'Генерация недоступна для учеников вашей организации.';

export type SessionKind = 'long' | 'short';

export type NavSectionKey = 'create' | 'library' | 'labs';

export interface NavSection {
  key: NavSectionKey;
  href: string;
  label: string;
}

/**
 * Только разделы, у которых уже есть страницы. Следующие циклы добавляют сюда
 * «Курсы», «Преподавание» и прочие вместе со своими страницами.
 */
export const ALL_NAV_SECTIONS: readonly NavSection[] = [
  { key: 'create', href: '/', label: 'Создать' },
  { key: 'library', href: '/library', label: 'Библиотека' },
  { key: 'labs', href: '/labs', label: 'Лаборатории' },
];

type PolicyUser = Pick<AuthUser, 'role'>;

export function isPlatformAdmin(user: PolicyUser): boolean {
  return user.role === 'admin';
}

function isStaff(m: Membership): boolean {
  return m.role === 'teacher' || m.role === 'org_admin';
}

/** Есть ли членство учителя или админа организации (org_admin включает права учителя). */
export function hasStaffRole(memberships: Membership[]): boolean {
  return memberships.some(isStaff);
}

export function canGenerate(user: PolicyUser, memberships: Membership[]): boolean {
  if (isPlatformAdmin(user)) return true;
  if (memberships.length === 0) return true;
  if (hasStaffRole(memberships)) return true;
  // Остались только ученические членства: разрешает любая организация.
  return memberships.some((m) => m.settings.studentsCanGenerate);
}

export function sessionKind(user: PolicyUser, memberships: Membership[]): SessionKind {
  if (isPlatformAdmin(user)) return 'long';
  if (hasStaffRole(memberships)) return 'long';
  if (!memberships.some((m) => m.role === 'student')) return 'long';
  if (memberships.some((m) => m.settings.studentLongSessions)) return 'long';
  return 'short';
}

/** null — без лимита. Учителю — наибольший лимит среди организаций, где он учитель или админ. */
export function generationLimit(user: PolicyUser, memberships: Membership[]): number | null {
  if (isPlatformAdmin(user)) return null;
  const staff = memberships.filter(isStaff);
  if (staff.length === 0) return TRIAL_LIMIT;
  return Math.max(...staff.map((m) => m.settings.teacherGenerationLimit));
}

export function navSections(user: PolicyUser, memberships: Membership[]): NavSection[] {
  const allowCreate = canGenerate(user, memberships);
  return ALL_NAV_SECTIONS.filter((s) => s.key !== 'create' || allowCreate);
}
```

- [ ] **Step 6: Запустить — убедиться, что проходят**

Run: `npx vitest run tests/unit/org-settings.test.ts tests/unit/org-policy.test.ts`
Expected: PASS.

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/lib/org/types.ts src/lib/org/settings.ts src/lib/org/policy.ts tests/unit/org-settings.test.ts tests/unit/org-policy.test.ts
git commit -m "feat(org): настройки и политика организации — чистые функции

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Доступ, организации и группы в базе

**Files:**
- Create: `src/lib/org/access.ts`, `src/lib/org/orgs.ts`, `src/lib/org/groups.ts`
- Test: `tests/integration/org-access.test.ts`

**Interfaces:**
- Consumes: `db()`; `AuthUser`, `createUser`, `createLoginUser` из Task 3; `types.ts`, `settings.ts`, `policy.ts` из Task 5.
- Produces:

```ts
// src/lib/org/access.ts
export type { Membership, OrgKind, OrgRole } from './types';
export { isPlatformAdmin } from './policy';
export function isUuid(value: string): boolean;
export function listMemberships(userId: string): Promise<Membership[]>;              // без архивных
export function orgRoleOf(userId: string, orgId: string): Promise<OrgRole | null>;
export function requireOrgRole(user: AuthUser, orgId: string, allowed: OrgRole[]): Promise<Membership | null>;
export function canManageGroup(user: AuthUser, groupId: string): Promise<boolean>;

// src/lib/org/orgs.ts
export const SLUG_RE: RegExp;                                  // /^[a-z0-9-]{2,32}$/
export function isValidSlug(slug: string): boolean;
export interface Organization { id: string; slug: string; name: string; kind: OrgKind; settings: OrgSettings; archivedAt: string | null }
export function createOrganization(input: { slug: string; name: string; kind: string }): Promise<Organization>;
export function findOrgBySlug(slug: string): Promise<Organization | null>;
export function listOrganizations(): Promise<(Organization & { memberCount: number })[]>;
export function addMember(orgId: string, userId: string, role: OrgRole): Promise<void>;
export function updateOrgSettings(orgId: string, patch: unknown): Promise<OrgSettings>;

// src/lib/org/groups.ts
export interface Group { id: string; orgId: string; title: string }
export function createGroup(orgId: string, title: string): Promise<Group>;
export function findGroupByTitle(orgId: string, title: string): Promise<Group | null>;
export function addToGroup(groupId: string, userId: string): Promise<void>;     // единственная запись в group_members
export function assignTeacher(groupId: string, userId: string): Promise<void>;
```

Правила: `org_admin` проходит там, где разрешён `teacher`. Платформенный админ проходит `requireOrgRole` для любой существующей организации, включая архивную, и получает синтетическое членство с ролью `org_admin`. Невалидный uuid — `null`/`false` без запроса к базе.

- [ ] **Step 1: Написать падающий тест**

`tests/integration/org-access.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import {
  createOrganization, findOrgBySlug, listOrganizations, addMember, updateOrgSettings, isValidSlug,
  type Organization,
} from '@/lib/org/orgs';
import { createGroup, findGroupByTitle, addToGroup, assignTeacher } from '@/lib/org/groups';
import { listMemberships, orgRoleOf, requireOrgRole, canManageGroup, isUuid } from '@/lib/org/access';
import { OrgError } from '@/lib/org/types';

const SCHEMA = 'org_access_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe('проверки без базы', () => {
  it('слаг: строчная латиница, цифры, дефис, 2–32 символа', () => {
    expect(isValidSlug('sch12')).toBe(true);
    expect(isValidSlug('kz-college-7')).toBe(true);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('a'.repeat(33))).toBe(false);
    expect(isValidSlug('Sch12')).toBe(false);
    expect(isValidSlug('шк12')).toBe(false);
    expect(isValidSlug('sch_12')).toBe(false);
  });
  it('isUuid', () => {
    expect(isUuid('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(isUuid('../evil')).toBe(false);
  });
});

describe.skipIf(!pool)('доступ в организации', () => {
  let sch: Organization;
  let other: Organization;
  let teacher: AuthUser;
  let student: AuthUser;
  let orgAdmin: AuthUser;
  let stranger: AuthUser;
  let admin: AuthUser;

  beforeEach(async () => {
    sch = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    other = await createOrganization({ slug: 'col7', name: 'Колледж №7', kind: 'college' });
    teacher = await createUser('teacher@example.com', 'пароль123');
    orgAdmin = await createUser('director@example.com', 'пароль123');
    student = await createLoginUser({
      login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false,
    });
    stranger = await createLoginUser({
      login: 'petrov.p.col7', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'boss@example.com';
    admin = await createUser('boss@example.com', 'пароль123');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
    await addMember(sch.id, teacher.id, 'teacher');
    await addMember(sch.id, orgAdmin.id, 'org_admin');
    await addMember(sch.id, student.id, 'student');
    await addMember(other.id, stranger.id, 'student');
  });

  it('listMemberships отдаёт организацию с настройками по умолчанию', async () => {
    expect(await listMemberships(student.id)).toEqual([{
      orgId: sch.id, orgSlug: 'sch12', orgName: 'Школа №12', orgKind: 'school', role: 'student',
      settings: { studentsCanGenerate: false, studentLongSessions: false, teacherGenerationLimit: 100 },
    }]);
    expect(await listMemberships(admin.id)).toEqual([]);
  });

  it('в одной организации у человека одна роль: повторное добавление меняет её', async () => {
    await addMember(sch.id, student.id, 'teacher');
    expect(await orgRoleOf(student.id, sch.id)).toBe('teacher');
    const { rows } = await pool!.query('SELECT 1 FROM memberships WHERE user_id = $1', [student.id]);
    expect(rows).toHaveLength(1);
  });

  it('requireOrgRole: чужая организация — null, своя с подходящей ролью — членство', async () => {
    expect(await requireOrgRole(teacher, other.id, ['teacher', 'org_admin'])).toBeNull();
    expect((await requireOrgRole(teacher, sch.id, ['teacher']))?.role).toBe('teacher');
    expect(await requireOrgRole(teacher, sch.id, ['org_admin'])).toBeNull();
    expect(await requireOrgRole(student, sch.id, ['teacher'])).toBeNull();
    // org_admin включает права учителя.
    expect((await requireOrgRole(orgAdmin, sch.id, ['teacher']))?.role).toBe('org_admin');
    expect(await requireOrgRole(teacher, 'не-uuid', ['teacher'])).toBeNull();
  });

  it('платформенный админ проходит в любую существующую организацию', async () => {
    const m = await requireOrgRole(admin, other.id, ['org_admin']);
    expect(m).toMatchObject({ orgId: other.id, orgSlug: 'col7', role: 'org_admin' });
    expect(await requireOrgRole(admin, '00000000-0000-0000-0000-000000000000', ['org_admin'])).toBeNull();
  });

  it('addToGroup пускает только члена организации группы', async () => {
    const g = await createGroup(sch.id, '7А');
    await expect(addToGroup(g.id, stranger.id)).rejects.toBeInstanceOf(OrgError);
    await expect(addToGroup(g.id, admin.id)).rejects.toBeInstanceOf(OrgError);
    const before = await pool!.query('SELECT 1 FROM group_members');
    expect(before.rows).toHaveLength(0);
    await addToGroup(g.id, student.id);
    await addToGroup(g.id, student.id);  // повтор безвреден
    const after = await pool!.query('SELECT user_id FROM group_members');
    expect(after.rows).toEqual([{ user_id: student.id }]);
    await expect(addToGroup('00000000-0000-0000-0000-000000000000', student.id)).rejects.toBeInstanceOf(OrgError);
  });

  it('группы: название обязательно и не повторяется внутри организации', async () => {
    const g = await createGroup(sch.id, ' 7А ');
    expect(g.title).toBe('7А');
    await expect(createGroup(sch.id, '7А')).rejects.toBeInstanceOf(OrgError);
    await expect(createGroup(sch.id, '   ')).rejects.toBeInstanceOf(OrgError);
    expect((await createGroup(other.id, '7А')).orgId).toBe(other.id);
    expect((await findGroupByTitle(sch.id, '7А'))?.id).toBe(g.id);
    expect(await findGroupByTitle(sch.id, '8Б')).toBeNull();
  });

  it('учителем группы назначается только учитель или админ этой организации', async () => {
    const g = await createGroup(sch.id, '7А');
    await expect(assignTeacher(g.id, student.id)).rejects.toBeInstanceOf(OrgError);
    await expect(assignTeacher(g.id, stranger.id)).rejects.toBeInstanceOf(OrgError);
    await assignTeacher(g.id, teacher.id);
    await assignTeacher(g.id, teacher.id);
    const { rows } = await pool!.query('SELECT user_id FROM group_teachers');
    expect(rows).toEqual([{ user_id: teacher.id }]);
  });

  it('canManageGroup: админ организации, назначенный учитель и платформенный админ', async () => {
    const g = await createGroup(sch.id, '7А');
    expect(await canManageGroup(teacher, g.id)).toBe(false);
    await assignTeacher(g.id, teacher.id);
    expect(await canManageGroup(teacher, g.id)).toBe(true);
    expect(await canManageGroup(orgAdmin, g.id)).toBe(true);
    expect(await canManageGroup(admin, g.id)).toBe(true);
    expect(await canManageGroup(student, g.id)).toBe(false);
    expect(await canManageGroup(stranger, g.id)).toBe(false);
    expect(await canManageGroup(admin, 'не-uuid')).toBe(false);
  });

  it('архивная организация не даёт прав', async () => {
    const g = await createGroup(sch.id, '7А');
    await assignTeacher(g.id, teacher.id);
    await pool!.query('UPDATE organizations SET archived_at = now() WHERE id = $1', [sch.id]);
    expect(await listMemberships(teacher.id)).toEqual([]);
    expect(await orgRoleOf(teacher.id, sch.id)).toBeNull();
    expect(await requireOrgRole(teacher, sch.id, ['teacher'])).toBeNull();
    expect(await canManageGroup(teacher, g.id)).toBe(false);
    expect(await canManageGroup(orgAdmin, g.id)).toBe(false);
  });

  it('создание организации: занятый и кривой слаг — отказ, ничего не создано', async () => {
    await expect(createOrganization({ slug: 'SCH12', name: 'Дубль', kind: 'school' }))
      .rejects.toThrow('Слаг «sch12» уже занят.');
    await expect(createOrganization({ slug: 'шк', name: 'X', kind: 'school' })).rejects.toBeInstanceOf(OrgError);
    await expect(createOrganization({ slug: 'ok-slug', name: 'X', kind: 'kindergarten' }))
      .rejects.toBeInstanceOf(OrgError);
    await expect(createOrganization({ slug: 'ok-slug', name: '  ', kind: 'school' }))
      .rejects.toBeInstanceOf(OrgError);
    const list = await listOrganizations();
    expect(list.map((o) => [o.slug, o.memberCount])).toEqual([['col7', 1], ['sch12', 3]]);
    expect((await findOrgBySlug('SCH12'))?.id).toBe(sch.id);
    expect(await findOrgBySlug('nope')).toBeNull();
  });

  it('updateOrgSettings пишет только известные ключи и возвращает полные настройки', async () => {
    const s = await updateOrgSettings(sch.id, { studentsCanGenerate: true, hack: 'да' });
    expect(s).toEqual({ studentsCanGenerate: true, studentLongSessions: false, teacherGenerationLimit: 100 });
    await updateOrgSettings(sch.id, { teacherGenerationLimit: 5 });
    const { rows } = await pool!.query<{ settings: unknown }>(
      'SELECT settings FROM organizations WHERE id = $1', [sch.id]);
    expect(rows[0].settings).toEqual({ studentsCanGenerate: true, teacherGenerationLimit: 5 });
    await expect(updateOrgSettings('00000000-0000-0000-0000-000000000000', {}))
      .rejects.toBeInstanceOf(OrgError);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/org-access.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/org/orgs"`.

- [ ] **Step 3: Реализовать `orgs.ts`**

`src/lib/org/orgs.ts`:

```ts
import crypto from 'node:crypto';
import { db } from '../db/client';
import { mergeOrgSettings, resolveOrgSettings, type OrgSettings } from './settings';
import { OrgError, isOrgKind, type OrgKind, type OrgRole } from './types';

export const SLUG_RE = /^[a-z0-9-]{2,32}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  settings: OrgSettings;
  archivedAt: string | null;
}

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  settings: unknown;
  archived_at: Date | null;
}

const ORG_COLUMNS = 'id, slug, name, kind, settings, archived_at';

function toOrganization(r: OrgRow): Organization {
  return {
    id: r.id, slug: r.slug, name: r.name, kind: r.kind,
    settings: resolveOrgSettings(r.settings),
    archivedAt: r.archived_at ? r.archived_at.toISOString() : null,
  };
}

export async function createOrganization(input: { slug: string; name: string; kind: string }): Promise<Organization> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  if (!isValidSlug(slug)) {
    throw new OrgError('Слаг может содержать только строчные латинские буквы, цифры и дефис, от 2 до 32 символов.');
  }
  if (!name) throw new OrgError('Укажите название организации.');
  if (!isOrgKind(input.kind)) throw new OrgError('Тип организации — school, college или university.');
  try {
    const { rows } = await db().query<OrgRow>(
      `INSERT INTO organizations (id, slug, name, kind) VALUES ($1,$2,$3,$4) RETURNING ${ORG_COLUMNS}`,
      [crypto.randomUUID(), slug, name, input.kind]);
    return toOrganization(rows[0]);
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
      throw new OrgError(`Слаг «${slug}» уже занят.`);
    }
    throw e;
  }
}

/** Ищет и архивные: скрипту и будущей админке нужно видеть их, правам — нет. */
export async function findOrgBySlug(slug: string): Promise<Organization | null> {
  const { rows } = await db().query<OrgRow>(
    `SELECT ${ORG_COLUMNS} FROM organizations WHERE slug = $1`, [slug.trim().toLowerCase()]);
  return rows[0] ? toOrganization(rows[0]) : null;
}

export async function listOrganizations(): Promise<(Organization & { memberCount: number })[]> {
  const { rows } = await db().query<OrgRow & { member_count: number }>(
    `SELECT ${ORG_COLUMNS},
       (SELECT count(*)::int FROM memberships m WHERE m.org_id = organizations.id) AS member_count
     FROM organizations ORDER BY slug`);
  return rows.map((r) => ({ ...toOrganization(r), memberCount: r.member_count }));
}

/** В одной организации у человека ровно одна роль: повторный вызов её меняет. */
export async function addMember(orgId: string, userId: string, role: OrgRole): Promise<void> {
  await db().query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [orgId, userId, role]);
}

export async function updateOrgSettings(orgId: string, patch: unknown): Promise<OrgSettings> {
  const { rows } = await db().query<{ settings: unknown }>(
    'SELECT settings FROM organizations WHERE id = $1', [orgId]);
  if (!rows[0]) throw new OrgError('Организация не найдена.');
  const next = mergeOrgSettings(rows[0].settings, patch);
  await db().query('UPDATE organizations SET settings = $2 WHERE id = $1', [orgId, JSON.stringify(next)]);
  return resolveOrgSettings(next);
}
```

- [ ] **Step 4: Реализовать `access.ts`**

`src/lib/org/access.ts`:

```ts
import { db } from '../db/client';
import type { AuthUser } from '../auth/users';
import { resolveOrgSettings } from './settings';
import { isPlatformAdmin } from './policy';
import type { Membership, OrgKind, OrgRole } from './types';

export type { Membership, OrgKind, OrgRole } from './types';
export { isPlatformAdmin } from './policy';

/**
 * Единственное место, которое знает, кто что может в организации. При отказе
 * функции возвращают null/false, а роут отвечает 404 — так чужая организация
 * неотличима от несуществующей. Архивные организации прав не дают.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Кривой id не должен доходить до базы: Postgres ответил бы ошибкой типа, а не «не найдено». */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

interface MembershipRow {
  org_id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  role: OrgRole;
  settings: unknown;
}

function toMembership(r: MembershipRow): Membership {
  return {
    orgId: r.org_id, orgSlug: r.slug, orgName: r.name, orgKind: r.kind,
    role: r.role, settings: resolveOrgSettings(r.settings),
  };
}

const MEMBERSHIP_SELECT = `
  SELECT o.id AS org_id, o.slug, o.name, o.kind, m.role, o.settings
  FROM memberships m JOIN organizations o ON o.id = m.org_id
  WHERE o.archived_at IS NULL`;

export async function listMemberships(userId: string): Promise<Membership[]> {
  const { rows } = await db().query<MembershipRow>(
    `${MEMBERSHIP_SELECT} AND m.user_id = $1 ORDER BY o.name`, [userId]);
  return rows.map(toMembership);
}

export async function orgRoleOf(userId: string, orgId: string): Promise<OrgRole | null> {
  if (!isUuid(orgId)) return null;
  const { rows } = await db().query<MembershipRow>(
    `${MEMBERSHIP_SELECT} AND m.user_id = $1 AND m.org_id = $2`, [userId, orgId]);
  return rows[0]?.role ?? null;
}

/** org_admin включает права учителя. */
function roleAllowed(role: OrgRole, allowed: OrgRole[]): boolean {
  if (allowed.includes(role)) return true;
  return role === 'org_admin' && allowed.includes('teacher');
}

export async function requireOrgRole(
  user: AuthUser, orgId: string, allowed: OrgRole[],
): Promise<Membership | null> {
  if (!isUuid(orgId)) return null;
  if (isPlatformAdmin(user)) {
    // Админ платформы видит любую организацию, в том числе архивную, — как её админ.
    const { rows } = await db().query<MembershipRow>(
      `SELECT id AS org_id, slug, name, kind, 'org_admin' AS role, settings
       FROM organizations WHERE id = $1`, [orgId]);
    return rows[0] ? toMembership(rows[0]) : null;
  }
  const { rows } = await db().query<MembershipRow>(
    `${MEMBERSHIP_SELECT} AND m.user_id = $1 AND m.org_id = $2`, [user.id, orgId]);
  const row = rows[0];
  if (!row || !roleAllowed(row.role, allowed)) return null;
  return toMembership(row);
}

/** Админ организации группы или учитель, которому группа назначена. */
export async function canManageGroup(user: AuthUser, groupId: string): Promise<boolean> {
  if (!isUuid(groupId)) return false;
  const { rows } = await db().query<{ org_id: string }>('SELECT org_id FROM groups WHERE id = $1', [groupId]);
  const group = rows[0];
  if (!group) return false;
  if (isPlatformAdmin(user)) return true;
  const role = await orgRoleOf(user.id, group.org_id);
  if (role === 'org_admin') return true;
  if (role !== 'teacher') return false;
  const assigned = await db().query(
    'SELECT 1 FROM group_teachers WHERE group_id = $1 AND user_id = $2', [groupId, user.id]);
  return (assigned.rowCount ?? 0) > 0;
}
```

- [ ] **Step 5: Реализовать `groups.ts`**

`src/lib/org/groups.ts`:

```ts
import crypto from 'node:crypto';
import { db } from '../db/client';
import { isUuid } from './access';
import { OrgError } from './types';

export interface Group {
  id: string;
  orgId: string;
  title: string;
}

const MAX_GROUP_TITLE = 60;

interface GroupRow { id: string; org_id: string; title: string }

function toGroup(r: GroupRow): Group {
  return { id: r.id, orgId: r.org_id, title: r.title };
}

export async function findGroupByTitle(orgId: string, title: string): Promise<Group | null> {
  const { rows } = await db().query<GroupRow>(
    'SELECT id, org_id, title FROM groups WHERE org_id = $1 AND title = $2 AND archived_at IS NULL',
    [orgId, title.trim()]);
  return rows[0] ? toGroup(rows[0]) : null;
}

export async function createGroup(orgId: string, title: string): Promise<Group> {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (!clean) throw new OrgError('Укажите название группы.');
  if (clean.length > MAX_GROUP_TITLE) {
    throw new OrgError(`Название группы должно быть не длиннее ${MAX_GROUP_TITLE} символов.`);
  }
  if (await findGroupByTitle(orgId, clean)) {
    throw new OrgError(`Группа «${clean}» уже есть в этой организации.`);
  }
  const { rows } = await db().query<GroupRow>(
    'INSERT INTO groups (id, org_id, title) VALUES ($1,$2,$3) RETURNING id, org_id, title',
    [crypto.randomUUID(), orgId, clean]);
  return toGroup(rows[0]);
}

/**
 * Единственный путь записи в group_members. Схема не может проверить, что ученик
 * состоит в организации группы (для этого нужны составные ключи во всех таблицах),
 * поэтому инвариант держит эта функция.
 */
export async function addToGroup(groupId: string, userId: string): Promise<void> {
  if (!isUuid(groupId)) throw new OrgError('Группа не найдена.');
  const { rows } = await db().query(
    `SELECT 1 FROM groups g JOIN memberships m ON m.org_id = g.org_id
     WHERE g.id = $1 AND m.user_id = $2`, [groupId, userId]);
  if (rows.length === 0) {
    throw new OrgError('Добавить в группу можно только члена организации этой группы.');
  }
  await db().query(
    'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, userId]);
}

export async function assignTeacher(groupId: string, userId: string): Promise<void> {
  if (!isUuid(groupId)) throw new OrgError('Группа не найдена.');
  const { rows } = await db().query(
    `SELECT 1 FROM groups g JOIN memberships m ON m.org_id = g.org_id
     WHERE g.id = $1 AND m.user_id = $2 AND m.role IN ('teacher', 'org_admin')`, [groupId, userId]);
  if (rows.length === 0) {
    throw new OrgError('Учителем группы можно назначить только учителя или администратора её организации.');
  }
  await db().query(
    'INSERT INTO group_teachers (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, userId]);
}
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/org-access.test.ts`
Expected: PASS.

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/lib/org/access.ts src/lib/org/orgs.ts src/lib/org/groups.ts tests/integration/org-access.test.ts
git commit -m "feat(org): доступ по членствам, организации и группы

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Короткие сессии учеников и блокировка аккаунта

**Files:**
- Modify: `src/lib/auth/session.ts`, `src/lib/auth/cookie.ts`, `src/lib/auth/users.ts`, `src/app/api/auth/login/route.ts`
- Test: `tests/integration/session-kind.test.ts`

**Interfaces:**
- Consumes: `listMemberships` (Task 6), `sessionKind`, `SessionKind` (Task 5), `isLoginBlocked`/`recordLoginFailure` (Task 4).
- Produces:

```ts
// src/lib/auth/session.ts
export const SESSION_TTL_MS: number;            // 30 дней, как было
export const SHORT_SESSION_TTL_MS: number;      // 12 часов
export function sessionTtlMs(kind: SessionKind): number;
export function createSession(userId: string, kind?: SessionKind): Promise<string>;   // по умолчанию 'long'
export function resolveSession(token: string | undefined): Promise<AuthUser | null>; // null для заблокированных

// src/lib/auth/cookie.ts
export function setSessionCookie(res: NextResponse, token: string, secure: boolean, ttlMs?: number): NextResponse;

// src/lib/auth/users.ts
export function findActiveUserById(id: string): Promise<AuthUser | null>;   // null, если disabled_at задан
export function disableUser(userId: string): Promise<void>;                 // ставит disabled_at и удаляет все сессии
```

- `POST /api/auth/login`: заблокированный аккаунт с верным паролем — 403 «Аккаунт заблокирован. Обратитесь к администратору организации.»; с неверным — обычный 401. Тип сессии считается при входе и дальше не пересчитывается.

- [ ] **Step 1: Написать падающий тест**

`tests/integration/session-kind.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as register } from '@/app/api/auth/register/route';
import { GET as me } from '@/app/api/me/route';
import { createUser, createLoginUser, disableUser } from '@/lib/auth/users';
import { resolveSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createOrganization, addMember, updateOrgSettings } from '@/lib/org/orgs';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'session_kind_test';
const pool = testDb(SCHEMA);
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function post(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}
function tokenOf(res: Response): string {
  return cookieOf(res).slice(SESSION_COOKIE.length + 1);
}
async function sessionRow(): Promise<{ expires_at: Date; sliding: boolean }> {
  const { rows } = await pool!.query<{ expires_at: Date; sliding: boolean }>(
    'SELECT expires_at, sliding FROM sessions');
  expect(rows).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('тип сессии', () => {
  async function student(orgSettings: unknown = {}) {
    const org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    await updateOrgSettings(org.id, orgSettings);
    const u = await createLoginUser({
      login: 'ivanov.i.sch12', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    await addMember(org.id, u.id, 'student');
    return u;
  }

  it('ученик получает 12-часовую непродлеваемую сессию', async () => {
    await student();
    const res = await login(post({ identifier: 'ivanov.i.sch12', password: 'пароль123' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=43200');
    const row = await sessionRow();
    expect(row.sliding).toBe(false);
    expect(Math.abs(row.expires_at.getTime() - (Date.now() + 12 * HOUR))).toBeLessThan(60_000);

    // Осталось меньше часа — скользящая сессия продлилась бы, короткая нет.
    await pool!.query("UPDATE sessions SET expires_at = now() + interval '1 hour'");
    expect(await resolveSession(tokenOf(res))).not.toBeNull();
    expect((await sessionRow()).expires_at.getTime()).toBeLessThan(Date.now() + 2 * HOUR);

    await pool!.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect(await resolveSession(tokenOf(res))).toBeNull();
  });

  it('организация с studentLongSessions даёт ученику обычную сессию', async () => {
    await student({ studentLongSessions: true });
    const res = await login(post({ identifier: 'ivanov.i.sch12', password: 'пароль123' }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000');
    expect((await sessionRow()).sliding).toBe(true);
  });

  it('учитель получает 30-дневную скользящую сессию', async () => {
    const org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    const t = await createUser('teacher@example.com', 'пароль123');
    await addMember(org.id, t.id, 'teacher');
    const res = await login(post({ identifier: 'teacher@example.com', password: 'пароль123' }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000');
    const row = await sessionRow();
    expect(row.sliding).toBe(true);
    expect(Math.abs(row.expires_at.getTime() - (Date.now() + 30 * DAY))).toBeLessThan(60_000);

    // Старая скользящая логика жива: через два дня срок продлевается.
    await pool!.query("UPDATE sessions SET expires_at = now() + interval '28 days'");
    await resolveSession(tokenOf(res));
    expect((await sessionRow()).expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it('регистрация без членств — обычная сессия, как раньше', async () => {
    const res = await register(post({ email: 'b2c@example.com', password: 'пароль123' }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000');
    expect((await sessionRow()).sliding).toBe(true);
  });
});

describe.skipIf(!pool)('блокировка', () => {
  it('выбрасывает из всех сессий и не пускает обратно', async () => {
    const u = await createLoginUser({
      login: 'blocked.sch12', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    const first = await login(post({ identifier: 'blocked.sch12', password: 'пароль123' }));
    const second = await login(post({ identifier: 'blocked.sch12', password: 'пароль123' }));
    await disableUser(u.id);

    const { rows } = await pool!.query('SELECT 1 FROM sessions WHERE user_id = $1', [u.id]);
    expect(rows).toHaveLength(0);
    for (const r of [first, second]) {
      expect((await me(new Request('http://t', { headers: { cookie: cookieOf(r) } }))).status).toBe(401);
    }

    const right = await login(post({ identifier: 'blocked.sch12', password: 'пароль123' }));
    expect(right.status).toBe(403);
    expect(await right.json()).toEqual({ error: 'Аккаунт заблокирован. Обратитесь к администратору организации.' });
    expect(right.headers.get('set-cookie')).toBeNull();

    const wrong = await login(post({ identifier: 'blocked.sch12', password: 'неверный1' }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'Неверный логин, почта или пароль.' });

    // Данные не трогаются: строка пользователя на месте.
    const user = await pool!.query('SELECT 1 FROM users WHERE id = $1', [u.id]);
    expect(user.rows).toHaveLength(1);
  });

  it('сессия, созданная до блокировки в обход disableUser, тоже не резолвится', async () => {
    const u = await createUser('x@example.com', 'пароль123');
    const res = await login(post({ identifier: 'x@example.com', password: 'пароль123' }));
    await pool!.query('UPDATE users SET disabled_at = now() WHERE id = $1', [u.id]);
    expect(await resolveSession(tokenOf(res))).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/session-kind.test.ts`
Expected: FAIL — `disableUser` не экспортируется; `Max-Age=43200` не найден.

- [ ] **Step 3: Добавить функции в `users.ts`**

В `src/lib/auth/users.ts` после `findUserById`:

```ts
/** Для резолва сессии: заблокированный пользователь не существует для приложения. */
export async function findActiveUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await db().query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND disabled_at IS NULL`, [id]);
  return rows[0] ? toAuthUser(rows[0]) : null;
}

/**
 * Блокировка: отметка и удаление всех сессий одним оператором, чтобы между ними
 * не проскочил запрос. Данные пользователя не трогаются.
 */
export async function disableUser(userId: string): Promise<void> {
  await db().query(
    `WITH dropped AS (DELETE FROM sessions WHERE user_id = $1)
     UPDATE users SET disabled_at = now() WHERE id = $1`, [userId]);
}
```

- [ ] **Step 4: Короткие сессии в `session.ts`**

В `src/lib/auth/session.ts`:
- импорт `findUserById` заменить на `findActiveUserById`; добавить `import type { SessionKind } from '../org/policy';`
- после `SESSION_TTL_MS` добавить:

```ts
/** Ученическая сессия: школьный компьютер общий, поэтому живёт один учебный день. */
export const SHORT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function sessionTtlMs(kind: SessionKind): number {
  return kind === 'short' ? SHORT_SESSION_TTL_MS : SESSION_TTL_MS;
}
```

- `createSession` и `resolveSession` заменить на:

```ts
/** Тип определяется при входе и дальше не пересчитывается; короткая сессия не продлевается. */
export async function createSession(userId: string, kind: SessionKind = 'long'): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db().query(
    'INSERT INTO sessions (token_hash, user_id, expires_at, sliding) VALUES ($1,$2,$3,$4)',
    [hashToken(token), userId, new Date(Date.now() + sessionTtlMs(kind)), kind === 'long']);
  return token;
}

export async function resolveSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const hash = hashToken(token);
  const { rows } = await db().query<{ user_id: string; expires_at: Date; sliding: boolean }>(
    'SELECT user_id, expires_at, sliding FROM sessions WHERE token_hash = $1', [hash]);
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) {
    // Просроченную строку убираем лениво, при первом же обращении.
    await db().query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
    return null;
  }
  if (row.sliding && row.expires_at.getTime() - Date.now() < SESSION_TTL_MS - RENEW_AFTER_MS) {
    await db().query('UPDATE sessions SET expires_at = $2 WHERE token_hash = $1',
      [hash, new Date(Date.now() + SESSION_TTL_MS)]);
  }
  return findActiveUserById(row.user_id);
}
```

- [ ] **Step 5: Срок cookie параметром**

В `src/lib/auth/cookie.ts` заменить `setSessionCookie`:

```ts
/** Срок cookie совпадает со сроком сессии в базе: у ученика 12 часов, у остальных 30 дней. */
export function setSessionCookie(
  res: NextResponse, token: string, secure: boolean, ttlMs: number = SESSION_TTL_MS,
): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  });
  return res;
}
```

- [ ] **Step 6: Роут входа — блокировка и тип сессии**

`src/app/api/auth/login/route.ts` целиком (окончательная версия цикла):

```ts
import { NextResponse } from 'next/server';
import { findUserByIdentifier, type AuthUser } from '@/lib/auth/users';
import { normalizeIdentifier } from '@/lib/auth/identifier';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, sessionTtlMs } from '@/lib/auth/session';
import { isLoginBlocked, recordLoginFailure } from '@/lib/auth/rate-limit';
import { setSessionCookie, isSecureRequest } from '@/lib/auth/cookie';
import { listMemberships } from '@/lib/org/access';
import { sessionKind } from '@/lib/org/policy';

// Один и тот же текст для неизвестного аккаунта и неверного пароля: иначе форма входа
// превращается в способ узнать, кто зарегистрирован.
const WRONG = 'Неверный логин, почта или пароль.';
const DISABLED = 'Аккаунт заблокирован. Обратитесь к администратору организации.';

// Хеш-пустышка того же формата и стоимости scrypt, что и у настоящих паролей.
// Сверяем с ним пароль, когда аккаунт не найден: иначе время ответа выдаёт,
// существует ли аккаунт.
const DUMMY_PASSWORD_HASH = hashPassword('заглушка-для-константного-времени-ответа');

export async function POST(req: Request) {
  const body = (await req.json()) as { identifier?: unknown; email?: unknown; password?: string };
  // Старые клиенты присылают поле email — принимаем его как идентификатор.
  const raw = body.identifier ?? body.email;
  const password = body.password;
  // Заголовок клиент подделывает как угодно — это лишь первый, слабый барьер.
  // Подбор пароля к конкретному аккаунту останавливает счётчик идентификатора.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const key = typeof raw === 'string' && raw.trim() ? normalizeIdentifier(raw) : null;

  // Лимит проверяем ДО обращения к базе и не расходуем на самой проверке.
  if (isLoginBlocked(ip, key)) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.' }, { status: 429 });
  }

  const fail = (accountExists: boolean) => {
    recordLoginFailure(ip, key, accountExists);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  };

  if (key === null || !password) return fail(false);

  const found = await findUserByIdentifier(key);
  // Пароль сверяем всегда — даже когда аккаунта нет, тогда против DUMMY_PASSWORD_HASH.
  const passwordOk = verifyPassword(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!found || !passwordOk) return fail(found !== null);

  // О блокировке узнаёт только тот, кто знает пароль: с неверным — обычный 401 выше.
  if (found.disabledAt) {
    return NextResponse.json({ error: DISABLED }, { status: 403 });
  }

  const kind = sessionKind(found, await listMemberships(found.id));
  const token = await createSession(found.id, kind);
  const user: AuthUser = {
    id: found.id, email: found.email, login: found.login, displayName: found.displayName,
    role: found.role, mustChangePassword: found.mustChangePassword,
  };
  return setSessionCookie(NextResponse.json({ user }), token, isSecureRequest(req), sessionTtlMs(kind));
}
```

- [ ] **Step 7: Запустить — убедиться, что проходит**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/session-kind.test.ts tests/integration/auth-session.test.ts tests/integration/auth-api.test.ts tests/integration/login-identifier.test.ts tests/integration/login-limit.test.ts`
Expected: PASS.

- [ ] **Step 8: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/lib/auth/session.ts src/lib/auth/cookie.ts src/lib/auth/users.ts src/app/api/auth/login/route.ts tests/integration/session-kind.test.ts
git commit -m "feat(auth): короткие сессии учеников и блокировка аккаунта

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Временный пароль на сервере

**Files:**
- Modify: `src/lib/auth/session.ts`, `src/lib/auth/users.ts`, `src/app/api/me/route.ts`, `src/app/api/me/password/route.ts`, `src/app/api/auth/logout/route.ts`
- Test: `tests/integration/temp-password-flow.test.ts`

**Interfaces:**
- Consumes: `resolveSession`, `readCookie`, `SESSION_COOKIE`; `createLoginUser` (Task 3).
- Produces:

```ts
// src/lib/auth/session.ts
export function currentUserFromRequest(req: Request): Promise<AuthUser | null>;          // null при mustChangePassword
export function currentUserFromCookies(): Promise<AuthUser | null>;                      // null при mustChangePassword
export function currentUserAllowingPasswordChange(req: Request): Promise<AuthUser | null>;
export function currentUserAllowingPasswordChangeFromCookies(): Promise<AuthUser | null>;

// src/lib/auth/users.ts
export function updatePassword(userId: string, newPassword: string): Promise<void>;       // теперь снимает флаг
export function setTemporaryPassword(userId: string, plain: string): Promise<void>;       // ставит флаг, удаляет все сессии
```

Разрешающий вариант используют только `GET /api/me`, `POST /api/me/password`, `POST /api/auth/logout` и корневой layout (Task 9). Все прочие роуты и страницы остаются на `currentUserFrom*` и поэтому закрыты по умолчанию. Middleware не меняется.

- [ ] **Step 1: Написать падающий тест**

`tests/integration/temp-password-flow.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me, PATCH as patchMe } from '@/app/api/me/route';
import { POST as changePassword } from '@/app/api/me/password/route';
import { GET as listSims } from '@/app/api/simulations/route';
import { createLoginUser, createUser, setTemporaryPassword } from '@/lib/auth/users';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'temp_password_flow_test';
const pool = testDb(SCHEMA);

function post(body: unknown, cookie?: string, method = 'POST'): Request {
  return new Request('http://t', {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
function get(cookie: string): Request {
  return new Request('http://t', { headers: { cookie } });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-temp-pw-'));
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('временный пароль', () => {
  async function flaggedStudent(): Promise<string> {
    await createLoginUser({
      login: 'petrov.p.sch12', displayName: 'Петров Пётр', password: 'лиса-дом-семь', mustChangePassword: true,
    });
    // Набор не про примеры: помечаем их разложенными, чтобы список не ставил демки.
    await pool!.query('UPDATE users SET demos_seeded_at = now()');
    const res = await login(post({ identifier: 'petrov.p.sch12', password: 'лиса-дом-семь' }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.mustChangePassword).toBe(true);
    return cookieOf(res);
  }

  it('закрывает приложение, но отдаёт /api/me с флагом', async () => {
    const cookie = await flaggedStudent();
    expect((await listSims(get(cookie))).status).toBe(401);
    expect((await patchMe(post({ displayName: 'X' }, cookie, 'PATCH'))).status).toBe(401);
    const whoami = await me(get(cookie));
    expect(whoami.status).toBe(200);
    expect((await whoami.json()).user).toMatchObject({ login: 'petrov.p.sch12', mustChangePassword: true });
  });

  it('смена без текущего пароля снимает флаг и открывает приложение', async () => {
    const cookie = await flaggedStudent();
    const short = await changePassword(post({ newPassword: 'корот' }, cookie));
    expect(short.status).toBe(400);
    const ok = await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookie));
    expect(ok.status).toBe(200);
    expect((await (await me(get(cookie))).json()).user.mustChangePassword).toBe(false);
    expect((await listSims(get(cookie))).status).toBe(200);

    __resetAttemptsForTests();
    expect((await login(post({ identifier: 'petrov.p.sch12', password: 'лиса-дом-семь' }))).status).toBe(401);
    expect((await login(post({ identifier: 'petrov.p.sch12', password: 'мой-новый-пароль' }))).status).toBe(200);
  });

  it('после снятия флага текущий пароль снова обязателен', async () => {
    const cookie = await flaggedStudent();
    await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookie));
    const again = await changePassword(post({ newPassword: 'ещё-один-пароль' }, cookie));
    expect(again.status).toBe(403);
  });

  it('смена рвёт прочие сессии и оставляет текущую', async () => {
    const cookieA = await flaggedStudent();
    const cookieB = cookieOf(await login(post({ identifier: 'petrov.p.sch12', password: 'лиса-дом-семь' })));
    await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookieA));
    expect((await me(get(cookieA))).status).toBe(200);
    expect((await me(get(cookieB))).status).toBe(401);
  });

  it('выход работает при поднятом флаге', async () => {
    const cookie = await flaggedStudent();
    expect((await logout(post({}, cookie))).status).toBe(200);
    expect((await me(get(cookie))).status).toBe(401);
  });

  it('setTemporaryPassword ставит флаг, меняет пароль и выбрасывает из сессий', async () => {
    const u = await createUser('forgot@example.com', 'старый-пароль1');
    const cookie = cookieOf(await login(post({ identifier: 'forgot@example.com', password: 'старый-пароль1' })));
    await setTemporaryPassword(u.id, 'сова-мост-три');
    expect((await me(get(cookie))).status).toBe(401);
    const res = await login(post({ identifier: 'forgot@example.com', password: 'сова-мост-три' }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.mustChangePassword).toBe(true);
  });

  it('без сессии разрешающие роуты по-прежнему отвечают 401', async () => {
    expect((await me(new Request('http://t'))).status).toBe(401);
    expect((await changePassword(post({ newPassword: 'мой-новый-пароль' }))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/temp-password-flow.test.ts`
Expected: FAIL — `setTemporaryPassword` не экспортируется.

- [ ] **Step 3: Функции пароля в `users.ts`**

Заменить `updatePassword` и добавить `setTemporaryPassword`:

```ts
/**
 * Смена пароля человеком. Снимает флаг временного пароля: новый пароль придумал
 * он сам. Прочие сессии удаляет вызывающий роут.
 */
export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  await db().query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1',
    [userId, hashPassword(newPassword)]);
}

/**
 * Выдача временного пароля (скрипт, позже кабинет и админка). Человек обязан
 * сменить его при входе; старые сессии удаляются тем же оператором.
 */
export async function setTemporaryPassword(userId: string, plain: string): Promise<void> {
  await db().query(
    `WITH dropped AS (DELETE FROM sessions WHERE user_id = $1)
     UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1`,
    [userId, hashPassword(plain)]);
}
```

- [ ] **Step 4: Строгие и разрешающие варианты в `session.ts`**

Заменить `currentUserFromRequest` и `currentUserFromCookies` на:

```ts
/**
 * Пользователь с временным паролем для приложения не вошёл: строгие варианты
 * возвращают null, и любой роут отвечает 401. Так новые роуты закрыты по
 * умолчанию, даже если автор не вспомнил о флаге.
 */
function withSettledPassword(user: AuthUser | null): AuthUser | null {
  return user && !user.mustChangePassword ? user : null;
}

async function tokenFromCookies(): Promise<string | undefined> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/** Для роутов: токен берётся из заголовка запроса, а не из next/headers — так роут тестируется вызовом. */
export async function currentUserFromRequest(req: Request): Promise<AuthUser | null> {
  return withSettledPassword(await resolveSession(readCookie(req, SESSION_COOKIE)));
}

/** Для серверных компонентов и страниц, где Request недоступен. */
export async function currentUserFromCookies(): Promise<AuthUser | null> {
  return withSettledPassword(await resolveSession(await tokenFromCookies()));
}

/**
 * Разрешающий вариант: пропускает и пользователя с временным паролем.
 * Только для GET /api/me, POST /api/me/password и POST /api/auth/logout.
 */
export async function currentUserAllowingPasswordChange(req: Request): Promise<AuthUser | null> {
  return resolveSession(readCookie(req, SESSION_COOKIE));
}

/** Разрешающий вариант для корневого layout: он показывает форму смены пароля. */
export async function currentUserAllowingPasswordChangeFromCookies(): Promise<AuthUser | null> {
  return resolveSession(await tokenFromCookies());
}
```

- [ ] **Step 5: Роуты-исключения**

`src/app/api/me/route.ts`: в `GET` заменить `currentUserFromRequest(req)` на `currentUserAllowingPasswordChange(req)` и добавить его в импорт из `@/lib/auth/session` (импорт `currentUserFromRequest` остаётся для `PATCH`). Над строкой вызова добавить комментарий:

```ts
  // Разрешающий вариант: форма смены временного пароля узнаёт о флаге отсюда.
```

`src/app/api/me/password/route.ts` целиком:

```ts
import { NextResponse } from 'next/server';
import { currentUserAllowingPasswordChange, SESSION_COOKIE, readCookie } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { findUserPasswordHash, updatePassword } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';
import { db } from '@/lib/db/client';
import crypto from 'node:crypto';

/**
 * Смена пароля. После неё все прочие сессии пользователя удаляются — иначе
 * украденная кука продолжала бы работать, а именно от неё пароль и меняют.
 * Текущая сессия остаётся живой, чтобы не выкидывать человека из интерфейса.
 */
export async function POST(req: Request) {
  // Разрешающий вариант: сюда приходит человек с временным паролем.
  const user = await currentUserAllowingPasswordChange(req);
  if (!user) return unauthorized();
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  const { currentPassword, newPassword } = body;
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }
  // При временном пароле текущий не спрашиваем: человек только что вошёл с ним,
  // а школьник его уже не помнит.
  if (!user.mustChangePassword) {
    const hash = await findUserPasswordHash(user.id);
    if (!hash || !verifyPassword(currentPassword ?? '', hash)) {
      return NextResponse.json({ error: 'Текущий пароль указан неверно.' }, { status: 403 });
    }
  }
  await updatePassword(user.id, newPassword);
  const token = readCookie(req, SESSION_COOKIE);
  const keep = token ? crypto.createHash('sha256').update(token).digest('hex') : '';
  await db().query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, keep]);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/auth/logout/route.ts`: роут пользователя не резолвит и гасит сессию по cookie, поэтому флаг ему не мешает. Код не меняется, добавляется только комментарий над `POST`:

```ts
// Выход не резолвит пользователя: он обязан работать при любом состоянии аккаунта,
// в том числе с временным паролем (форма смены пароля предлагает «Выйти»).
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/temp-password-flow.test.ts tests/integration/profile-api.test.ts tests/integration/auth-api.test.ts`
Expected: PASS.

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/lib/auth/session.ts src/lib/auth/users.ts src/app/api/me/route.ts src/app/api/me/password/route.ts \
  src/app/api/auth/logout/route.ts tests/integration/temp-password-flow.test.ts
git commit -m "feat(auth): временный пароль закрывает приложение до смены

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Форма «Придумайте свой пароль» в корневом layout

**Files:**
- Create: `src/components/ForcePasswordChange.tsx`, `tests/unit/force-password.test.ts`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `currentUserAllowingPasswordChangeFromCookies` (Task 8), `userLabel` (Task 2), `POST /api/me/password`, `POST /api/auth/logout`.
- Produces:

```ts
// src/components/ForcePasswordChange.tsx
export const MIN_NEW_PASSWORD_LENGTH = 8;
export function newPasswordError(next: string, repeat: string): string | null;
export default function ForcePasswordChange(props: { label: string }): JSX.Element;
```

Layout подменяет содержимое любой страницы формой, путь страницы ему не нужен. Страницы, которые при `null` уводят на `/login`, петли не создают: страница входа никуда не уводит, а layout подменяет и её.

- [ ] **Step 1: Написать падающий тест**

`tests/unit/force-password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newPasswordError, MIN_NEW_PASSWORD_LENGTH } from '@/components/ForcePasswordChange';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';

describe('проверка нового пароля в форме', () => {
  it('порог совпадает с серверным', () => {
    expect(MIN_NEW_PASSWORD_LENGTH).toBe(MIN_PASSWORD_LENGTH);
  });
  it('короткий пароль отклоняется раньше несовпадения', () => {
    expect(newPasswordError('корот', 'другой')).toBe('Пароль должен быть не короче 8 символов.');
  });
  it('несовпадающие пароли отклоняются', () => {
    expect(newPasswordError('мой-пароль-1', 'мой-пароль-2')).toBe('Пароли не совпадают.');
  });
  it('совпадающий достаточно длинный пароль проходит', () => {
    expect(newPasswordError('мой-пароль-1', 'мой-пароль-1')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/force-password.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/ForcePasswordChange"`.

- [ ] **Step 3: Реализовать компонент**

`src/components/ForcePasswordChange.tsx`:

```tsx
'use client';
import { useState } from 'react';

/**
 * Серверный порог — MIN_PASSWORD_LENGTH в src/lib/auth/cookie.ts. Импортировать его
 * сюда нельзя: cookie.ts тянет session.ts с node:crypto и pg в клиентский бандл.
 * Совпадение порогов проверяет юнит-тест.
 */
export const MIN_NEW_PASSWORD_LENGTH = 8;

export function newPasswordError(next: string, repeat: string): string | null {
  if (next.length < MIN_NEW_PASSWORD_LENGTH) {
    return `Пароль должен быть не короче ${MIN_NEW_PASSWORD_LENGTH} символов.`;
  }
  if (next !== repeat) return 'Пароли не совпадают.';
  return null;
}

/**
 * Показывается вместо любой страницы, пока у человека временный пароль.
 * Текущий пароль не спрашивается: человек только что вошёл с временным.
 */
export default function ForcePasswordChange({ label }: { label: string }) {
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = newPasswordError(next, repeat);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: next }),
      });
      if (res.ok) {
        // Полная перезагрузка: layout должен заново прочитать пользователя без флага.
        window.location.assign('/');
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось сохранить пароль. Попробуйте ещё раз.');
    } catch {
      setError('Сеть недоступна. Проверьте соединение и попробуйте снова.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.assign('/login');
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Придумайте свой пароль</h1>
        <p className="muted">
          {label ? `${label}, вы вошли с временным паролем.` : 'Вы вошли с временным паролем.'}{' '}
          Чтобы продолжить, задайте пароль, который знаете только вы.
        </p>
        <label>Новый пароль
          <input className="input" type="password" value={next} required minLength={MIN_NEW_PASSWORD_LENGTH}
            autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
        </label>
        <label>Повторите пароль
          <input className="input" type="password" value={repeat} required minLength={MIN_NEW_PASSWORD_LENGTH}
            autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="error-box">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Минуту…' : 'Сохранить пароль'}
        </button>
        <button className="btn force-password-logout" type="button" onClick={logout}>Выйти</button>
      </form>
    </div>
  );
}
```

В конец `src/app/globals.css` добавить:

```css
/* Вторичная кнопка формы смены временного пароля. */
.auth-card .force-password-logout { margin-top: 0; }
```

- [ ] **Step 4: Подменить страницу в layout**

`src/app/layout.tsx`:
- импорт `currentUserFromCookies` заменить на `currentUserAllowingPasswordChangeFromCookies`;
- добавить `import ForcePasswordChange from '@/components/ForcePasswordChange';`
- импорт из `@/lib/auth/identifier` расширить до `import { userContact, userLabel } from '@/lib/auth/identifier';`
- тело функции до `return` и содержимое `<body>` заменить на:

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Разрешающий вариант: только layout узнаёт о временном пароле и подменяет страницу.
  const user = await currentUserAllowingPasswordChangeFromCookies();
  const mustChangePassword = !!user?.mustChangePassword;
```

```tsx
      <body>
        <nav className="topnav">
          <span className="brand">
            <span className="brand-mark"><IconLogo size={15} /></span>Tesseract
          </span>
          {!mustChangePassword && (
            <NavLinks user={user ? { label: userContact(user), role: user.role } : undefined} />
          )}
        </nav>
        <main>
          {user && mustChangePassword ? <ForcePasswordChange label={userLabel(user)} /> : children}
        </main>
      </body>
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/unit/force-password.test.ts`
Expected: PASS.

- [ ] **Step 6: Проверить руками и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: зелёно. Если есть локальная база: создать пользователя с флагом (`psql`: `UPDATE users SET must_change_password = true WHERE email = '<ваша почта>'`), открыть `/library` — видна форма «Придумайте свой пароль», навигации нет; «Выйти» уводит на `/login` с обычной формой входа.

```bash
git add src/components/ForcePasswordChange.tsx src/app/layout.tsx src/app/globals.css tests/unit/force-password.test.ts
git commit -m "feat(auth): форма смены временного пароля вместо любой страницы

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Разделы навигации и поле «Почта или логин»

**Files:**
- Modify: `src/app/layout.tsx`, `src/components/NavLinks.tsx`, `src/components/AuthForm.tsx`, `tests/unit/auth-form.test.ts`
- Test: `tests/unit/nav-links.test.ts`

**Interfaces:**
- Consumes: `listMemberships` (Task 6), `navSections`, `ALL_NAV_SECTIONS`, `NavSection`, `NavSectionKey` (Task 5).
- Produces:

```ts
// src/components/NavLinks.tsx
export function isSectionActive(href: string, pathname: string | null): boolean;
export default function NavLinks(props: { sections: NavSection[]; user?: { label: string; role: string } }): JSX.Element;

// src/components/AuthForm.tsx
export function authRequestBody(mode: 'login' | 'register', identifier: string, password: string):
  { identifier: string; password: string } | { email: string; password: string };
```

Без входа навигация показывает `ALL_NAV_SECTIONS`, как сейчас.

- [ ] **Step 1: Написать падающие тесты**

`tests/unit/nav-links.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isSectionActive } from '@/components/NavLinks';

describe('активный раздел', () => {
  it('«Создать» активен только на корне', () => {
    expect(isSectionActive('/', '/')).toBe(true);
    expect(isSectionActive('/', '/library')).toBe(false);
  });
  it('остальные — по префиксу пути', () => {
    expect(isSectionActive('/library', '/library')).toBe(true);
    expect(isSectionActive('/labs', '/labs/chem')).toBe(true);
    expect(isSectionActive('/labs', '/library')).toBe(false);
    expect(isSectionActive('/labs', null)).toBe(false);
  });
});
```

Дописать в конец `tests/unit/auth-form.test.ts` (и добавить `authRequestBody` в импорт):

```ts
describe('authRequestBody', () => {
  it('вход отправляет identifier', () => {
    expect(authRequestBody('login', 'ivanov.i.sch12', 'пароль123'))
      .toEqual({ identifier: 'ivanov.i.sch12', password: 'пароль123' });
  });
  it('регистрация по-прежнему отправляет email', () => {
    expect(authRequestBody('register', 'a@example.com', 'пароль123'))
      .toEqual({ email: 'a@example.com', password: 'пароль123' });
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run tests/unit/nav-links.test.ts tests/unit/auth-form.test.ts`
Expected: FAIL — `isSectionActive is not a function`, `authRequestBody is not a function`.

- [ ] **Step 3: `NavLinks` рисует переданные разделы**

В `src/components/NavLinks.tsx`:
- добавить `import type { NavSection, NavSectionKey } from '@/lib/org/policy';` (только тип — модуль политики в клиентский бандл не попадает);
- константу `LINKS` заменить на:

```tsx
// Иконки живут на клиенте: компонент нельзя передать из серверного layout.
const ICONS: Record<NavSectionKey, typeof IconPlus> = {
  create: IconPlus,
  library: IconLibrary,
  labs: IconLab,
};

export function isSectionActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}
```

- сигнатуру компонента заменить на

```tsx
export default function NavLinks({ sections, user }: { sections: NavSection[]; user?: NavUser }) {
```

- блок `.navlinks` заменить на:

```tsx
      <div className="navlinks">
        {sections.map(({ key, href, label }) => {
          const Icon = ICONS[key];
          return (
            <Link key={key} href={href} className={isSectionActive(href, pathname) ? 'active' : ''}>
              <Icon size={17} /><span style={{ marginLeft: 7 }}>{label}</span>
            </Link>
          );
        })}
      </div>
```

- [ ] **Step 4: Layout считает разделы на сервере**

`src/app/layout.tsx` целиком (окончательная версия цикла):

```tsx
import './globals.css';
import NavLinks from '@/components/NavLinks';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { currentUserAllowingPasswordChangeFromCookies } from '@/lib/auth/session';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { listMemberships } from '@/lib/org/access';
import { ALL_NAV_SECTIONS, navSections } from '@/lib/org/policy';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { IconLogo } from '@/components/icons';

export const metadata = {
  title: 'Tesseract',
  description: 'Интерактивные симуляции по описанию',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Разрешающий вариант: только layout узнаёт о временном пароле и подменяет страницу.
  const user = await currentUserAllowingPasswordChangeFromCookies();
  const mustChangePassword = !!user?.mustChangePassword;
  // Разделы считаются на сервере по членствам; без входа видны все, как раньше.
  const sections = user && !mustChangePassword
    ? navSections(user, await listMemberships(user.id))
    : [...ALL_NAV_SECTIONS];
  return (
    // data-theme проставляет скрипт ниже до отрисовки, поэтому значение на сервере
    // и на клиенте расходится намеренно — предупреждение о гидрации здесь ложное.
    <html lang="ru" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Тема применяется до первой отрисовки — иначе тёмная тема моргает белым. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
      </head>
      <body>
        <nav className="topnav">
          <span className="brand">
            <span className="brand-mark"><IconLogo size={15} /></span>Tesseract
          </span>
          {!mustChangePassword && (
            <NavLinks sections={sections}
              user={user ? { label: userContact(user), role: user.role } : undefined} />
          )}
        </nav>
        <main>
          {user && mustChangePassword ? <ForcePasswordChange label={userLabel(user)} /> : children}
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Поле «Почта или логин» во входе**

В `src/components/AuthForm.tsx`:
- после `safeNextPath` добавить:

```tsx
/** Вход принимает почту или логин; регистрация — только почту, как раньше. */
export function authRequestBody(mode: 'login' | 'register', identifier: string, password: string):
  { identifier: string; password: string } | { email: string; password: string } {
  return mode === 'login' ? { identifier, password } : { email: identifier, password };
}
```

- `const [email, setEmail] = useState('');` → `const [identifier, setIdentifier] = useState('');`
- `body: JSON.stringify({ email, password }),` → `body: JSON.stringify(authRequestBody(mode, identifier, password)),`
- поле ввода заменить на:

```tsx
      {isLogin ? (
        <label>Почта или логин
          <input className="input" type="text" value={identifier} autoComplete="username" required
            autoCapitalize="none" spellCheck={false}
            onChange={(e) => setIdentifier(e.target.value)} />
        </label>
      ) : (
        <label>Почта
          <input className="input" type="email" value={identifier} autoComplete="email" required
            onChange={(e) => setIdentifier(e.target.value)} />
        </label>
      )}
```

- [ ] **Step 6: Запустить — убедиться, что проходят**

Run: `npx vitest run tests/unit/nav-links.test.ts tests/unit/auth-form.test.ts`
Expected: PASS.

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: зелёно.

```bash
git add src/app/layout.tsx src/components/NavLinks.tsx src/components/AuthForm.tsx tests/unit/auth-form.test.ts tests/unit/nav-links.test.ts
git commit -m "feat(nav): разделы навигации по членствам, вход по почте или логину

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Право на генерацию и квота с учётом членств

**Files:**
- Modify: `src/lib/quota.ts`, `src/app/api/generate/route.ts`, `src/app/api/simulations/[id]/refine/route.ts`, `src/app/api/me/route.ts`, `src/app/profile/page.tsx`, `src/components/ProfileView.tsx`, `tests/unit/jobs-api.test.ts`
- Test: `tests/integration/org-generation.test.ts`

**Interfaces:**
- Consumes: `listMemberships` (Task 6); `canGenerate`, `generationLimit`, `hasStaffRole`, `TRIAL_LIMIT`, `GENERATION_FORBIDDEN_MESSAGE` (Task 5).
- Produces:

```ts
// src/lib/quota.ts
export { TRIAL_LIMIT } from './org/policy';
export interface QuotaStatus { limit: number | null; used: number; remaining: number | null }   // без изменений
export function quotaExhaustedMessage(limit: number, orgLimit: boolean): string;
export const QUOTA_EXHAUSTED_MESSAGE: string;          // = quotaExhaustedMessage(TRIAL_LIMIT, false), текст прежний
export function quotaStatus(user: AuthUser, memberships?: Membership[]): Promise<QuotaStatus>;

// src/components/ProfileView.tsx
interface Props { profile: UserProfile; quota: QuotaStatus; orgQuota: boolean }
```

`memberships` у `quotaStatus` по умолчанию `[]`, чтобы существующий `tests/integration/quota.test.ts` не менялся; все три боевых вызова (`/api/generate`, `/api/me`, `/profile`) передают членства явно.

- [ ] **Step 1: Написать падающий тест**

`tests/integration/org-generation.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createOrganization, addMember, updateOrgSettings, type Organization } from '@/lib/org/orgs';
import { listMemberships } from '@/lib/org/access';
import { GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';
import { quotaStatus, quotaExhaustedMessage, QUOTA_EXHAUSTED_MESSAGE, TRIAL_LIMIT } from '@/lib/quota';
import { __resetLimitsForTests } from '@/lib/limits';
import { __clearForTests } from '@/lib/jobs';
import { POST as postGenerate } from '@/app/api/generate/route';
import { POST as postRefine } from '@/app/api/simulations/[id]/refine/route';
import { GET as me } from '@/app/api/me/route';

// Пайплайн поднимает Chromium и зовёт модель — здесь он повисает и ничего не делает.
vi.mock('@/lib/pipeline/run', async (orig) => ({
  ...(await orig<typeof import('@/lib/pipeline/run')>()),
  makeCtx: () => ({}),
  runPipeline: () => new Promise<void>(() => {}),
}));

const SCHEMA = 'org_generation_test';
const pool = testDb(SCHEMA);

async function cookieFor(u: AuthUser): Promise<string> {
  return `${SESSION_COOKIE}=${await createSession(u.id)}`;
}
function generate(cookie: string): Promise<Response> {
  return postGenerate(new Request('http://t/api/generate', {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ prompt: 'маятник' }),
  }));
}
function refine(cookie: string, id: string): Promise<Response> {
  return postRefine(new Request('http://t', {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ instruction: 'крупнее' }),
  }), { params: Promise.resolve({ id }) });
}
async function addDoneJobs(ownerId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await pool!.query("INSERT INTO jobs (id, owner_id, status, request) VALUES ($1,$2,'done','{}'::jsonb)",
      [crypto.randomUUID(), ownerId]);
  }
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __clearForTests();
  __resetLimitsForTests();
  process.env.SHOWMEHOW_API_KEY = 'test-key';
  process.env.SHOWMEHOW_MODEL = 'test-model';
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => {
  delete process.env.SHOWMEHOW_API_KEY;
  delete process.env.SHOWMEHOW_MODEL;
  await pool?.end();
  await closeDb();
});

describe.skipIf(!pool)('генерация и квота в организации', () => {
  let org: Organization;
  let student: AuthUser;
  let teacher: AuthUser;

  beforeEach(async () => {
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    student = await createLoginUser({
      login: 'ivanov.i.sch12', displayName: null, password: 'пароль123', mustChangePassword: false,
    });
    teacher = await createUser('teacher@example.com', 'пароль123');
    await addMember(org.id, student.id, 'student');
    await addMember(org.id, teacher.id, 'teacher');
  });

  it('ученик без разрешения получает 403 и не создаёт задания', async () => {
    const cookie = await cookieFor(student);
    const res = await generate(cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: GENERATION_FORBIDDEN_MESSAGE });
    const { rows } = await pool!.query('SELECT 1 FROM jobs');
    expect(rows).toHaveLength(0);

    // Доработка тоже закрыта; проверка права идёт раньше поиска симуляции.
    const r = await refine(cookie, crypto.randomUUID());
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: GENERATION_FORBIDDEN_MESSAGE });
  });

  it('ученик проходит, когда организация разрешила генерацию', async () => {
    await updateOrgSettings(org.id, { studentsCanGenerate: true });
    const res = await generate(await cookieFor(student));
    expect(res.status).toBe(200);
    expect((await res.json()).jobId).toEqual(expect.any(String));
    // Разрешённый ученик тратит обычную пробную квоту.
    expect((await quotaStatus(student, await listMemberships(student.id))).limit).toBe(TRIAL_LIMIT);
  });

  it('ученик архивной организации считается пользователем без членств', async () => {
    await pool!.query('UPDATE organizations SET archived_at = now() WHERE id = $1', [org.id]);
    expect((await generate(await cookieFor(student))).status).toBe(200);
  });

  it('учитель получает лимит организации и текст с этим числом', async () => {
    expect(await quotaStatus(teacher, await listMemberships(teacher.id)))
      .toEqual({ limit: 100, used: 0, remaining: 100 });

    await updateOrgSettings(org.id, { teacherGenerationLimit: 3 });
    await addDoneJobs(teacher.id, 3);
    const cookie = await cookieFor(teacher);
    const res = await generate(cookie);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(quotaExhaustedMessage(3, true));
    expect(quotaExhaustedMessage(3, true)).toContain('3 из 3');

    const body = await (await me(new Request('http://t', { headers: { cookie } }))).json();
    expect(body.quota).toEqual({ limit: 3, used: 3, remaining: 0 });
    expect(body.quotaMessage).toBe(quotaExhaustedMessage(3, true));
  });

  it('пользователь без членств — прежние 10 и прежний текст', async () => {
    const b2c = await createUser('b2c@example.com', 'пароль123');
    await addDoneJobs(b2c.id, TRIAL_LIMIT);
    const res = await generate(await cookieFor(b2c));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(QUOTA_EXHAUSTED_MESSAGE);
    expect(QUOTA_EXHAUSTED_MESSAGE).toBe(
      'Лимит пробной версии исчерпан: использовано 10 из 10 генераций. '
      + 'Доработка уже созданных симуляций по-прежнему доступна.');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/org-generation.test.ts`
Expected: FAIL — `quotaExhaustedMessage is not a function`.

- [ ] **Step 3: Квота**

`src/lib/quota.ts` целиком:

```ts
import { db } from './db/client';
import type { AuthUser } from './auth/users';
import type { Membership } from './org/types';
import { generationLimit, TRIAL_LIMIT } from './org/policy';

export { TRIAL_LIMIT };

export interface QuotaStatus {
  limit: number | null;    // null — без ограничения (админ)
  used: number;
  remaining: number | null;
}

/** Число берётся из фактического лимита: у учителя он задан организацией. */
export function quotaExhaustedMessage(limit: number, orgLimit: boolean): string {
  const tail = 'Доработка уже созданных симуляций по-прежнему доступна.';
  if (orgLimit) {
    return `Лимит генераций от вашей организации исчерпан: использовано ${limit} из ${limit}. ${tail}`;
  }
  return `Лимит пробной версии исчерпан: использовано ${limit} из ${limit} генераций. ${tail}`;
}

export const QUOTA_EXHAUSTED_MESSAGE = quotaExhaustedMessage(TRIAL_LIMIT, false);

/**
 * Израсходованное считается по журналу заданий, а не отдельным счётчиком в users:
 * два источника правды рано или поздно разойдутся. Тратят квоту только успешно
 * завершённые генерации — отменённые и упавшие не считаются. Лимит зависит от
 * членств (см. generationLimit).
 */
export async function quotaStatus(user: AuthUser, memberships: Membership[] = []): Promise<QuotaStatus> {
  const limit = generationLimit(user, memberships);
  if (limit === null) {
    return { limit: null, used: 0, remaining: null };
  }
  const { rows } = await db().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM jobs WHERE owner_id = $1 AND status = 'done'", [user.id]);
  const used = Number(rows[0]?.count ?? '0');
  return { limit, used, remaining: Math.max(0, limit - used) };
}
```

- [ ] **Step 4: Роут генерации**

В `src/app/api/generate/route.ts`:
- импорт квоты заменить на `import { quotaStatus, quotaExhaustedMessage } from '@/lib/quota';`
- добавить импорты:

```ts
import { listMemberships } from '@/lib/org/access';
import { canGenerate, hasStaffRole, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';
```

- сразу после `if (!user) return unauthorized();` вставить:

```ts
  // Право проверяется до резервации слота: ученику без разрешения нечего занимать.
  const memberships = await listMemberships(user.id);
  if (!canGenerate(user, memberships)) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
```

- блок квоты внутри `try` заменить на:

```ts
    const quota = await quotaStatus(user, memberships);
    if (quota.limit !== null && quota.remaining !== null && quota.remaining <= 0) {
      releaseUser(user.id);
      return NextResponse.json(
        { error: quotaExhaustedMessage(quota.limit, hasStaffRole(memberships)) }, { status: 403 });
    }
```

- [ ] **Step 5: Роут доработки**

В `src/app/api/simulations/[id]/refine/route.ts` добавить импорты

```ts
import { listMemberships } from '@/lib/org/access';
import { canGenerate, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';
```

и сразу после `if (!user) return unauthorized();` вставить:

```ts
  // Доработка — тоже работа модели: ученику без разрешения она закрыта так же,
  // как генерация. Проверка идёт до поиска симуляции и ничего о ней не выдаёт.
  if (!canGenerate(user, await listMemberships(user.id))) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
```

- [ ] **Step 6: `/api/me` и профиль**

`src/app/api/me/route.ts`: импорт квоты — `import { quotaStatus, quotaExhaustedMessage } from '@/lib/quota';`, добавить `import { listMemberships } from '@/lib/org/access';` и `import { hasStaffRole } from '@/lib/org/policy';`. Тело `GET` после проверки `user`:

```ts
  const memberships = await listMemberships(user.id);
  const [quota, profile] = await Promise.all([quotaStatus(user, memberships), getProfile(user.id)]);
  // Текст сообщения об исчерпанной квоте живёт в серверном lib/quota.ts (там же, где
  // импорт 'pg') — клиентский компонент не может импортировать его напрямую, поэтому
  // строку отдаём в ответе, и только когда остаток действительно нулевой.
  const quotaMessage = quota.limit !== null && quota.remaining === 0
    ? quotaExhaustedMessage(quota.limit, hasStaffRole(memberships))
    : undefined;
```

(остальное тело `GET` и весь `PATCH` не меняются).

`src/app/profile/page.tsx` целиком:

```tsx
import { redirect } from 'next/navigation';
import { currentUserFromCookies } from '@/lib/auth/session';
import { getProfile } from '@/lib/auth/users';
import { quotaStatus } from '@/lib/quota';
import { listMemberships } from '@/lib/org/access';
import { hasStaffRole } from '@/lib/org/policy';
import ProfileView from '@/components/ProfileView';

export default async function ProfilePage() {
  const user = await currentUserFromCookies();
  if (!user) redirect('/login?next=/profile');
  const memberships = await listMemberships(user.id);
  const [profile, quota] = await Promise.all([getProfile(user.id), quotaStatus(user, memberships)]);
  if (!profile) redirect('/login');
  return <ProfileView profile={profile} quota={quota} orgQuota={hasStaffRole(memberships)} />;
}
```

`src/components/ProfileView.tsx`: `interface Props { profile: UserProfile; quota: QuotaStatus }` → `interface Props { profile: UserProfile; quota: QuotaStatus; orgQuota: boolean }`; сигнатура — `export default function ProfileView({ profile, quota, orgQuota }: Props)`; строка счётчика:

```tsx
            <span>{quota.limit === null
              ? 'Без ограничений'
              : `${quota.used} из ${quota.limit} ${orgQuota ? 'по лимиту организации' : 'в пробной версии'}`}</span>
```

- [ ] **Step 7: Подменить членства в юнит-тесте роутов**

В `tests/unit/jobs-api.test.ts` рядом с подменой `@/lib/quota` добавить:

```ts
// Роут /api/generate читает членства из базы; в юнит-тесте их нет — пользователь без организаций.
vi.mock('@/lib/org/access', async (orig) => ({
  ...(await orig<typeof import('@/lib/org/access')>()),
  listMemberships: async () => [],
}));
```

- [ ] **Step 8: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/unit/jobs-api.test.ts`
Expected: PASS.

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/org-generation.test.ts tests/integration/quota.test.ts tests/integration/profile-api.test.ts`
Expected: PASS.

- [ ] **Step 9: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/lib/quota.ts src/app/api/generate/route.ts "src/app/api/simulations/[id]/refine/route.ts" \
  src/app/api/me/route.ts src/app/profile/page.tsx src/components/ProfileView.tsx \
  tests/unit/jobs-api.test.ts tests/integration/org-generation.test.ts
git commit -m "feat(org): право на генерацию и квота по членствам

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Генератор временного пароля

**Files:**
- Create: `src/lib/auth/temp-password.ts`, `tests/unit/temp-password.test.ts`

**Interfaces:**
- Consumes: `node:crypto`.
- Produces:

```ts
export const TEMP_PASSWORD_WORDS: readonly string[];
export function generateTempPassword(randomInt?: (max: number) => number): string;   // «лиса-дом-семь»
```

- [ ] **Step 1: Написать падающий тест**

`tests/unit/temp-password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTempPassword, TEMP_PASSWORD_WORDS } from '@/lib/auth/temp-password';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/cookie';

describe('временный пароль', () => {
  it('три слова через дефис из словаря', () => {
    for (let i = 0; i < 500; i++) {
      const pw = generateTempPassword();
      const words = pw.split('-');
      expect(words).toHaveLength(3);
      for (const w of words) expect(TEMP_PASSWORD_WORDS).toContain(w);
      expect(pw.length).toBeGreaterThanOrEqual(8);
      expect(pw.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it('берёт слова по индексам из генератора случайных чисел', () => {
    const seq = [0, 1, 2];
    let i = 0;
    expect(generateTempPassword(() => seq[i++])).toBe('лиса-дом-семь');
  });

  it('генератору передаётся размер словаря', () => {
    const seen: number[] = [];
    generateTempPassword((max) => { seen.push(max); return 0; });
    expect(seen).toEqual([TEMP_PASSWORD_WORDS.length, TEMP_PASSWORD_WORDS.length, TEMP_PASSWORD_WORDS.length]);
  });

  it('словарь: не меньше 40 разных коротких слов строчной кириллицей без ё и й', () => {
    expect(TEMP_PASSWORD_WORDS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TEMP_PASSWORD_WORDS).size).toBe(TEMP_PASSWORD_WORDS.length);
    for (const w of TEMP_PASSWORD_WORDS) expect(w).toMatch(/^[а-еж-ик-я]{3,6}$/);
  });

  it('в словаре нет слов, отличающихся одной буквой', () => {
    const close = (a: string, b: string) =>
      a.length === b.length && [...a].filter((ch, k) => ch !== b[k]).length === 1;
    for (const a of TEMP_PASSWORD_WORDS) {
      for (const b of TEMP_PASSWORD_WORDS) {
        if (a !== b) expect(close(a, b), `${a} и ${b}`).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/temp-password.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/auth/temp-password"`.

- [ ] **Step 3: Реализовать**

`src/lib/auth/temp-password.ts`:

```ts
import crypto from 'node:crypto';

/**
 * Словарь временных паролей: короткие знакомые школьнику слова без ё и й и без
 * пар, отличающихся одной буквой, — пароль диктуют вслух и переписывают с листка.
 * 48 слов в третьей степени — около 110 тысяч вариантов; этого хватает, потому что
 * пароль живёт до первого входа, а перебор упирается в лимит неудачных входов.
 */
export const TEMP_PASSWORD_WORDS: readonly string[] = [
  'лиса', 'дом', 'семь', 'волк', 'река', 'гора', 'луна', 'мост',
  'сад', 'лес', 'снег', 'море', 'кит', 'жук', 'сыр', 'кекс',
  'суп', 'торт', 'окно', 'стол', 'лампа', 'книга', 'парта', 'мяч',
  'флаг', 'трава', 'роза', 'слон', 'тигр', 'зебра', 'панда', 'сова',
  'утка', 'рыба', 'краб', 'лось', 'барс', 'мак', 'ваза', 'нота',
  'дуб', 'кедр', 'сосна', 'пчела', 'ветер', 'гром', 'два', 'пять',
];

/** randomInt подменяется в тестах; в бою — криптостойкий crypto.randomInt. */
export function generateTempPassword(
  randomInt: (max: number) => number = (max) => crypto.randomInt(max),
): string {
  const pick = () => TEMP_PASSWORD_WORDS[randomInt(TEMP_PASSWORD_WORDS.length)];
  return [pick(), pick(), pick()].join('-');
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/unit/temp-password.test.ts`
Expected: PASS. Если тест «одной буквой» найдёт пару, заменить одно из слов другим коротким существительным и прогнать снова.

- [ ] **Step 5: Закоммитить**

```bash
git add src/lib/auth/temp-password.ts tests/unit/temp-password.test.ts
git commit -m "feat(auth): трёхсловный временный пароль

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Скрипт `scripts/org.ts` и `npm run org`

**Files:**
- Create: `scripts/org.ts`, `tests/unit/org-cli.test.ts`
- Modify: `package.json`
- Test: `tests/integration/org-script.test.ts`

**Interfaces:**
- Consumes: `orgs.ts`, `groups.ts`, `access.ts`, `settings.ts`, `types.ts` (Tasks 5–6); `createLoginUser`, `findUserByIdentifier`, `setTemporaryPassword`, `disableUser` (Tasks 3, 7, 8); `generateTempPassword` (Task 12); `isValidLogin` (Task 2).
- Produces:

```ts
export interface ParsedArgs { command: string; flags: Record<string, string>; rest: string[] }
export function parseArgs(argv: string[]): ParsedArgs;
export function parseSettingAssignment(raw: string): { key: OrgSettingKey; value: boolean | number };
export const USAGE: string;
export function runOrgCommand(argv: string[], print: (line: string) => void): Promise<void>;
```

Команды: `create`, `list`, `add-member`, `create-user`, `create-group`, `add-to-group`, `assign-teacher`, `reset-password`, `disable`, `set`. Отказы — `OrgError` с текстом для человека; `main` печатает его без стека и ставит код выхода 1.

- [ ] **Step 1: Написать падающий юнит-тест**

`tests/unit/org-cli.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseArgs, parseSettingAssignment } from '../../scripts/org';
import { OrgError } from '@/lib/org/types';

describe('разбор аргументов', () => {
  it('команда, флаги и позиционные аргументы', () => {
    expect(parseArgs(['create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school'])).toEqual({
      command: 'create', flags: { slug: 'sch12', name: 'Школа №12', kind: 'school' }, rest: [],
    });
    expect(parseArgs(['set', '--org', 'sch12', 'studentsCanGenerate=true', 'teacherGenerationLimit=50'])).toEqual({
      command: 'set', flags: { org: 'sch12' }, rest: ['studentsCanGenerate=true', 'teacherGenerationLimit=50'],
    });
    expect(parseArgs([])).toEqual({ command: '', flags: {}, rest: [] });
  });

  it('флаг без значения — отказ', () => {
    expect(() => parseArgs(['create', '--slug'])).toThrow(OrgError);
    expect(() => parseArgs(['create', '--slug', '--name', 'X'])).toThrow('У флага --slug нет значения.');
  });
});

describe('разбор настройки', () => {
  it('булевы и числовые значения', () => {
    expect(parseSettingAssignment('studentsCanGenerate=true')).toEqual({ key: 'studentsCanGenerate', value: true });
    expect(parseSettingAssignment('studentLongSessions=false')).toEqual({ key: 'studentLongSessions', value: false });
    expect(parseSettingAssignment('teacherGenerationLimit=250')).toEqual({ key: 'teacherGenerationLimit', value: 250 });
  });

  it('неизвестный ключ, кривое значение и запись без = — отказ', () => {
    expect(() => parseSettingAssignment('hack=1')).toThrow('Неизвестная настройка «hack».');
    expect(() => parseSettingAssignment('studentsCanGenerate=да')).toThrow(OrgError);
    expect(() => parseSettingAssignment('teacherGenerationLimit=-5')).toThrow(OrgError);
    expect(() => parseSettingAssignment('teacherGenerationLimit=true')).toThrow(OrgError);
    expect(() => parseSettingAssignment('studentsCanGenerate')).toThrow(OrgError);
  });
});
```

Текст «Неизвестная настройка «hack».» проверяется через `toThrow(string)`, то есть как подстрока полного сообщения.

- [ ] **Step 2: Написать падающий интеграционный тест**

`tests/integration/org-script.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { runOrgCommand } from '../../scripts/org';
import { closeDb } from '@/lib/db/client';
import { createUser, findUserByIdentifier } from '@/lib/auth/users';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/me/route';
import { POST as changePassword } from '@/app/api/me/password/route';
import { listMemberships } from '@/lib/org/access';
import { navSections } from '@/lib/org/policy';
import { findOrgBySlug } from '@/lib/org/orgs';
import { OrgError } from '@/lib/org/types';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

const SCHEMA = 'org_script_test';
const pool = testDb(SCHEMA);

async function run(...argv: string[]): Promise<string[]> {
  const out: string[] = [];
  await runOrgCommand(argv, (line) => out.push(line));
  return out;
}
function passwordFrom(out: string[]): string {
  const line = out.find((l) => l.startsWith('Временный пароль'));
  expect(line).toBeDefined();
  return line!.slice(line!.lastIndexOf(' ') + 1);
}
function post(body: unknown, cookie?: string): Request {
  return new Request('http://t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  __resetAttemptsForTests();
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('скрипт управления организациями', () => {
  it('сквозной сценарий: школа, учитель, ученик, группа, первый вход ученика', async () => {
    await createUser('teacher@example.com', 'пароль123');
    expect(await run('create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school'))
      .toEqual(['Организация sch12 создана.']);
    await run('add-member', '--org', 'sch12', '--user', 'teacher@example.com', '--role', 'teacher');
    const created = await run('create-user', '--org', 'sch12', '--login', 'ivanov.i.sch12',
      '--name', 'Иванов Иван', '--role', 'student');
    const tempPassword = passwordFrom(created);
    expect(tempPassword).toMatch(/^[а-я]+-[а-я]+-[а-я]+$/);
    await run('create-group', '--org', 'sch12', '--title', '7А');
    await run('add-to-group', '--org', 'sch12', '--group', '7А', '--user', 'ivanov.i.sch12');
    await run('assign-teacher', '--org', 'sch12', '--group', '7А', '--user', 'teacher@example.com');

    const list = await run('list');
    expect(list).toEqual(['sch12\tШкола №12\tschool\tучастников: 2']);

    // Ученик входит логином, видит флаг, меняет пароль и остаётся без «Создать».
    const res = await login(post({ identifier: 'ivanov.i.sch12', password: tempPassword }));
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect((await (await me(new Request('http://t', { headers: { cookie } }))).json()).user)
      .toMatchObject({ displayName: 'Иванов Иван', mustChangePassword: true });
    expect((await changePassword(post({ newPassword: 'мой-новый-пароль' }, cookie))).status).toBe(200);
    const student = (await findUserByIdentifier('ivanov.i.sch12'))!;
    expect(student.mustChangePassword).toBe(false);
    expect(navSections(student, await listMemberships(student.id)).map((s) => s.key))
      .toEqual(['library', 'labs']);

    const { rows } = await pool!.query<{ gm: number; gt: number }>(
      'SELECT (SELECT count(*)::int FROM group_members) AS gm, (SELECT count(*)::int FROM group_teachers) AS gt');
    expect(rows[0]).toEqual({ gm: 1, gt: 1 });
  });

  it('set меняет настройки, reset-password выдаёт новый временный пароль, disable блокирует', async () => {
    await run('create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school');
    const first = passwordFrom(await run('create-user', '--org', 'sch12', '--login', 'kim.a.sch12',
      '--name', 'Ким Алия', '--role', 'student'));

    await run('set', '--org', 'sch12', 'studentsCanGenerate=true', 'teacherGenerationLimit=40');
    expect((await findOrgBySlug('sch12'))!.settings)
      .toEqual({ studentsCanGenerate: true, studentLongSessions: false, teacherGenerationLimit: 40 });

    const second = passwordFrom(await run('reset-password', '--user', 'kim.a.sch12'));
    __resetAttemptsForTests();
    expect((await login(post({ identifier: 'kim.a.sch12', password: first }))).status).toBe(401);
    expect((await login(post({ identifier: 'kim.a.sch12', password: second }))).status).toBe(200);

    expect(await run('disable', '--user', 'kim.a.sch12')).toEqual(['Пользователь kim.a.sch12 заблокирован.']);
    expect((await login(post({ identifier: 'kim.a.sch12', password: second }))).status).toBe(403);
  });

  it('отказы понятным текстом и без побочных эффектов', async () => {
    await run('create', '--slug', 'sch12', '--name', 'Школа №12', '--kind', 'school');
    await run('create', '--slug', 'col7', '--name', 'Колледж №7', '--kind', 'college');
    await run('create-user', '--org', 'col7', '--login', 'stranger.col7', '--name', 'Чужой', '--role', 'student');
    await run('create-group', '--org', 'sch12', '--title', '7А');

    await expect(run('create', '--slug', 'sch12', '--name', 'Дубль', '--kind', 'school'))
      .rejects.toThrow('Слаг «sch12» уже занят.');
    await expect(run('create-user', '--org', 'sch12', '--login', 'ivanov@sch12', '--name', 'X', '--role', 'student'))
      .rejects.toThrow(/только строчные латинские буквы/);
    await expect(run('create-user', '--org', 'sch12', '--login', 'stranger.col7', '--name', 'X', '--role', 'student'))
      .rejects.toThrow('Логин «stranger.col7» уже занят.');
    await expect(run('create-user', '--org', 'nope', '--login', 'new.user', '--name', 'X', '--role', 'student'))
      .rejects.toThrow('Организация «nope» не найдена.');
    await expect(run('add-to-group', '--org', 'sch12', '--group', '7А', '--user', 'stranger.col7'))
      .rejects.toBeInstanceOf(OrgError);
    await expect(run('add-to-group', '--org', 'sch12', '--group', '9В', '--user', 'stranger.col7'))
      .rejects.toThrow('Группа «9В» не найдена в организации sch12.');
    await expect(run('add-member', '--org', 'sch12', '--user', 'ghost@example.com', '--role', 'teacher'))
      .rejects.toThrow('Пользователь «ghost@example.com» не найден.');
    await expect(run('add-member', '--org', 'sch12', '--user', 'stranger.col7', '--role', 'director'))
      .rejects.toThrow('Роль — org_admin, teacher или student.');
    await expect(run('set', '--org', 'sch12', 'hack=1')).rejects.toBeInstanceOf(OrgError);
    await expect(run('fly')).rejects.toThrow('Неизвестная команда «fly».');

    // Ни один отказ ничего не создал.
    const { rows } = await pool!.query<{ users: number; gm: number; orgs: number }>(
      `SELECT (SELECT count(*)::int FROM users) AS users,
              (SELECT count(*)::int FROM group_members) AS gm,
              (SELECT count(*)::int FROM organizations) AS orgs`);
    expect(rows[0]).toEqual({ users: 1, gm: 0, orgs: 2 });
    expect((await findOrgBySlug('sch12'))!.settings.studentsCanGenerate).toBe(false);
  });

  it('без команды печатает справку', async () => {
    const out = await run();
    expect(out.join('\n')).toContain('npm run org -- create --slug');
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падают**

Run: `npx vitest run tests/unit/org-cli.test.ts`
Expected: FAIL — `Failed to resolve import "../../scripts/org"`.

- [ ] **Step 4: Реализовать скрипт**

`scripts/org.ts`:

```ts
import { closeDb } from '../src/lib/db/client';
import {
  createLoginUser, disableUser, findUserByIdentifier, setTemporaryPassword,
  InvalidLoginError, LoginTakenError, type AuthUser, type StoredUser,
} from '../src/lib/auth/users';
import { generateTempPassword } from '../src/lib/auth/temp-password';
import {
  addMember, createOrganization, findOrgBySlug, listOrganizations, updateOrgSettings, type Organization,
} from '../src/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup, findGroupByTitle, type Group } from '../src/lib/org/groups';
import { ORG_SETTING_KEYS, sanitizeOrgSettings, type OrgSettingKey } from '../src/lib/org/settings';
import { OrgError, isOrgRole, type OrgRole } from '../src/lib/org/types';

/**
 * Управление организациями из консоли — до кабинета организации (цикл 2)
 * и админки (цикл 6). Работает через те же функции src/lib/org/*, что потом
 * позовут экраны.
 */

export const USAGE = [
  'Использование:',
  '  npm run org -- create --slug sch12 --name "Школа №12" --kind school',
  '  npm run org -- list',
  '  npm run org -- add-member --org sch12 --user teacher@example.com --role teacher',
  '  npm run org -- create-user --org sch12 --login ivanov.i.sch12 --name "Иванов Иван" --role student',
  '  npm run org -- create-group --org sch12 --title 7А',
  '  npm run org -- add-to-group --org sch12 --group 7А --user ivanov.i.sch12',
  '  npm run org -- assign-teacher --org sch12 --group 7А --user teacher@example.com',
  '  npm run org -- reset-password --user ivanov.i.sch12',
  '  npm run org -- disable --user ivanov.i.sch12',
  '  npm run org -- set --org sch12 studentsCanGenerate=true',
].join('\n');

export interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  rest: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = '', ...tail] = argv;
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const arg = tail[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const value = tail[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new OrgError(`У флага --${name} нет значения.`);
    }
    flags[name] = value;
    i++;
  }
  return { command, flags, rest };
}

export function parseSettingAssignment(raw: string): { key: OrgSettingKey; value: boolean | number } {
  const eq = raw.indexOf('=');
  if (eq <= 0) throw new OrgError(`Настройка записывается как ключ=значение, получено «${raw}».`);
  const key = raw.slice(0, eq);
  const text = raw.slice(eq + 1);
  if (!(ORG_SETTING_KEYS as readonly string[]).includes(key)) {
    throw new OrgError(`Неизвестная настройка «${key}». Допустимые: ${ORG_SETTING_KEYS.join(', ')}.`);
  }
  const value = text === 'true' ? true : text === 'false' ? false : /^\d+$/.test(text) ? Number(text) : NaN;
  // Тип значения проверяет тот же белый список, что и запись в базу.
  if (!(key in sanitizeOrgSettings({ [key]: value }))) {
    throw new OrgError(`Недопустимое значение «${text}» для настройки «${key}».`);
  }
  return { key: key as OrgSettingKey, value: value as boolean | number };
}

function flag(flags: Record<string, string>, name: string, hint: string): string {
  const value = flags[name]?.trim();
  if (!value) throw new OrgError(`Укажите ${hint}: --${name}.`);
  return value;
}

async function requireOrg(flags: Record<string, string>): Promise<Organization> {
  const slug = flag(flags, 'org', 'организацию');
  const org = await findOrgBySlug(slug);
  if (!org) throw new OrgError(`Организация «${slug}» не найдена.`);
  return org;
}

async function requireUser(flags: Record<string, string>): Promise<StoredUser> {
  const raw = flag(flags, 'user', 'пользователя (почту или логин)');
  const user = await findUserByIdentifier(raw);
  if (!user) throw new OrgError(`Пользователь «${raw}» не найден.`);
  return user;
}

async function requireGroup(org: Organization, flags: Record<string, string>): Promise<Group> {
  const title = flag(flags, 'group', 'группу');
  const group = await findGroupByTitle(org.id, title);
  if (!group) throw new OrgError(`Группа «${title}» не найдена в организации ${org.slug}.`);
  return group;
}

function requireRole(flags: Record<string, string>): OrgRole {
  const role = flag(flags, 'role', 'роль');
  if (!isOrgRole(role)) throw new OrgError('Роль — org_admin, teacher или student.');
  return role;
}

function nameOf(user: StoredUser): string {
  return user.login ?? user.email ?? user.id;
}

export async function runOrgCommand(argv: string[], print: (line: string) => void): Promise<void> {
  const { command, flags, rest } = parseArgs(argv);
  switch (command) {
    case '':
    case 'help': {
      print(USAGE);
      return;
    }
    case 'create': {
      const org = await createOrganization({
        slug: flag(flags, 'slug', 'слаг'), name: flag(flags, 'name', 'название'), kind: flag(flags, 'kind', 'тип'),
      });
      print(`Организация ${org.slug} создана.`);
      return;
    }
    case 'list': {
      const orgs = await listOrganizations();
      if (orgs.length === 0) print('Организаций пока нет.');
      for (const o of orgs) {
        print(`${o.slug}\t${o.name}\t${o.kind}\tучастников: ${o.memberCount}${o.archivedAt ? '\t(в архиве)' : ''}`);
      }
      return;
    }
    case 'add-member': {
      const org = await requireOrg(flags);
      const role = requireRole(flags);
      const user = await requireUser(flags);
      await addMember(org.id, user.id, role);
      print(`${nameOf(user)} теперь ${role} в ${org.slug}.`);
      return;
    }
    case 'create-user': {
      // Всё проверяется до создания аккаунта, чтобы отказ не оставлял сирот.
      const org = await requireOrg(flags);
      const role = requireRole(flags);
      const login = flag(flags, 'login', 'логин');
      const displayName = flag(flags, 'name', 'имя');
      const password = generateTempPassword();
      let user: AuthUser;
      try {
        user = await createLoginUser({ login, displayName, password, mustChangePassword: true });
      } catch (e) {
        if (e instanceof InvalidLoginError || e instanceof LoginTakenError) throw new OrgError(e.message);
        throw e;
      }
      await addMember(org.id, user.id, role);
      print(`Пользователь ${user.login} создан: ${role} в ${org.slug}.`);
      print(`Временный пароль (показывается один раз): ${password}`);
      return;
    }
    case 'create-group': {
      const org = await requireOrg(flags);
      const group = await createGroup(org.id, flag(flags, 'title', 'название группы'));
      print(`Группа «${group.title}» создана в ${org.slug}.`);
      return;
    }
    case 'add-to-group': {
      const org = await requireOrg(flags);
      const group = await requireGroup(org, flags);
      const user = await requireUser(flags);
      await addToGroup(group.id, user.id);
      print(`${nameOf(user)} добавлен в группу «${group.title}».`);
      return;
    }
    case 'assign-teacher': {
      const org = await requireOrg(flags);
      const group = await requireGroup(org, flags);
      const user = await requireUser(flags);
      await assignTeacher(group.id, user.id);
      print(`${nameOf(user)} ведёт группу «${group.title}».`);
      return;
    }
    case 'reset-password': {
      const user = await requireUser(flags);
      const password = generateTempPassword();
      await setTemporaryPassword(user.id, password);
      print(`Пароль ${nameOf(user)} сброшен, все сессии закрыты.`);
      print(`Временный пароль (показывается один раз): ${password}`);
      return;
    }
    case 'disable': {
      const user = await requireUser(flags);
      await disableUser(user.id);
      print(`Пользователь ${nameOf(user)} заблокирован.`);
      return;
    }
    case 'set': {
      const org = await requireOrg(flags);
      if (rest.length === 0) throw new OrgError('Укажите хотя бы одну настройку: ключ=значение.');
      // Сначала разбираем все пары: кривая пара не должна записать соседние.
      const patch: Record<string, boolean | number> = {};
      for (const raw of rest) {
        const { key, value } = parseSettingAssignment(raw);
        patch[key] = value;
      }
      const settings = await updateOrgSettings(org.id, patch);
      print(`Настройки ${org.slug}: ${JSON.stringify(settings)}`);
      return;
    }
    default:
      throw new OrgError(`Неизвестная команда «${command}».\n${USAGE}`);
  }
}

// Запуск как скрипт: `npm run org -- <команда>`. При импорте из тестов main не вызывается.
if (process.argv[1]?.endsWith('org.ts')) {
  runOrgCommand(process.argv.slice(2), (line) => console.log(line))
    .catch((e) => {
      console.error(e instanceof OrgError ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
```

В `package.json` в `scripts` после `"migrate:data"` добавить:

```json
    "org": "tsx scripts/org.ts",
```

- [ ] **Step 5: Запустить — убедиться, что проходят**

Run: `npx vitest run tests/unit/org-cli.test.ts`
Expected: PASS.

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration/org-script.test.ts`
Expected: PASS.

- [ ] **Step 6: Проверить руками**

Run: `npm run org`
Expected: печатается справка, код выхода 0 (без `DATABASE_URL` справка всё равно печатается — команда `help` базу не трогает).

Run: `npm run org -- fly; echo "код $?"`
Expected: «Неизвестная команда «fly».», справка, `код 1`.

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add scripts/org.ts package.json tests/unit/org-cli.test.ts tests/integration/org-script.test.ts
git commit -m "feat(org): консольный скрипт управления организациями

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: README и полная проверка

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: всё из Tasks 1–13.
- Produces: раздел README «Организации»; подраздел «Восстановление пароля» переписан на `npm run org -- reset-password`; `npm run org` в списке команд.

- [ ] **Step 1: Раздел «Организации»**

В `README.md` перед `## Запуск в Docker` вставить:

````markdown
## Организации

Школы, колледжи и университеты ведутся из консоли — до появления кабинета
организации и админки. Скрипт работает с базой из `DATABASE_URL`.

```bash
npm run org -- create --slug sch12 --name "Школа №12" --kind school
npm run org -- list
npm run org -- add-member --org sch12 --user teacher@example.com --role teacher
npm run org -- create-user --org sch12 --login ivanov.i.sch12 --name "Иванов Иван" --role student
npm run org -- create-group --org sch12 --title 7А
npm run org -- add-to-group --org sch12 --group 7А --user ivanov.i.sch12
npm run org -- assign-teacher --org sch12 --group 7А --user teacher@example.com
npm run org -- reset-password --user ivanov.i.sch12
npm run org -- disable --user ivanov.i.sch12
npm run org -- set --org sch12 studentsCanGenerate=true
```

- **Роли в организации:** `org_admin`, `teacher`, `student`; у человека одна роль
  в одной организации, `org_admin` включает права учителя. Слаг — строчная
  латиница, цифры и дефис, от 2 до 32 символов; тип — `school`, `college`
  или `university`.
- **Логин.** Ученику почта не нужна: `create-user` заводит аккаунт с логином
  (строчная латиница, цифры, `.`, `-`, `_`, от 3 до 40 символов, без `@`).
  Поле входа одно — «Почта или логин». `--user` в командах принимает и то, и другое.
- **Временный пароль.** `create-user` и `reset-password` печатают пароль из трёх
  слов (`лиса-дом-семь`) один раз. При первом входе вместо любой страницы
  открывается форма «Придумайте свой пароль»; до смены приложение отвечает 401
  на всё, кроме `/api/me`, смены пароля и выхода. `reset-password` закрывает все
  сессии человека.
- **Сессии учеников** живут 12 часов и не продлеваются, если у человека есть только
  ученические членства. Учителя, админы и пользователи без организаций получают
  обычные 30-дневные сессии.
- **Блокировка.** `disable` закрывает все сессии; вход с верным паролем отвечает
  «Аккаунт заблокирован», с неверным — обычной ошибкой. Данные не удаляются.
- **Настройки** (`set --org <slug> ключ=значение`):

  | Ключ | По умолчанию | Смысл |
  |---|---|---|
  | `studentsCanGenerate` | `false` | ученики могут генерировать; без этого раздел «Создать» им не показывается |
  | `studentLongSessions` | `false` | ученикам — обычные 30-дневные сессии |
  | `teacherGenerationLimit` | `100` | лимит генераций учителя за всё время |

- **Лимит неудачных входов** считается в памяти процесса за 15 минут: 10 неверных
  паролей к одному аккаунту, 50 входов в несуществующие аккаунты с одного IP,
  300 любых неудач с одного IP. Класс за одним школьным адресом до порогов не доходит.
- Архивная организация (`organizations.archived_at`) не даёт своим участникам
  ни прав, ни разделов, ни лимитов.
````

- [ ] **Step 2: Переписать «Восстановление пароля»**

Весь подраздел `### Восстановление пароля` (от заголовка до блока с `UPDATE users SET password_hash ...` включительно) заменить на:

````markdown
### Восстановление пароля

Почтового сервиса в контуре нет, поэтому автоматического восстановления
пароля не предусмотрено. Если человек забыл пароль, админ выдаёт ему временный:

```bash
npm run org -- reset-password --user user@example.com
```

Скрипт печатает пароль из трёх слов один раз и закрывает все сессии человека.
При входе с ним приложение попросит придумать собственный пароль.
````

- [ ] **Step 3: Список команд**

В `## Команды` после строки про `npm run migrate:data` добавить:

```markdown
- `npm run org -- <команда>` — управление организациями, логинами и временными паролями (см. «Организации»)
```

- [ ] **Step 4: Полная проверка**

Run: `npm test`
Expected: PASS, наборы с базой пропущены.

Run: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npm test`
Expected: PASS всех наборов, включая `org-migration`, `login-identifier`, `login-limit`, `org-access`, `session-kind`, `temp-password-flow`, `org-generation`, `org-script` и весь прежний набор без смысловых правок.

Run: `npx tsc --noEmit`
Expected: без ошибок.

Run: `npm run build`
Expected: сборка проходит; middleware собирается (его импорты не менялись).

Run: `git diff instrument-ui --stat -- src/lib/runtime src/middleware.ts demos`
Expected: пусто — рантайм, middleware и демки не тронуты.

Run: `git diff instrument-ui -- package.json`
Expected: единственное изменение — строка `"org": "tsx scripts/org.ts",`.

`npm run test:e2e` не запускать.

- [ ] **Step 5: Проверка критериев приёмки руками (при наличии локальной базы)**

1. `npm run migrate` на копии боевой базы — применена `004_organizations.sql`; прежний аккаунт входит почтой.
2. Пользователь без членств: навигация «Создать · Библиотека · Лаборатории», профиль «N из 10 в пробной версии», форма входа принимает почту.
3. `npm run org -- create …`, `create-group`, `add-member` учителя, `create-user` ученика; вход учеником по логину → форма «Придумайте свой пароль» → после смены приложение без раздела «Создать».
4. Покрыто `tests/integration/login-limit.test.ts`: 30 неудач по разным аккаунтам с одного IP не мешают 31-му верному входу.
5. Покрыто `tests/integration/session-kind.test.ts`: cookie ученика `Max-Age=43200`, сессия не продлевается.
6. `npm run org -- disable --user …` — открытая вкладка ученика на следующем запросе уходит на вход, вход с верным паролем показывает «Аккаунт заблокирован».
7. `npm test`, `npx tsc --noEmit`, `npm run build` — зелёные (шаг 4).

- [ ] **Step 6: Закоммитить**

```bash
git add README.md
git commit -m "docs: раздел «Организации» и сброс пароля через скрипт

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Покрытие спецификации

| Раздел спецификации | Задачи |
|---|---|
| 3. Миграция `004`, настройки организации | 1, 5, 6 |
| 4. Идентификатор входа, `AuthUser`, `userLabel`, текст ошибки, профиль | 2, 3, 10 |
| 5. Лимит неудачных входов (10 / 50 / 300, IP закрывает всё) | 4 |
| 6. Короткие сессии, `sliding`, срок cookie параметром | 7 |
| 6. Временный пароль: строгие и разрешающие варианты, layout, смена без текущего | 8, 9 |
| 6. Блокировка: 403 только при верном пароле, сессии удалены | 7 |
| 7. `access.ts`, `groups.ts`, `settings.ts`, `policy.ts` | 5, 6 |
| 7. Право на генерацию (generate, refine), квота, разделы навигации | 10, 11 |
| 8. Скрипт `scripts/org.ts`, `npm run org`, трёхсловный пароль, README | 12, 13, 14 |
| 9. Крайние случаи: логин с `@`, занятый слаг, чужой в группе, архив, две организации, старый пользователь, админ по почте | 3, 5, 6, 11, 13 (админ по почте — `roleForEmail` не меняется, покрыт `auth-session.test.ts`) |
| 10. Тесты | юниты: 2, 4, 5, 9, 10, 12, 13; интеграция: 1, 3, 4, 6, 7, 8, 11, 13 |
| 11. Критерии приёмки | 14 |

## Решения, принятые при планировании

- **Лишние файлы в `src/lib/org/`.** Кроме четырёх файлов спецификации добавлены `types.ts` (общие типы и `OrgError` без зависимостей, чтобы `policy.ts` оставался чистым) и `orgs.ts` (создание организаций и членств — нужно скрипту, а в `access.ts` спецификация кладёт только проверки). `access.ts` реэкспортирует `OrgRole` и `Membership`.
- **`requireOrgRole` для платформенного админа** возвращает синтетическое членство с ролью `org_admin`, в том числе для архивной организации; участникам архивная организация прав не даёт.
- **`org_admin` проходит проверку, где разрешён `teacher`** — по фразе «org_admin включает права учителя».
- **Лимит учителя** — наибольший `teacherGenerationLimit` среди организаций, где человек учитель или админ; ученические членства в расчёт не входят.
- **`quotaStatus(user, memberships = [])`** — параметр со значением по умолчанию, чтобы прежний `quota.test.ts` не менялся; все боевые вызовы передают членства.
- **Текст исчерпанной квоты** для пользователя без организаций не меняется; для учителя — «Лимит генераций от вашей организации исчерпан: использовано N из N.» Профиль учителя пишет «по лимиту организации» вместо «в пробной версии».
- **Доработка (`refine`)** проверяет право до поиска симуляции, поэтому 403 не раскрывает существование чужого id.
- **`POST /api/auth/logout`** пользователя не резолвит, поэтому разрешающий вариант ему не нужен: код не меняется, поведение закреплено тестом.
- **`reset-password` закрывает все сессии**, как и смена пароля; спецификация это явно не требует.
- **Шапка показывает `userContact`, а не `userLabel`**: иначе у пользователя без членств, задавшего имя, в меню аккаунта вместо почты появилось бы имя, что нарушает инвариант цикла. Спецификация исправлена под это решение.
- **Старое поле `email` во входе** принимается как идентификатор, чтобы существующие тесты и уже открытые вкладки не ломались.
