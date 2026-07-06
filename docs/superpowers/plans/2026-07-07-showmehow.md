# ShowMeHow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальное Next.js-приложение, генерирующее интерактивные научные симуляции (самодостаточный HTML) по промпту через агентный LLM-пайплайн с headless-верификацией.

**Architecture:** Next.js App Router — UI (чат+превью, библиотека, настройки) и API-роуты в одном приложении. Серверный пайплайн: планировщик → N кандидатов → Playwright-верификация с автопочинкой → физик-критик (vision) → судья → цикл доводки; события стримятся клиенту по SSE. Хранение — файлы в `./data/`.

**Tech Stack:** Next.js 15 + React 19 + TypeScript (strict), `openai` npm SDK (chat.completions — совместимость с любым OpenAI-compatible провайдером), Playwright (headless-рендер и e2e), Vitest (юнит/интеграция). Без БД, без Tailwind — один globals.css с дизайн-токенами.

## Global Constraints

- Node.js ≥ 20; TypeScript `strict: true`; ESM.
- Только `chat.completions` API (не `responses`) — максимальная совместимость провайдеров.
- Артефакт = один самодостаточный HTML-файл. Разрешённые CDN (точные URL — в Task 7):
  three.js, p5.js, matter.js, chart.js, KaTeX. Ничего другого извне.
- Артефакты исполняются ТОЛЬКО в `<iframe sandbox="allow-scripts">` (клиент) или headless-Chromium (сервер).
- API-ключи живут в `data/settings.json`, читаются только серверным кодом; в клиент отдаются маскированными (`•••• + последние 4 символа`).
- Все данные — под `dataDir()` (`SHOWMEHOW_DATA_DIR` env или `./data`). Тесты обязаны выставлять `SHOWMEHOW_DATA_DIR` во временную папку.
- Таймаут headless-рендера: 15000 мс. Автопочинка кандидата: максимум 2 попытки. Ретраи провайдера: 3 с экспоненциальной паузой.
- Режимы качества: `fast` (1 кандидат, без судьи), `standard` (2 кандидата, 1 круг доводки), `max` (3 кандидата, доводка до «все пункты рубрики ≥ 8», максимум 3 круга). По умолчанию `max`.
- Язык UI — русский.
- Коммит после каждой задачи; сообщения `feat:|test:|chore: ...`.

## File Structure

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts, next-env.d.ts
src/lib/types.ts            # все общие типы
src/lib/settings.ts         # settings.json load/save, активный провайдер
src/lib/storage.ts          # CRUD симуляций, история версий, thumbnail
src/lib/provider.ts         # openai SDK: клиент, chat с ретраями, vision-части
src/lib/artifact.ts         # extractHtml, extractJson, instrument()
src/lib/runtime.ts          # HARNESS_JS + UIKIT_CSS + UIKIT_JS (строки-константы)
src/lib/renderer.ts         # Playwright headless: ошибки, скриншоты, animated
src/lib/pipeline/prompts.ts # все системные промпты
src/lib/pipeline/stages.ts  # plan, generateCandidate, fixArtifact, verifyCandidate
src/lib/pipeline/judge.ts   # judge, rescore
src/lib/pipeline/run.ts     # Ctx, makeCtx, MODES, runPipeline, refineExisting
src/app/api/generate/route.ts
src/app/api/settings/route.ts
src/app/api/simulations/route.ts
src/app/api/simulations/[id]/route.ts
src/app/api/simulations/[id]/refine/route.ts
src/app/api/simulations/[id]/export/route.ts
src/app/api/simulations/[id]/thumbnail/route.ts
src/app/layout.tsx, src/app/globals.css
src/app/page.tsx                    # чат + превью + прогресс
src/app/library/page.tsx
src/app/present/[id]/page.tsx
src/app/settings/page.tsx
src/components/*.tsx                # Workbench, ProgressFeed, PreviewFrame и т.д.
evals/prompts.json, evals/run.ts, evals/score.ts
tests/unit/*.test.ts                # vitest
tests/fixtures/*.html               # ok / broken / hang артефакты
e2e/generate.spec.ts, e2e/mock-provider.ts
```

---

### Task 1: Scaffold проекта + core types

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `src/lib/types.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: все типы из `src/lib/types.ts` (используются каждой последующей задачей).

- [ ] **Step 1: package.json и конфиги**

`package.json`:
```json
{
  "name": "showmehow",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "eval": "tsx evals/run.ts"
  }
}
```

Установка (пиновать то, что поставится):
```bash
npm install next@15 react@19 react-dom@19 openai playwright
npm install -D typescript @types/node @types/react @types/react-dom vitest tsx @playwright/test
npx playwright install chromium
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "esModuleInterop": true,
    "jsx": "preserve", "incremental": true, "isolatedModules": true,
    "resolveJsonModule": true, "skipLibCheck": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright'],
};
export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], testTimeout: 30000 },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

`.gitignore`:
```
node_modules/
.next/
data/
evals/results/
test-results/
```

- [ ] **Step 2: src/lib/types.ts**

```ts
export type QualityMode = 'fast' | 'standard' | 'max';

export interface ProviderProfile {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  generationModel: string;
  /** Vision-модель для критика/судьи; пустая строка = vision недоступен */
  visionModel: string;
}

export interface Settings {
  activeProviderId: string | null;
  providers: ProviderProfile[];
  qualityMode: QualityMode;
}

export interface SimulationMeta {
  id: string;
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Предупреждение, если пайплайн деградировал (нет vision / все кандидаты сломаны) */
  warning?: string;
}

export interface SimParameter {
  name: string;    // имя переменной в коде
  label: string;   // подпись на русском
  min: number;
  max: number;
  step: number;
  value: number;   // начальное значение
  unit: string;    // единица измерения, '' если нет
}

export interface PlanSpec {
  title: string;
  subject: string;
  mode: '2d' | '3d';
  learningGoals: string[];
  physics: string;          // законы, уравнения, допущения — текст
  parameters: SimParameter[];
  visualPlan: string;       // что и как рисуем, какие графики
}

export interface RenderReport {
  ok: boolean;
  errors: string[];
  animated: boolean;
  screenshots: Buffer[];    // PNG
}

export interface CriticReport {
  physicsOk: boolean;
  issues: string[];
}

export interface RubricScores {
  physics: number;        // 1-10
  clarity: number;        // наглядность
  interactivity: number;
  aesthetics: number;
}

export interface JudgeVerdict {
  winnerIndex: number;
  scores: RubricScores[];  // по кандидату
  feedback: string;        // что улучшить победителю
}

export interface CandidateResult {
  html: string;
  render: RenderReport;
  critic: CriticReport | null; // null = vision недоступен
  alive: boolean;              // прошёл рендер (возможно после починки)
}

export type PipelineEvent =
  | { type: 'stage'; stage: string; detail?: string }
  | { type: 'candidate'; index: number;
      status: 'generating' | 'rendering' | 'fixing' | 'critiquing' | 'ok' | 'failed' }
  | { type: 'screenshot'; index: number; dataUrl: string }
  | { type: 'scores'; scores: RubricScores[]; winnerIndex: number }
  | { type: 'warning'; message: string }
  | { type: 'done'; simulationId: string }
  | { type: 'error'; message: string };

export function minScore(s: RubricScores): number {
  return Math.min(s.physics, s.clarity, s.interactivity, s.aesthetics);
}
```

- [ ] **Step 3: Минимальные layout/page/globals, чтобы `next build` прошёл**

`src/app/layout.tsx`:
```tsx
import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'ShowMeHow' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <nav className="topnav">
          <span className="brand">ShowMeHow</span>
          <Link href="/">Создать</Link>
          <Link href="/library">Библиотека</Link>
          <Link href="/settings">Настройки</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

`src/app/page.tsx` (заглушка, заменится в Task 12):
```tsx
export default function Home() {
  return <p>ShowMeHow</p>;
}
```

`src/app/globals.css` (дизайн-токены; полная версия — Task 12, сейчас минимум):
```css
:root {
  --bg: #0f1217; --panel: #171c24; --text: #e8ecf1; --muted: #8b95a3;
  --accent: #4f8ff7; --danger: #e5534b; --radius: 10px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
.topnav { display: flex; gap: 16px; align-items: center; padding: 10px 20px;
  background: var(--panel); border-bottom: 1px solid #232a35; }
.topnav a { color: var(--muted); text-decoration: none; }
.topnav a:hover { color: var(--text); }
.brand { font-weight: 700; margin-right: 12px; }
```

- [ ] **Step 4: Проверка**

Run: `npx tsc --noEmit && npm run build`
Expected: оба завершаются без ошибок.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with core types"
```

---

### Task 2: Settings module

**Files:**
- Create: `src/lib/settings.ts`
- Test: `tests/unit/settings.test.ts`

**Interfaces:**
- Consumes: `Settings`, `ProviderProfile` из `@/lib/types`.
- Produces: `dataDir(): string`, `loadSettings(): Settings`, `saveSettings(s: Settings): void`, `activeProvider(s?: Settings): ProviderProfile | null`.

- [ ] **Step 1: Failing test**

`tests/unit/settings.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings, saveSettings, activeProvider, dataDir } from '@/lib/settings';

describe('settings', () => {
  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  });

  it('returns defaults when file missing', () => {
    const s = loadSettings();
    expect(s.qualityMode).toBe('max');
    expect(s.providers).toEqual([]);
    expect(s.activeProviderId).toBeNull();
  });

  it('round-trips settings', () => {
    const s = loadSettings();
    s.providers.push({ id: 'p1', name: 'test', baseURL: 'http://x', apiKey: 'k',
      generationModel: 'm', visionModel: 'mv' });
    s.activeProviderId = 'p1';
    saveSettings(s);
    const loaded = loadSettings();
    expect(loaded.activeProviderId).toBe('p1');
    expect(activeProvider(loaded)?.name).toBe('test');
    expect(fs.existsSync(path.join(dataDir(), 'settings.json'))).toBe(true);
  });

  it('activeProvider is null when id not found', () => {
    expect(activeProvider(loadSettings())).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/settings.test.ts`
Expected: FAIL — `Cannot find module '@/lib/settings'`.

- [ ] **Step 3: Implementation**

`src/lib/settings.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Settings, ProviderProfile } from './types';

export function dataDir(): string {
  return process.env.SHOWMEHOW_DATA_DIR ?? path.join(process.cwd(), 'data');
}

const DEFAULTS: Settings = { activeProviderId: null, providers: [], qualityMode: 'max' };

export function loadSettings(): Settings {
  const file = path.join(dataDir(), 'settings.json');
  if (!fs.existsSync(file)) return structuredClone(DEFAULTS);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...structuredClone(DEFAULTS), ...raw };
}

export function saveSettings(s: Settings): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), 'settings.json'), JSON.stringify(s, null, 2));
}

export function activeProvider(s: Settings = loadSettings()): ProviderProfile | null {
  return s.providers.find((p) => p.id === s.activeProviderId) ?? null;
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/settings.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts tests/unit/settings.test.ts
git commit -m "feat: settings module with provider profiles"
```

---

### Task 3: Storage module (симуляции, история, thumbnail)

**Files:**
- Create: `src/lib/storage.ts`
- Test: `tests/unit/storage.test.ts`

**Interfaces:**
- Consumes: `dataDir()` из Task 2; `SimulationMeta` из types.
- Produces:
  - `createSimulation(input: {title: string; prompt: string; subject: string; tags: string[]; warning?: string}, html: string): SimulationMeta`
  - `getMeta(id: string): SimulationMeta` (throws если нет)
  - `getArtifact(id: string): string`
  - `listSimulations(): SimulationMeta[]` (по updatedAt, новые первыми)
  - `updateArtifact(id: string, html: string): void` (старая версия → history)
  - `listHistory(id: string): string[]` (имена файлов, новые первыми)
  - `restoreVersion(id: string, name: string): void`
  - `deleteSimulation(id: string): void`
  - `saveThumbnail(id: string, png: Buffer): void`, `getThumbnailPath(id): string | null`

- [ ] **Step 1: Failing test**

`tests/unit/storage.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSimulation, getMeta, getArtifact, listSimulations, updateArtifact,
  listHistory, restoreVersion, deleteSimulation, saveThumbnail, getThumbnailPath,
} from '@/lib/storage';

describe('storage', () => {
  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  });

  const input = { title: 'Диффузия', prompt: 'диффузия духов', subject: 'Физика', tags: ['газы'] };

  it('create → get → list', () => {
    const meta = createSimulation(input, '<html>v1</html>');
    expect(meta.id).toBeTruthy();
    expect(getMeta(meta.id).title).toBe('Диффузия');
    expect(getArtifact(meta.id)).toBe('<html>v1</html>');
    expect(listSimulations().map((m) => m.id)).toEqual([meta.id]);
  });

  it('updateArtifact keeps history and restore works', () => {
    const meta = createSimulation(input, '<html>v1</html>');
    updateArtifact(meta.id, '<html>v2</html>');
    expect(getArtifact(meta.id)).toBe('<html>v2</html>');
    const hist = listHistory(meta.id);
    expect(hist).toHaveLength(1);
    restoreVersion(meta.id, hist[0]);
    expect(getArtifact(meta.id)).toBe('<html>v1</html>');
    expect(listHistory(meta.id)).toHaveLength(2); // v2 ушла в историю
  });

  it('delete removes simulation', () => {
    const meta = createSimulation(input, '<html/>');
    deleteSimulation(meta.id);
    expect(listSimulations()).toEqual([]);
    expect(() => getMeta(meta.id)).toThrow();
  });

  it('thumbnail save/get', () => {
    const meta = createSimulation(input, '<html/>');
    expect(getThumbnailPath(meta.id)).toBeNull();
    saveThumbnail(meta.id, Buffer.from([137, 80]));
    expect(getThumbnailPath(meta.id)).toMatch(/thumbnail\.png$/);
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/storage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/storage'`.

- [ ] **Step 3: Implementation**

`src/lib/storage.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './settings';
import type { SimulationMeta } from './types';

function simsRoot(): string {
  return path.join(dataDir(), 'simulations');
}
function simDir(id: string): string {
  return path.join(simsRoot(), id);
}
function metaPath(id: string): string {
  return path.join(simDir(id), 'meta.json');
}
function artifactPath(id: string): string {
  return path.join(simDir(id), 'artifact.html');
}

export function createSimulation(
  input: { title: string; prompt: string; subject: string; tags: string[]; warning?: string },
  html: string,
): SimulationMeta {
  const now = new Date().toISOString();
  const meta: SimulationMeta = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...input };
  fs.mkdirSync(path.join(simDir(meta.id), 'history'), { recursive: true });
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
  fs.writeFileSync(artifactPath(meta.id), html);
  return meta;
}

export function getMeta(id: string): SimulationMeta {
  return JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
}

export function getArtifact(id: string): string {
  return fs.readFileSync(artifactPath(id), 'utf8');
}

export function listSimulations(): SimulationMeta[] {
  if (!fs.existsSync(simsRoot())) return [];
  return fs.readdirSync(simsRoot())
    .filter((d) => fs.existsSync(metaPath(d)))
    .map((d) => getMeta(d))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function touch(id: string): void {
  const meta = getMeta(id);
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
}

export function updateArtifact(id: string, html: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(artifactPath(id), path.join(simDir(id), 'history', `${stamp}.html`));
  fs.writeFileSync(artifactPath(id), html);
  touch(id);
}

export function listHistory(id: string): string[] {
  return fs.readdirSync(path.join(simDir(id), 'history')).sort().reverse();
}

export function restoreVersion(id: string, name: string): void {
  const restored = fs.readFileSync(path.join(simDir(id), 'history', name), 'utf8');
  updateArtifact(id, restored);
}

export function deleteSimulation(id: string): void {
  fs.rmSync(simDir(id), { recursive: true, force: true });
}

export function saveThumbnail(id: string, png: Buffer): void {
  fs.writeFileSync(path.join(simDir(id), 'thumbnail.png'), png);
}

export function getThumbnailPath(id: string): string | null {
  const p = path.join(simDir(id), 'thumbnail.png');
  return fs.existsSync(p) ? p : null;
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/storage.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts tests/unit/storage.test.ts
git commit -m "feat: file-based simulation storage with version history"
```

---

### Task 4: Provider layer (openai SDK + ретраи + vision)

**Files:**
- Create: `src/lib/provider.ts`
- Test: `tests/unit/provider.test.ts`

**Interfaces:**
- Consumes: `ProviderProfile` из types.
- Produces:
  - `type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }`
  - `type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }`
  - `type ChatFn = (messages: ChatMessage[]) => Promise<string>`
  - `makeClient(p: ProviderProfile): OpenAI`
  - `chatWithClient(client, model, messages, opts?): Promise<string>` — ретраи внутри
  - `bindChat(p: ProviderProfile, model: string): ChatFn`
  - `textPart(text: string): ContentPart`, `imagePart(dataUrl: string): ContentPart`

- [ ] **Step 1: Failing test**

`tests/unit/provider.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { chatWithClient, textPart, imagePart } from '@/lib/provider';

function fakeClient(responses: Array<string | Error>) {
  let i = 0;
  return {
    chat: { completions: { create: vi.fn(async () => {
      const r = responses[Math.min(i++, responses.length - 1)];
      if (r instanceof Error) throw r;
      return { choices: [{ message: { content: r } }] };
    }) } },
  };
}

describe('chatWithClient', () => {
  it('returns content on success', async () => {
    const c = fakeClient(['привет']);
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'hi' }]);
    expect(out).toBe('привет');
  });

  it('retries with backoff then succeeds', async () => {
    const c = fakeClient([new Error('503'), new Error('503'), 'ok']);
    const sleeps: number[] = [];
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'hi' }],
      { sleep: async (ms) => { sleeps.push(ms); } });
    expect(out).toBe('ok');
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('throws after 3 failed attempts', async () => {
    const c = fakeClient([new Error('boom')]);
    await expect(chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { sleep: async () => {} })).rejects.toThrow('boom');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(3);
  });

  it('treats empty content as error', async () => {
    const c = fakeClient(['']);
    await expect(chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { sleep: async () => {} })).rejects.toThrow(/empty/i);
  });

  it('content part helpers', () => {
    expect(textPart('a')).toEqual({ type: 'text', text: 'a' });
    expect(imagePart('data:x')).toEqual({ type: 'image_url', image_url: { url: 'data:x' } });
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/provider.test.ts`
Expected: FAIL — `Cannot find module '@/lib/provider'`.

- [ ] **Step 3: Implementation**

`src/lib/provider.ts`:
```ts
import OpenAI from 'openai';
import type { ProviderProfile } from './types';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export function textPart(text: string): ContentPart {
  return { type: 'text', text };
}
export function imagePart(dataUrl: string): ContentPart {
  return { type: 'image_url', image_url: { url: dataUrl } };
}

export function makeClient(p: ProviderProfile): OpenAI {
  return new OpenAI({ baseURL: p.baseURL, apiKey: p.apiKey });
}

interface ChatOpts {
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function chatWithClient(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  { retries = 3, sleep = defaultSleep }: ChatOpts = {},
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: messages as never,
      });
      const text = res.choices[0]?.message?.content;
      if (!text) throw new Error('empty response from provider');
      return text;
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export function bindChat(p: ProviderProfile, model: string): ChatFn {
  const client = makeClient(p);
  return (messages) => chatWithClient(client, model, messages);
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/provider.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add src/lib/provider.ts tests/unit/provider.test.ts
git commit -m "feat: provider layer with retries and vision message parts"
```

---

### Task 5: Artifact utils + runtime (harness, UI-kit)

**Files:**
- Create: `src/lib/artifact.ts`, `src/lib/runtime.ts`
- Test: `tests/unit/artifact.test.ts`

**Interfaces:**
- Produces:
  - `extractHtml(llmOutput: string): string` — вытаскивает HTML из ответа LLM (```html-блок, либо от `<!DOCTYPE`/`<html` до конца тега)
  - `extractJson<T>(llmOutput: string): T` — первый JSON-объект из ответа (терпит ```json-заборы и текст вокруг)
  - `instrument(html: string): string` — инжектит runtime (идемпотентно, маркер `<!--showmehow-runtime-->`)
  - из runtime.ts: `HARNESS_JS: string`, `UIKIT_CSS: string`, `UIKIT_JS: string`, `UIKIT_DOC: string` (документация API для промпта генератора)

- [ ] **Step 1: Failing test**

`tests/unit/artifact.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractHtml, extractJson, instrument } from '@/lib/artifact';

describe('extractHtml', () => {
  it('extracts fenced html block', () => {
    const out = 'Вот код:\n```html\n<!DOCTYPE html><html><body>hi</body></html>\n```\nГотово.';
    expect(extractHtml(out)).toBe('<!DOCTYPE html><html><body>hi</body></html>');
  });
  it('extracts bare html document', () => {
    const doc = '<!DOCTYPE html>\n<html><head></head><body>x</body></html>';
    expect(extractHtml('пояснение\n' + doc + '\nконец')).toBe(doc);
  });
  it('throws when no html found', () => {
    expect(() => extractHtml('просто текст')).toThrow(/html/i);
  });
});

describe('extractJson', () => {
  it('parses fenced json', () => {
    expect(extractJson<{ a: number }>('```json\n{"a": 1}\n```').a).toBe(1);
  });
  it('parses json with surrounding prose', () => {
    expect(extractJson<{ a: string }>('Ответ: {"a": "б"} — готово').a).toBe('б');
  });
  it('throws on garbage', () => {
    expect(() => extractJson('нет json')).toThrow();
  });
});

describe('instrument', () => {
  it('injects runtime after <head> and is idempotent', () => {
    const html = '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>';
    const once = instrument(html);
    expect(once).toContain('showmehow-runtime');
    expect(once.indexOf('showmehow-runtime')).toBeLessThan(once.indexOf('<title>'));
    expect(instrument(once)).toBe(once);
  });
  it('prepends runtime when no head tag', () => {
    const out = instrument('<html><body>x</body></html>');
    expect(out).toContain('showmehow-runtime');
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/artifact.test.ts`
Expected: FAIL — `Cannot find module '@/lib/artifact'`.

- [ ] **Step 3: Implement runtime.ts**

`src/lib/runtime.ts` — три строковые константы + документация для промпта:
```ts
/** Инжектится в каждый артефакт. Ошибки → parent через postMessage; пауза/пуск/сброс. */
export const HARNESS_JS = `
(function () {
  function report(msg) {
    try { parent.postMessage({ type: 'sim-error', message: String(msg) }, '*'); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    report(e.message + ' @' + (e.filename || '') + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    report('unhandledrejection: ' + (e.reason && e.reason.message || e.reason));
  });
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'sim-pause') window.dispatchEvent(new CustomEvent('sim-pause'));
    if (d.type === 'sim-play') window.dispatchEvent(new CustomEvent('sim-play'));
    if (d.type === 'sim-reset') window.dispatchEvent(new CustomEvent('sim-reset'));
  });
})();
`;

/** Стили панели управления симуляцией. */
export const UIKIT_CSS = `
:root { --sim-bg:#101318; --sim-panel:#1a2029; --sim-text:#e8ecf1; --sim-muted:#8b95a3;
  --sim-accent:#4f8ff7; }
body { margin:0; background:var(--sim-bg); color:var(--sim-text);
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif; }
.sim-panel { position:fixed; right:12px; top:12px; width:260px; padding:14px;
  background:color-mix(in srgb, var(--sim-panel) 92%, transparent);
  border:1px solid #2a3341; border-radius:12px; backdrop-filter:blur(6px);
  display:flex; flex-direction:column; gap:10px; z-index:10; }
.sim-panel h1 { font-size:15px; margin:0 0 4px; }
.sim-control label { display:flex; justify-content:space-between;
  font-size:12px; color:var(--sim-muted); margin-bottom:4px; }
.sim-control input[type=range] { width:100%; accent-color:var(--sim-accent); }
.sim-btns { display:flex; gap:8px; }
.sim-btns button { flex:1; padding:6px 0; border-radius:8px; border:1px solid #2a3341;
  background:var(--sim-panel); color:var(--sim-text); cursor:pointer; font-size:13px; }
.sim-btns button:hover { border-color:var(--sim-accent); }
.sim-value { color:var(--sim-text); font-variant-numeric:tabular-nums; }
`;

/** SimUI — фабрика контролов. Генератор обязан использовать её, не изобретать своё. */
export const UIKIT_JS = `
window.SimUI = (function () {
  var panel = null;
  function ensurePanel(title) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'sim-panel';
      if (title) { var h = document.createElement('h1'); h.textContent = title; panel.appendChild(h); }
      document.body.appendChild(panel);
    }
    return panel;
  }
  function slider(o) { // {label,min,max,step,value,unit,onChange}
    ensurePanel();
    var wrap = document.createElement('div'); wrap.className = 'sim-control';
    var lab = document.createElement('label');
    var val = document.createElement('span'); val.className = 'sim-value';
    function fmt(v) { return v + (o.unit ? ' ' + o.unit : ''); }
    lab.textContent = o.label; lab.appendChild(val);
    var inp = document.createElement('input');
    inp.type = 'range'; inp.min = o.min; inp.max = o.max; inp.step = o.step; inp.value = o.value;
    val.textContent = fmt(o.value);
    inp.addEventListener('input', function () {
      val.textContent = fmt(inp.value); o.onChange(parseFloat(inp.value));
    });
    wrap.appendChild(lab); wrap.appendChild(inp); panel.appendChild(wrap);
    return inp;
  }
  function playPause(o) { // {onPlay,onPause,onReset}
    ensurePanel();
    var box = document.createElement('div'); box.className = 'sim-btns';
    var playing = true;
    var b1 = document.createElement('button'); b1.textContent = '⏸ Пауза';
    var b2 = document.createElement('button'); b2.textContent = '↺ Сброс';
    b1.onclick = function () {
      playing = !playing;
      b1.textContent = playing ? '⏸ Пауза' : '▶ Пуск';
      (playing ? o.onPlay : o.onPause)();
    };
    b2.onclick = function () { o.onReset(); };
    window.addEventListener('sim-pause', function () { if (playing) b1.onclick(); });
    window.addEventListener('sim-play', function () { if (!playing) b1.onclick(); });
    window.addEventListener('sim-reset', function () { o.onReset(); });
    box.appendChild(b1); box.appendChild(b2); ensurePanel().appendChild(box);
  }
  function title(t) { ensurePanel(t); }
  return { slider: slider, playPause: playPause, title: title };
})();
`;

/** Описание API для системного промпта генератора. */
export const UIKIT_DOC = `
В артефакт уже встроен UI-kit (не подключай его сам, не пиши свои панели/слайдеры):
- SimUI.title('Название симуляции') — панель с заголовком (справа сверху).
- SimUI.slider({label:'Температура', min:0, max:100, step:1, value:20, unit:'°C',
    onChange:(v)=>{...}}) — слайдер параметра.
- SimUI.playPause({onPlay:()=>{}, onPause:()=>{}, onReset:()=>{}}) — кнопки Пауза/Сброс.
Стили: тёмный фон уже задан; canvas растягивай на всё окно.
`;
```

- [ ] **Step 4: Implement artifact.ts**

`src/lib/artifact.ts`:
```ts
import { HARNESS_JS, UIKIT_CSS, UIKIT_JS } from './runtime';

const MARKER = '<!--showmehow-runtime-->';

export function extractHtml(llmOutput: string): string {
  const fenced = llmOutput.match(/```html\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = llmOutput.search(/<!DOCTYPE html|<html[\s>]/i);
  if (start === -1) throw new Error('no html document found in LLM output');
  const end = llmOutput.lastIndexOf('</html>');
  if (end === -1) throw new Error('no closing </html> found in LLM output');
  return llmOutput.slice(start, end + '</html>'.length).trim();
}

export function extractJson<T>(llmOutput: string): T {
  const fenced = llmOutput.match(/```json\s*\n([\s\S]*?)```/);
  const source = fenced ? fenced[1] : llmOutput;
  const start = source.indexOf('{');
  if (start === -1) throw new Error('no JSON object found in LLM output');
  // Ищем сбалансированную закрывающую скобку
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return JSON.parse(source.slice(start, i + 1));
  }
  throw new Error('unbalanced JSON in LLM output');
}

export function instrument(html: string): string {
  if (html.includes(MARKER)) return html;
  const runtime = `${MARKER}<script>${HARNESS_JS}</script>` +
    `<style>${UIKIT_CSS}</style><script>${UIKIT_JS}</script>`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + runtime + html.slice(idx);
  }
  return runtime + html;
}
```

- [ ] **Step 5: Run test — verify pass**

Run: `npm test -- tests/unit/artifact.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 6: Commit**

```bash
git add src/lib/artifact.ts src/lib/runtime.ts tests/unit/artifact.test.ts
git commit -m "feat: artifact extraction, runtime harness and SimUI kit"
```

---

### Task 6: Headless-рендерер (Playwright)

**Files:**
- Create: `src/lib/renderer.ts`, `tests/fixtures/ok.html`, `tests/fixtures/broken.html`, `tests/fixtures/hang.html`
- Test: `tests/unit/renderer.test.ts`

**Interfaces:**
- Consumes: `RenderReport` из types.
- Produces:
  - `renderArtifact(html: string, opts?: {timeoutMs?: number; shotTimes?: number[]}): Promise<RenderReport>`
  - `closeBrowser(): Promise<void>`
  - `type RenderFn = (html: string) => Promise<RenderReport>`

- [ ] **Step 1: Фикстуры**

`tests/fixtures/ok.html` (анимированный canvas):
```html
<!DOCTYPE html><html><head><title>ok</title></head><body>
<canvas id="c" width="400" height="300"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  let x = 0;
  (function loop() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = '#4f8ff7'; ctx.fillRect((x += 2) % 400, 100, 40, 40);
    requestAnimationFrame(loop);
  })();
</script></body></html>
```

`tests/fixtures/broken.html`:
```html
<!DOCTYPE html><html><head><title>broken</title></head><body>
<script>undefinedFunction();</script></body></html>
```

`tests/fixtures/hang.html`:
```html
<!DOCTYPE html><html><head><title>hang</title></head><body>
<script>while (true) {}</script></body></html>
```

- [ ] **Step 2: Failing test**

`tests/unit/renderer.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderArtifact, closeBrowser } from '@/lib/renderer';

const fx = (n: string) =>
  fs.readFileSync(path.join(process.cwd(), 'tests/fixtures', n), 'utf8');

describe('renderArtifact', () => {
  afterAll(() => closeBrowser());

  it('ok artifact: no errors, animated, screenshots taken', async () => {
    const r = await renderArtifact(fx('ok.html'), { shotTimes: [200, 700] });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.animated).toBe(true);
    expect(r.screenshots).toHaveLength(2);
  });

  it('broken artifact: reports js error', async () => {
    const r = await renderArtifact(fx('broken.html'), { shotTimes: [200] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/undefinedFunction/);
  });

  it('hanging artifact: times out and reports error', async () => {
    const r = await renderArtifact(fx('hang.html'), { timeoutMs: 3000, shotTimes: [200] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/timeout|Timeout/);
  }, 20000);
});
```

- [ ] **Step 3: Run test — verify fail**

Run: `npm test -- tests/unit/renderer.test.ts`
Expected: FAIL — `Cannot find module '@/lib/renderer'`.

- [ ] **Step 4: Implementation**

`src/lib/renderer.ts`:
```ts
import { chromium, type Browser } from 'playwright';
import type { RenderReport } from './types';

export type RenderFn = (html: string) => Promise<RenderReport>;

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close();
  }
}

export async function renderArtifact(
  html: string,
  { timeoutMs = 15000, shotTimes = [300, 1200, 3000] }: { timeoutMs?: number; shotTimes?: number[] } = {},
): Promise<RenderReport> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  const screenshots: Buffer[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.setContent(html, { timeout: timeoutMs, waitUntil: 'load' });
    let prev = 0;
    for (const t of shotTimes) {
      await page.waitForTimeout(t - prev);
      prev = t;
      screenshots.push(await page.screenshot({ timeout: timeoutMs }));
    }
  } catch (e) {
    errors.push('render timeout/navigation: ' + String(e));
  } finally {
    await page.close().catch(() => {});
  }
  const animated = screenshots.length >= 2 &&
    !screenshots[0].equals(screenshots[screenshots.length - 1]);
  return { ok: errors.length === 0 && screenshots.length > 0, errors, animated, screenshots };
}
```

Примечание: зависший скрипт (`while(true)`) блокирует load → `setContent` кидает Timeout → ловим и репортим; `page.close()` при зависшей странице может тоже упасть — глотаем.

- [ ] **Step 5: Run test — verify pass**

Run: `npm test -- tests/unit/renderer.test.ts`
Expected: PASS (3 теста, hang-тест ~5-10 сек).

- [ ] **Step 6: Commit**

```bash
git add src/lib/renderer.ts tests/unit/renderer.test.ts tests/fixtures
git commit -m "feat: playwright headless renderer with error capture and screenshots"
```

---

### Task 7: Промпты пайплайна

**Files:**
- Create: `src/lib/pipeline/prompts.ts`
- Test: `tests/unit/prompts.test.ts`

**Interfaces:**
- Consumes: `UIKIT_DOC` из runtime, `PlanSpec` из types.
- Produces: `PLANNER_SYSTEM`, `generatorSystem(styleHint: string): string`, `STYLE_HINTS: string[]` (3 шт.), `FIXER_SYSTEM`, `CRITIC_SYSTEM`, `JUDGE_SYSTEM`, `REFINER_SYSTEM`, `CDN_WHITELIST: Record<string,string>`.

- [ ] **Step 1: Failing test**

`tests/unit/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as P from '@/lib/pipeline/prompts';

describe('prompts', () => {
  it('all prompts are non-empty strings', () => {
    for (const p of [P.PLANNER_SYSTEM, P.FIXER_SYSTEM, P.CRITIC_SYSTEM,
      P.JUDGE_SYSTEM, P.REFINER_SYSTEM]) {
      expect(p.length).toBeGreaterThan(200);
    }
  });
  it('generator prompt embeds style hint, uikit doc and CDN whitelist', () => {
    const g = P.generatorSystem(P.STYLE_HINTS[0]);
    expect(g).toContain(P.STYLE_HINTS[0]);
    expect(g).toContain('SimUI');
    for (const url of Object.values(P.CDN_WHITELIST)) expect(g).toContain(url);
  });
  it('has exactly 3 style hints', () => {
    expect(P.STYLE_HINTS).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/prompts.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Implementation**

`src/lib/pipeline/prompts.ts`:
```ts
import { UIKIT_DOC } from '../runtime';

export const CDN_WHITELIST: Record<string, string> = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.min.js',
  p5: 'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/p5.min.js',
  matter: 'https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js',
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  katexJs: 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js',
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css',
};

const cdnList = Object.values(CDN_WHITELIST).map((u) => `- ${u}`).join('\n');

export const PLANNER_SYSTEM = `Ты — методист и физик. По запросу преподавателя составь
спецификацию интерактивной учебной симуляции. Отвечай ТОЛЬКО JSON-объектом по схеме:
{
  "title": "короткое название на русском",
  "subject": "предмет (Физика/Химия/Биология/Техника/...)",
  "mode": "2d" | "3d",  // 3d только если тема реально требует объёма (механизмы, молекулы)
  "learningGoals": ["что должен понять студент", ...],  // 2-4 пункта
  "physics": "точное описание физической модели: законы, уравнения (в LaTeX), допущения,
              характерные величины и единицы. Это контракт — код обязан ему следовать.",
  "parameters": [{"name": "temperature", "label": "Температура", "min": 0, "max": 100,
                  "step": 1, "value": 20, "unit": "°C"}, ...],  // 2-4 параметра для слайдеров
  "visualPlan": "что рисуем, композиция экрана, цветовое кодирование, какие графики величин"
}
Требования: физика должна быть корректной и наблюдаемой в симуляции; параметры — те,
изменение которых наглядно меняет картину. Если приложена картинка — учитывай её.`;

export const STYLE_HINTS = [
  'Акцент на ФИЗИЧЕСКИЙ РЕАЛИЗМ: точные уравнения, реальные масштабы величин, график измеряемой величины в реальном времени.',
  'Акцент на НАГЛЯДНОСТЬ: крупные элементы, цветовое кодирование, подписи-аннотации прямо на сцене, замедленные характерные моменты.',
  'Акцент на ИНТЕРАКТИВНОСТЬ: максимум откликов на действия пользователя, курсором можно вмешиваться в симуляцию (добавлять частицы, двигать объекты).',
];

export function generatorSystem(styleHint: string): string {
  return `Ты — эксперт по учебным визуализациям (уровень лучших примеров Claude Artifacts).
Напиши ОДИН самодостаточный HTML-файл с интерактивной симуляцией по спецификации.

${styleHint}

Жёсткие правила:
- Ответ — только HTML-документ в блоке \`\`\`html ... \`\`\`. Никакого текста вне блока.
- Внешние ресурсы разрешены ТОЛЬКО из этого списка (точные URL):
${cdnList}
- Подключай только то, что реально используешь. Без fetch/XHR/WebSocket.
- ${UIKIT_DOC}
- Каждый параметр из spec.parameters — слайдер SimUI.slider с теми же label/min/max/step/value/unit.
- Обязательно SimUI.playPause: пауза останавливает анимацию, сброс возвращает начальное состояние.
- Физика обязана следовать spec.physics: те же уравнения, разумные величины, единицы.
- Для three.js: renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true}).
- Анимация через requestAnimationFrame с dt-шагом (не привязывайся к FPS).
- Код чистый и организованный: константы физики сверху с комментариями, функции короткие.
- Русский язык во всех подписях. Формулы — KaTeX, если уместны.
- Никаких заглушек и TODO: всё работает сразу.`;
}

export const FIXER_SYSTEM = `Ты чинишь сломанный HTML-артефакт симуляции. Тебе дают полный
HTML и список ошибок из консоли headless-браузера. Найди причину и исправь минимальной
правкой, сохранив всю функциональность и стиль. Не переписывай с нуля. Правила те же:
один самодостаточный HTML, ответ только в блоке \`\`\`html ... \`\`\`.`;

export const CRITIC_SYSTEM = `Ты — придирчивый физик-рецензент. Тебе дают спецификацию
симуляции и скриншоты её кадров (t≈0с, 1с, 3с). Проверь:
1) Физическая корректность видимого поведения относительно спецификации (уравнения,
   масштабы, направления, граничные условия).
2) Читаемость: подписи, единицы, цветовое кодирование, не пустой ли экран.
3) Признаки поломки: наложения, вылет за границы, NaN в подписях, чёрный экран.
Отвечай ТОЛЬКО JSON: {"physicsOk": true|false, "issues": ["конкретная проблема", ...]}.
Пустой массив issues — только если придраться реально не к чему.`;

export const JUDGE_SYSTEM = `Ты — судья качества учебных симуляций. Тебе дают спецификацию,
скриншоты кандидатов (по 2-3 кадра на кандидата, подписаны "Кандидат N") и замечания
физика-рецензента по каждому. Оцени КАЖДОГО кандидата по рубрике 1-10:
- physics: соответствие физической модели спецификации
- clarity: наглядность и педагогическая ценность
- interactivity: полнота и полезность контролов
- aesthetics: визуальное качество
Отвечай ТОЛЬКО JSON:
{"winnerIndex": 0, "scores": [{"physics":8,"clarity":9,"interactivity":7,"aesthetics":8}, ...],
 "feedback": "конкретные улучшения для победителя, по пунктам"}
scores — в порядке кандидатов, winnerIndex — индекс лучшего.`;

export const REFINER_SYSTEM = `Ты улучшаешь HTML-артефакт симуляции по замечаниям судьи
и/или запросу преподавателя. Внеси все запрошенные изменения, сохранив работающее.
Правила: один самодостаточный HTML, только разрешённые CDN, SimUI для контролов,
ответ только в блоке \`\`\`html ... \`\`\`.`;
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/prompts.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/prompts.ts tests/unit/prompts.test.ts
git commit -m "feat: pipeline system prompts with CDN whitelist and rubric"
```

---

### Task 8: Стадии пайплайна: plan, generate, fix, verify

**Files:**
- Create: `src/lib/pipeline/stages.ts`
- Test: `tests/unit/stages.test.ts`

**Interfaces:**
- Consumes: prompts (Task 7), `extractHtml/extractJson/instrument` (Task 5), `ChatMessage/ChatFn/textPart/imagePart` (Task 4), `RenderFn` (Task 6), types.
- Produces:
  - `interface Ctx { genChat: ChatFn; visionChat: ChatFn | null; render: RenderFn; emit: (e: PipelineEvent) => void }`
  - `plan(ctx: Ctx, prompt: string, imageDataUrl?: string): Promise<PlanSpec>`
  - `generateCandidate(ctx: Ctx, spec: PlanSpec, styleHint: string): Promise<string>` — готовый инструментированный HTML
  - `fixArtifact(ctx: Ctx, html: string, errors: string[]): Promise<string>`
  - `verifyCandidate(ctx: Ctx, spec: PlanSpec, html: string, index: number): Promise<CandidateResult>` — рендер → ≤2 починки → критик (если vision)

- [ ] **Step 1: Failing test**

`tests/unit/stages.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { plan, generateCandidate, verifyCandidate, type Ctx } from '@/lib/pipeline/stages';
import type { PlanSpec, RenderReport } from '@/lib/types';

const SPEC: PlanSpec = {
  title: 'Диффузия', subject: 'Физика', mode: '2d',
  learningGoals: ['понять диффузию'], physics: 'случайные блуждания',
  parameters: [{ name: 't', label: 'Температура', min: 0, max: 100, step: 1, value: 20, unit: '°C' }],
  visualPlan: 'частицы на canvas',
};
const HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas></body></html>';
const okRender: RenderReport = { ok: true, errors: [], animated: true, screenshots: [Buffer.from('a')] };
const badRender: RenderReport = { ok: false, errors: ['ReferenceError: x'], animated: false, screenshots: [] };

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    genChat: vi.fn(async () => '```html\n' + HTML + '\n```'),
    visionChat: vi.fn(async () => '{"physicsOk": true, "issues": []}'),
    render: vi.fn(async () => okRender),
    emit: vi.fn(),
    ...over,
  };
}

describe('plan', () => {
  it('parses spec json and passes image part', async () => {
    const genChat = vi.fn(async () => JSON.stringify(SPEC));
    const c = ctx({ genChat });
    const spec = await plan(c, 'диффузия', 'data:image/png;base64,xxx');
    expect(spec.title).toBe('Диффузия');
    const userMsg = genChat.mock.calls[0][0].at(-1);
    expect(JSON.stringify(userMsg.content)).toContain('data:image/png');
  });
});

describe('generateCandidate', () => {
  it('returns instrumented html', async () => {
    const html = await generateCandidate(ctx(), SPEC, 'стиль');
    expect(html).toContain('showmehow-runtime');
    expect(html).toContain('<canvas>');
  });
});

describe('verifyCandidate', () => {
  it('happy path: render ok, critic ok', async () => {
    const r = await verifyCandidate(ctx(), SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(r.critic?.physicsOk).toBe(true);
  });

  it('fixes broken candidate then succeeds', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce(badRender)
      .mockResolvedValueOnce(okRender);
    const c = ctx({ render });
    const r = await verifyCandidate(c, SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    expect(c.genChat).toHaveBeenCalledTimes(1); // один вызов фиксера
  });

  it('gives up after 2 fix attempts', async () => {
    const render = vi.fn(async () => badRender);
    const r = await verifyCandidate(ctx({ render }), SPEC, HTML, 0);
    expect(r.alive).toBe(false);
    expect(render).toHaveBeenCalledTimes(3); // исходный + 2 починки
  });

  it('skips critic when vision unavailable', async () => {
    const r = await verifyCandidate(ctx({ visionChat: null }), SPEC, HTML, 0);
    expect(r.alive).toBe(true);
    expect(r.critic).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/stages.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Implementation**

`src/lib/pipeline/stages.ts`:
```ts
import type { CandidateResult, PipelineEvent, PlanSpec } from '../types';
import type { ChatFn } from '../provider';
import { textPart, imagePart } from '../provider';
import type { RenderFn } from '../renderer';
import { extractHtml, extractJson, instrument } from '../artifact';
import { PLANNER_SYSTEM, generatorSystem, FIXER_SYSTEM, CRITIC_SYSTEM } from './prompts';

export interface Ctx {
  genChat: ChatFn;
  visionChat: ChatFn | null;
  render: RenderFn;
  emit: (e: PipelineEvent) => void;
}

export async function plan(ctx: Ctx, prompt: string, imageDataUrl?: string): Promise<PlanSpec> {
  const content = imageDataUrl
    ? [textPart(prompt), imagePart(imageDataUrl)]
    : prompt;
  const out = await ctx.genChat([
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content },
  ]);
  return extractJson<PlanSpec>(out);
}

export async function generateCandidate(ctx: Ctx, spec: PlanSpec, styleHint: string): Promise<string> {
  const out = await ctx.genChat([
    { role: 'system', content: generatorSystem(styleHint) },
    { role: 'user', content: 'Спецификация:\n' + JSON.stringify(spec, null, 2) },
  ]);
  return instrument(extractHtml(out));
}

export async function fixArtifact(ctx: Ctx, html: string, errors: string[]): Promise<string> {
  const out = await ctx.genChat([
    { role: 'system', content: FIXER_SYSTEM },
    { role: 'user', content: `Ошибки:\n${errors.join('\n')}\n\nHTML:\n\`\`\`html\n${html}\n\`\`\`` },
  ]);
  return instrument(extractHtml(out));
}

function toDataUrl(png: Buffer): string {
  return 'data:image/png;base64,' + png.toString('base64');
}

export async function verifyCandidate(
  ctx: Ctx, spec: PlanSpec, html: string, index: number,
): Promise<CandidateResult> {
  ctx.emit({ type: 'candidate', index, status: 'rendering' });
  let current = html;
  let report = await ctx.render(current);
  for (let attempt = 0; !report.ok && attempt < 2; attempt++) {
    ctx.emit({ type: 'candidate', index, status: 'fixing' });
    try {
      current = await fixArtifact(ctx, current, report.errors);
    } catch {
      break; // фиксер сам упал — кандидат выбывает
    }
    report = await ctx.render(current);
  }
  if (!report.ok) {
    ctx.emit({ type: 'candidate', index, status: 'failed' });
    return { html: current, render: report, critic: null, alive: false };
  }
  if (report.screenshots[0]) {
    ctx.emit({ type: 'screenshot', index, dataUrl: toDataUrl(report.screenshots[0]) });
  }
  let critic = null;
  if (ctx.visionChat) {
    ctx.emit({ type: 'candidate', index, status: 'critiquing' });
    try {
      const out = await ctx.visionChat([
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: [
          textPart('Спецификация:\n' + JSON.stringify(spec, null, 2)),
          ...report.screenshots.map((s) => imagePart(toDataUrl(s))),
        ] },
      ]);
      critic = extractJson<{ physicsOk: boolean; issues: string[] }>(out);
    } catch {
      critic = null; // критик упал — не валим кандидата
    }
  }
  ctx.emit({ type: 'candidate', index, status: 'ok' });
  return { html: current, render: report, critic, alive: true };
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/stages.test.ts`
Expected: PASS (6 тестов).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/stages.ts tests/unit/stages.test.ts
git commit -m "feat: pipeline stages - plan, generate, fix, verify with autofix loop"
```

---

### Task 9: Судья и пересудейство

**Files:**
- Create: `src/lib/pipeline/judge.ts`
- Test: `tests/unit/judge.test.ts`

**Interfaces:**
- Consumes: `Ctx` (Task 8), `JudgeVerdict/CandidateResult/PlanSpec/RubricScores` из types, `JUDGE_SYSTEM`.
- Produces:
  - `judge(ctx: Ctx, spec: PlanSpec, candidates: CandidateResult[]): Promise<JudgeVerdict>` — кандидаты только alive; если vision недоступен, возвращает `{winnerIndex: 0, scores: [нули], feedback: ''}` (вызывающий обязан обработать)
  - `rescore(ctx: Ctx, spec: PlanSpec, candidate: CandidateResult): Promise<{scores: RubricScores; feedback: string}>` — повторная оценка одного кандидата после доводки

- [ ] **Step 1: Failing test**

`tests/unit/judge.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { judge, rescore } from '@/lib/pipeline/judge';
import type { Ctx } from '@/lib/pipeline/stages';
import type { CandidateResult, PlanSpec } from '@/lib/types';

const SPEC = { title: 't', subject: 's', mode: '2d', learningGoals: [], physics: 'p',
  parameters: [], visualPlan: 'v' } as PlanSpec;

function cand(): CandidateResult {
  return { html: '<html/>', alive: true, critic: { physicsOk: true, issues: ['мелочь'] },
    render: { ok: true, errors: [], animated: true, screenshots: [Buffer.from('x')] } };
}
const verdict = { winnerIndex: 1,
  scores: [{ physics: 7, clarity: 7, interactivity: 7, aesthetics: 7 },
           { physics: 9, clarity: 9, interactivity: 8, aesthetics: 9 }],
  feedback: 'добавь график' };

function ctx(visionChat: Ctx['visionChat']): Ctx {
  return { genChat: vi.fn(), visionChat, render: vi.fn(), emit: vi.fn() };
}

describe('judge', () => {
  it('parses verdict from vision model', async () => {
    const c = ctx(vi.fn(async () => JSON.stringify(verdict)));
    const v = await judge(c, SPEC, [cand(), cand()]);
    expect(v.winnerIndex).toBe(1);
    expect(v.scores).toHaveLength(2);
  });

  it('degrades without vision: winner 0, zero scores', async () => {
    const v = await judge(ctx(null), SPEC, [cand(), cand()]);
    expect(v.winnerIndex).toBe(0);
    expect(v.scores[0].physics).toBe(0);
  });
});

describe('rescore', () => {
  it('returns single score set', async () => {
    const c = ctx(vi.fn(async () =>
      JSON.stringify({ winnerIndex: 0, scores: [verdict.scores[1]], feedback: 'ок' })));
    const r = await rescore(c, SPEC, cand());
    expect(r.scores.physics).toBe(9);
    expect(r.feedback).toBe('ок');
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/judge.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Implementation**

`src/lib/pipeline/judge.ts`:
```ts
import type { CandidateResult, JudgeVerdict, PlanSpec, RubricScores } from '../types';
import { textPart, imagePart } from '../provider';
import { extractJson } from '../artifact';
import { JUDGE_SYSTEM } from './prompts';
import type { Ctx } from './stages';

const ZERO: RubricScores = { physics: 0, clarity: 0, interactivity: 0, aesthetics: 0 };

function candidateParts(c: CandidateResult, label: string) {
  return [
    textPart(`${label}. Замечания рецензента: ` +
      (c.critic ? JSON.stringify(c.critic) : 'рецензирование недоступно')),
    ...c.render.screenshots.slice(0, 3).map((s) =>
      imagePart('data:image/png;base64,' + s.toString('base64'))),
  ];
}

export async function judge(
  ctx: Ctx, spec: PlanSpec, candidates: CandidateResult[],
): Promise<JudgeVerdict> {
  if (!ctx.visionChat) {
    return { winnerIndex: 0, scores: candidates.map(() => ({ ...ZERO })), feedback: '' };
  }
  const out = await ctx.visionChat([
    { role: 'system', content: JUDGE_SYSTEM },
    { role: 'user', content: [
      textPart('Спецификация:\n' + JSON.stringify(spec, null, 2)),
      ...candidates.flatMap((c, i) => candidateParts(c, `Кандидат ${i}`)),
    ] },
  ]);
  const v = extractJson<JudgeVerdict>(out);
  if (v.winnerIndex < 0 || v.winnerIndex >= candidates.length) v.winnerIndex = 0;
  return v;
}

export async function rescore(
  ctx: Ctx, spec: PlanSpec, candidate: CandidateResult,
): Promise<{ scores: RubricScores; feedback: string }> {
  const v = await judge(ctx, spec, [candidate]);
  return { scores: v.scores[0] ?? { ...ZERO }, feedback: v.feedback };
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/judge.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/judge.ts tests/unit/judge.test.ts
git commit -m "feat: judge with rubric scoring and vision degradation"
```

---

### Task 10: Оркестратор пайплайна

**Files:**
- Create: `src/lib/pipeline/run.ts`
- Test: `tests/unit/run.test.ts`

**Interfaces:**
- Consumes: всё из Tasks 8-9, storage (Task 3), settings (Task 2), `bindChat` (Task 4), `renderArtifact` (Task 6), `REFINER_SYSTEM`.
- Produces:
  - `MODES: Record<QualityMode, {candidates: number; useJudge: boolean; maxRefine: number; threshold: number}>` — fast `{1, false, 0, 0}`, standard `{2, true, 1, 0}`, max `{3, true, 3, 8}`
  - `makeCtx(emit: (e: PipelineEvent) => void): Ctx` — из активного провайдера; throws если провайдер не настроен; `visionChat = null` если `visionModel` пустая
  - `runPipeline(ctx: Ctx, input: {prompt: string; imageDataUrl?: string; mode: QualityMode}): Promise<SimulationMeta>` — полный цикл + сохранение в storage + thumbnail
  - `refineExisting(ctx: Ctx, id: string, instruction: string): Promise<void>` — правка по чату: REFINER → рендер/починка → updateArtifact

- [ ] **Step 1: Failing test**

`tests/unit/run.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline, refineExisting, MODES } from '@/lib/pipeline/run';
import type { Ctx } from '@/lib/pipeline/stages';
import { getArtifact, getMeta, listHistory, createSimulation } from '@/lib/storage';
import type { PipelineEvent, RenderReport } from '@/lib/types';

const SPEC = { title: 'Маятник', subject: 'Физика', mode: '2d', learningGoals: ['x'],
  physics: 'F=ma', parameters: [], visualPlan: 'v' };
const HTML = '<!DOCTYPE html><html><head></head><body><canvas></canvas></body></html>';
const okRender: RenderReport = { ok: true, errors: [], animated: true,
  screenshots: [Buffer.from('png')] };
const GOOD = { physics: 9, clarity: 9, interactivity: 9, aesthetics: 9 };
const WEAK = { physics: 6, clarity: 9, interactivity: 9, aesthetics: 9 };

function fakeCtx(opts: { firstScores?: object; renders?: RenderReport[] } = {}): {
  ctx: Ctx; events: PipelineEvent[];
} {
  const events: PipelineEvent[] = [];
  let judgeCall = 0;
  const renders = opts.renders;
  const ctx: Ctx = {
    genChat: vi.fn(async (msgs) => {
      const sys = String(msgs[0].content);
      if (sys.includes('методист')) return JSON.stringify(SPEC);
      return '```html\n' + HTML + '\n```';
    }),
    visionChat: vi.fn(async (msgs) => {
      const sys = String(msgs[0].content);
      // ВАЖНО: сначала проверяем судью — JUDGE_SYSTEM тоже содержит слово «рецензента»
      if (!sys.includes('судья качества')) return '{"physicsOk": true, "issues": []}';
      // судья: первый вызов — заданные баллы, дальше — хорошие
      const s = judgeCall++ === 0 ? (opts.firstScores ?? GOOD) : GOOD;
      const user = JSON.stringify(msgs[1].content);
      const n = (user.match(/Кандидат /g) ?? ['x']).length;
      return JSON.stringify({ winnerIndex: 0,
        scores: Array.from({ length: n }, () => s), feedback: 'улучшить' });
    }),
    render: vi.fn(async () => renders ? renders.shift() ?? okRender : okRender),
    emit: (e) => events.push(e),
  };
  return { ctx, events };
}

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
});

describe('runPipeline', () => {
  it('fast mode: 1 candidate, no judge, saves simulation', async () => {
    const { ctx, events } = fakeCtx();
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'fast' });
    expect(getMeta(meta.id).title).toBe('Маятник');
    expect(getArtifact(meta.id)).toContain('showmehow-runtime');
    expect(ctx.visionChat).toHaveBeenCalledTimes(1); // только критик, судьи нет
    expect(events.at(-1)).toEqual({ type: 'done', simulationId: meta.id });
  });

  it('max mode: refines until threshold met', async () => {
    const { ctx } = fakeCtx({ firstScores: WEAK }); // первый суд: physics=6 < 8
    await runPipeline(ctx, { prompt: 'маятник', mode: 'max' });
    // genChat: план + 3 кандидата + 1 рефайн = 5
    expect(ctx.genChat).toHaveBeenCalledTimes(5);
  });

  it('all candidates broken: saves best-effort with warning', async () => {
    const bad: RenderReport = { ok: false, errors: ['err'], animated: false, screenshots: [] };
    const { ctx, events } = fakeCtx({ renders: Array(20).fill(bad) });
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'fast' });
    expect(getMeta(meta.id).warning).toMatch(/ошибк/i);
    expect(events.some((e) => e.type === 'warning')).toBe(true);
  });

  it('vision unavailable: standard mode degrades with warning', async () => {
    const { ctx, events } = fakeCtx();
    ctx.visionChat = null;
    const meta = await runPipeline(ctx, { prompt: 'маятник', mode: 'standard' });
    expect(getMeta(meta.id).warning).toMatch(/vision/i);
    expect(events.some((e) => e.type === 'warning')).toBe(true);
  });
});

describe('refineExisting', () => {
  it('updates artifact and keeps history', async () => {
    const meta = createSimulation(
      { title: 't', prompt: 'p', subject: 's', tags: [] }, '<html>old</html>');
    const { ctx } = fakeCtx();
    await refineExisting(ctx, meta.id, 'сделай медленнее');
    expect(getArtifact(meta.id)).toContain('showmehow-runtime');
    expect(listHistory(meta.id)).toHaveLength(1);
  });
});

describe('MODES', () => {
  it('matches spec', () => {
    expect(MODES.fast).toEqual({ candidates: 1, useJudge: false, maxRefine: 0, threshold: 0 });
    expect(MODES.standard).toEqual({ candidates: 2, useJudge: true, maxRefine: 1, threshold: 0 });
    expect(MODES.max).toEqual({ candidates: 3, useJudge: true, maxRefine: 3, threshold: 8 });
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/run.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Implementation**

`src/lib/pipeline/run.ts`:
```ts
import type { PipelineEvent, PlanSpec, QualityMode, SimulationMeta, CandidateResult } from '../types';
import { minScore } from '../types';
import { activeProvider } from '../settings';
import { bindChat } from '../provider';
import { renderArtifact } from '../renderer';
import { createSimulation, saveThumbnail, getArtifact, updateArtifact } from '../storage';
import { extractHtml, instrument } from '../artifact';
import { REFINER_SYSTEM, STYLE_HINTS } from './prompts';
import { plan, generateCandidate, verifyCandidate, fixArtifact, type Ctx } from './stages';
import { judge, rescore } from './judge';

export const MODES: Record<QualityMode, {
  candidates: number; useJudge: boolean; maxRefine: number; threshold: number;
}> = {
  fast: { candidates: 1, useJudge: false, maxRefine: 0, threshold: 0 },
  standard: { candidates: 2, useJudge: true, maxRefine: 1, threshold: 0 },
  max: { candidates: 3, useJudge: true, maxRefine: 3, threshold: 8 },
};

export function makeCtx(emit: (e: PipelineEvent) => void): Ctx {
  const p = activeProvider();
  if (!p) throw new Error('Провайдер не настроен. Откройте Настройки.');
  return {
    genChat: bindChat(p, p.generationModel),
    visionChat: p.visionModel ? bindChat(p, p.visionModel) : null,
    render: (html) => renderArtifact(html),
    emit,
  };
}

export async function runPipeline(
  ctx: Ctx,
  input: { prompt: string; imageDataUrl?: string; mode: QualityMode },
): Promise<SimulationMeta> {
  const mode = MODES[input.mode];
  const warnings: string[] = [];
  if (!ctx.visionChat) {
    warnings.push('Vision-модель не настроена: без визуальной критики и судьи.');
    ctx.emit({ type: 'warning', message: warnings[0] });
  }

  ctx.emit({ type: 'stage', stage: 'planning' });
  const spec = await plan(ctx, input.prompt, input.imageDataUrl);

  ctx.emit({ type: 'stage', stage: 'generating', detail: `${mode.candidates} кандидата(ов)` });
  const candidates = await Promise.all(
    STYLE_HINTS.slice(0, mode.candidates).map(async (hint, index) => {
      ctx.emit({ type: 'candidate', index, status: 'generating' });
      try {
        const html = await generateCandidate(ctx, spec, hint);
        return await verifyCandidate(ctx, spec, html, index);
      } catch {
        ctx.emit({ type: 'candidate', index, status: 'failed' });
        return null;
      }
    }),
  );

  const alive = candidates.filter((c): c is CandidateResult => !!c && c.alive);
  let best: CandidateResult;
  let feedback = '';

  if (alive.length === 0) {
    const broken = candidates.find((c) => !!c);
    if (!broken) throw new Error('Не удалось сгенерировать ни одного кандидата.');
    const msg = 'Все кандидаты завершились с ошибками — сохранён лучший как есть.';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
    best = broken;
  } else if (mode.useJudge && ctx.visionChat && alive.length > 0) {
    ctx.emit({ type: 'stage', stage: 'judging' });
    const verdict = await judge(ctx, spec, alive);
    ctx.emit({ type: 'scores', scores: verdict.scores, winnerIndex: verdict.winnerIndex });
    best = alive[verdict.winnerIndex];
    feedback = verdict.feedback;
    let current = verdict.scores[verdict.winnerIndex];

    for (let round = 0; round < mode.maxRefine; round++) {
      const belowThreshold = mode.threshold > 0 && minScore(current) < mode.threshold;
      const firstStandardRound = mode.threshold === 0 && round === 0 && feedback;
      if (!belowThreshold && !firstStandardRound) break;
      ctx.emit({ type: 'stage', stage: 'refining', detail: `круг ${round + 1}` });
      const refined = await refineHtml(ctx, best.html, feedback);
      const verified = await verifyCandidate(ctx, spec, refined, 0);
      if (!verified.alive) break; // доводка сломала — оставляем предыдущее
      const re = await rescore(ctx, spec, verified);
      best = verified;
      current = re.scores;
      feedback = re.feedback;
      ctx.emit({ type: 'scores', scores: [re.scores], winnerIndex: 0 });
    }
  } else {
    best = alive[0];
  }

  ctx.emit({ type: 'stage', stage: 'saving' });
  const meta = createSimulation({
    title: spec.title, prompt: input.prompt, subject: spec.subject,
    tags: spec.learningGoals.slice(0, 3),
    warning: warnings.length ? warnings.join(' ') : undefined,
  }, best.html);
  const shot = best.render.screenshots[1] ?? best.render.screenshots[0];
  if (shot) saveThumbnail(meta.id, shot);
  ctx.emit({ type: 'done', simulationId: meta.id });
  return meta;
}

async function refineHtml(ctx: Ctx, html: string, feedback: string): Promise<string> {
  const out = await ctx.genChat([
    { role: 'system', content: REFINER_SYSTEM },
    { role: 'user', content: `Замечания:\n${feedback}\n\nHTML:\n\`\`\`html\n${html}\n\`\`\`` },
  ]);
  return instrument(extractHtml(out));
}

export async function refineExisting(ctx: Ctx, id: string, instruction: string): Promise<void> {
  const html = getArtifact(id);
  ctx.emit({ type: 'stage', stage: 'refining' });
  let refined = await refineHtml(ctx, html, instruction);
  let report = await ctx.render(refined);
  for (let attempt = 0; !report.ok && attempt < 2; attempt++) {
    refined = await fixArtifact(ctx, refined, report.errors);
    report = await ctx.render(refined);
  }
  if (!report.ok) throw new Error('Правка сломала симуляцию: ' + report.errors.join('; '));
  updateArtifact(id, refined);
  const shot = report.screenshots[1] ?? report.screenshots[0];
  if (shot) saveThumbnail(id, shot);
  ctx.emit({ type: 'done', simulationId: id });
}
```

Примечание к тесту max-режима: WEAK-баллы приходят от ПЕРВОГО вызова судьи, рефайн происходит один раз, после rescore приходят GOOD ≥ 8 — цикл останавливается. Итого genChat: план(1) + кандидаты(3) + рефайн(1) = 5.

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/run.test.ts`
Expected: PASS (7 тестов).

- [ ] **Step 5: Run полный набор**

Run: `npm test`
Expected: все юнит-тесты зелёные.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/run.ts tests/unit/run.test.ts
git commit -m "feat: pipeline orchestrator with quality modes and refinement loop"
```

---

### Task 11: API-роуты

**Files:**
- Create: `src/app/api/generate/route.ts`, `src/app/api/settings/route.ts`, `src/app/api/simulations/route.ts`, `src/app/api/simulations/[id]/route.ts`, `src/app/api/simulations/[id]/refine/route.ts`, `src/app/api/simulations/[id]/export/route.ts`, `src/app/api/simulations/[id]/thumbnail/route.ts`
- Test: `tests/unit/api.test.ts`

**Interfaces:**
- Consumes: pipeline `makeCtx/runPipeline/refineExisting` (Task 10), storage (Task 3), settings (Task 2).
- Produces (HTTP-контракт для UI, Tasks 12-14):
  - `POST /api/generate` `{prompt, imageDataUrl?, mode?}` → SSE-поток `data: <PipelineEvent JSON>\n\n`
  - `GET /api/settings` → `Settings` с маскированными ключами (`•••• + 4 последних`); `PUT /api/settings` — тело `Settings`; если apiKey начинается с `••••`, сохраняется старый ключ
  - `GET /api/simulations` → `SimulationMeta[]`
  - `GET /api/simulations/:id` → `{meta, html}`; `DELETE /api/simulations/:id` → `{ok: true}`
  - `POST /api/simulations/:id/refine` `{instruction}` → `{html}` (обновлённый артефакт)
  - `GET /api/simulations/:id/export` → HTML-файл с `Content-Disposition: attachment`
  - `GET /api/simulations/:id/thumbnail` → PNG или 404

- [ ] **Step 1: Failing test (settings-маскировка + simulations CRUD через хэндлеры)**

`tests/unit/api.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as listSims } from '@/app/api/simulations/route';
import { GET as getSim, DELETE as delSim } from '@/app/api/simulations/[id]/route';
import { saveSettings, loadSettings } from '@/lib/settings';
import { createSimulation } from '@/lib/storage';

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
});

const profile = { id: 'p1', name: 'n', baseURL: 'http://x', apiKey: 'sk-secret-1234',
  generationModel: 'g', visionModel: 'v' };

describe('settings api', () => {
  it('GET masks api keys', async () => {
    saveSettings({ activeProviderId: 'p1', providers: [profile], qualityMode: 'max' });
    const res = await getSettings();
    const body = await res.json();
    expect(body.providers[0].apiKey).toBe('••••1234');
  });

  it('PUT with masked key keeps original', async () => {
    saveSettings({ activeProviderId: 'p1', providers: [profile], qualityMode: 'max' });
    const req = new Request('http://t/api/settings', { method: 'PUT',
      body: JSON.stringify({ activeProviderId: 'p1', qualityMode: 'fast',
        providers: [{ ...profile, apiKey: '••••1234' }] }) });
    await putSettings(req);
    const s = loadSettings();
    expect(s.providers[0].apiKey).toBe('sk-secret-1234');
    expect(s.qualityMode).toBe('fast');
  });
});

describe('simulations api', () => {
  it('list, get, delete', async () => {
    const meta = createSimulation(
      { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>x</html>');
    const list = await (await listSims()).json();
    expect(list).toHaveLength(1);
    const params = Promise.resolve({ id: meta.id });
    const one = await (await getSim(new Request('http://t'), { params })).json();
    expect(one.html).toBe('<html>x</html>');
    await delSim(new Request('http://t'), { params: Promise.resolve({ id: meta.id }) });
    expect(await (await listSims()).json()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- tests/unit/api.test.ts`
Expected: FAIL — модули роутов не найдены.

- [ ] **Step 3: Implementation роутов**

`src/app/api/settings/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/settings';
import type { Settings } from '@/lib/types';

const MASK = '••••';

export async function GET() {
  const s = loadSettings();
  return NextResponse.json({
    ...s,
    providers: s.providers.map((p) => ({ ...p, apiKey: MASK + p.apiKey.slice(-4) })),
  });
}

export async function PUT(req: Request) {
  const incoming = (await req.json()) as Settings;
  const current = loadSettings();
  incoming.providers = incoming.providers.map((p) => {
    if (p.apiKey.startsWith(MASK)) {
      const old = current.providers.find((c) => c.id === p.id);
      return { ...p, apiKey: old?.apiKey ?? '' };
    }
    return p;
  });
  saveSettings(incoming);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/simulations/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { listSimulations } from '@/lib/storage';

export async function GET() {
  return NextResponse.json(listSimulations());
}
```

`src/app/api/simulations/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getMeta, getArtifact, deleteSimulation } from '@/lib/storage';

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  try {
    return NextResponse.json({ meta: getMeta(id), html: getArtifact(id) });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  deleteSimulation(id);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/simulations/[id]/refine/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { makeCtx, refineExisting } from '@/lib/pipeline/run';
import { getArtifact } from '@/lib/storage';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { instruction } = await req.json();
  try {
    await refineExisting(makeCtx(() => {}), id, instruction);
    return NextResponse.json({ html: getArtifact(id) });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) },
      { status: 500 });
  }
}
```

`src/app/api/simulations/[id]/export/route.ts`:
```ts
import { getMeta, getArtifact } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = getMeta(id);
  return new Response(getArtifact(id), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition':
        `attachment; filename*=UTF-8''${encodeURIComponent(meta.title)}.html`,
    },
  });
}
```

`src/app/api/simulations/[id]/thumbnail/route.ts`:
```ts
import fs from 'node:fs';
import { getThumbnailPath } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getThumbnailPath(id);
  if (!p) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(p)),
    { headers: { 'Content-Type': 'image/png' } });
}
```

`src/app/api/generate/route.ts` (SSE):
```ts
import { makeCtx, runPipeline } from '@/lib/pipeline/run';
import type { PipelineEvent, QualityMode } from '@/lib/types';

export const maxDuration = 600;

export async function POST(req: Request) {
  const { prompt, imageDataUrl, mode = 'max' } = (await req.json()) as {
    prompt: string; imageDataUrl?: string; mode?: QualityMode;
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PipelineEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const ctx = makeCtx(send);
        await runPipeline(ctx, { prompt, imageDataUrl, mode });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/api.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Проверить сборку**

Run: `npx tsc --noEmit && npm run build`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/app/api tests/unit/api.test.ts
git commit -m "feat: API routes - SSE generation, settings with key masking, simulations CRUD"
```

---

### Task 12: UI — главный экран (чат + превью + прогресс)

**Files:**
- Create: `src/components/Workbench.tsx`, `src/components/ProgressFeed.tsx`, `src/components/PreviewFrame.tsx`
- Modify: `src/app/page.tsx`, `src/app/globals.css` (добавить стили ниже)

**Interfaces:**
- Consumes: HTTP-контракт Task 11; `PipelineEvent` из types.
- Produces: страница `/` c параметром `?id=<simId>` (открытие готовой симуляции из библиотеки).

UI-задачи проверяются `npm run build` + ручным смоуком; сквозная автоматика — Task 15 (e2e).

- [ ] **Step 1: PreviewFrame**

`src/components/PreviewFrame.tsx`:
```tsx
'use client';
export default function PreviewFrame({ html }: { html: string | null }) {
  if (!html) {
    return <div className="preview-empty">Здесь появится симуляция</div>;
  }
  return (
    <iframe
      className="preview-frame"
      sandbox="allow-scripts"
      srcDoc={html}
      title="Симуляция"
    />
  );
}
```

- [ ] **Step 2: ProgressFeed**

`src/components/ProgressFeed.tsx`:
```tsx
'use client';
import type { PipelineEvent } from '@/lib/types';

const STAGE_LABELS: Record<string, string> = {
  planning: '📋 Составляю план симуляции',
  generating: '⚙️ Генерирую кандидатов',
  judging: '⚖️ Судья сравнивает кандидатов',
  refining: '✨ Довожу до порога качества',
  saving: '💾 Сохраняю',
};
const CAND_LABELS: Record<string, string> = {
  generating: 'генерация', rendering: 'проверка рендера', fixing: 'автопочинка',
  critiquing: 'физик-критик', ok: '✓ готов', failed: '✗ выбыл',
};

export default function ProgressFeed({ events }: { events: PipelineEvent[] }) {
  const shots = new Map<number, string>();
  const candStatus = new Map<number, string>();
  const lines: string[] = [];
  let scores: string | null = null;
  for (const e of events) {
    if (e.type === 'stage') lines.push(STAGE_LABELS[e.stage] ?? e.stage);
    if (e.type === 'candidate') candStatus.set(e.index, CAND_LABELS[e.status]);
    if (e.type === 'screenshot') shots.set(e.index, e.dataUrl);
    if (e.type === 'warning') lines.push('⚠️ ' + e.message);
    if (e.type === 'scores')
      scores = e.scores.map((s, i) =>
        `К${i}: физика ${s.physics} / наглядность ${s.clarity} / ` +
        `интерактив ${s.interactivity} / эстетика ${s.aesthetics}`).join('\n');
  }
  return (
    <div className="progress-feed">
      {lines.map((l, i) => <div key={i} className="progress-line">{l}</div>)}
      <div className="progress-cands">
        {[...candStatus.entries()].map(([i, st]) => (
          <div key={i} className="cand-chip">
            Кандидат {i + 1}: {st}
            {shots.has(i) && <img src={shots.get(i)} alt="" className="cand-shot" />}
          </div>
        ))}
      </div>
      {scores && <pre className="progress-scores">{scores}</pre>}
    </div>
  );
}
```

- [ ] **Step 3: Workbench (SSE-клиент + чат)**

`src/components/Workbench.tsx`:
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PipelineEvent, QualityMode } from '@/lib/types';
import ProgressFeed from './ProgressFeed';
import PreviewFrame from './PreviewFrame';

type Phase = 'idle' | 'generating' | 'ready' | 'error';

export default function Workbench() {
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [simId, setSimId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<QualityMode>('max');
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = search.get('id');
    if (id) openSimulation(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openSimulation(id: string) {
    const res = await fetch(`/api/simulations/${id}`);
    if (!res.ok) return;
    const { html } = await res.json();
    setSimId(id); setHtml(html); setPhase('ready');
  }

  async function consumeSSE(res: Response) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop()!;
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const e = JSON.parse(part.slice(6)) as PipelineEvent;
        setEvents((prev) => [...prev, e]);
        if (e.type === 'done') { await openSimulation(e.simulationId); }
        if (e.type === 'error') { setError(e.message); setPhase('error'); }
      }
    }
  }

  async function generate() {
    setPhase('generating'); setEvents([]); setError(null); setHtml(null);
    const res = await fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, imageDataUrl: image ?? undefined, mode }),
    });
    await consumeSSE(res);
  }

  async function refine(instruction: string) {
    if (!simId) return;
    setPhase('generating');
    setEvents([{ type: 'stage', stage: 'refining' }]);
    const res = await fetch(`/api/simulations/${simId}/refine`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction }),
    });
    const body = await res.json();
    if (res.ok) { setHtml(body.html); setPhase('ready'); }
    else { setError(body.error); setPhase('error'); }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setImage(String(r.result));
    r.readAsDataURL(f);
  }

  function submit() {
    const text = prompt.trim();
    if (!text || phase === 'generating') return;
    setPrompt('');
    if (phase === 'ready' && simId) refine(text);
    else generate();
  }

  return (
    <div className="workbench">
      <aside className="chat-pane">
        <h2>{phase === 'ready' ? 'Доработка' : 'Новая симуляция'}</h2>
        {phase === 'ready' && (
          <button className="link-btn" onClick={() => {
            setPhase('idle'); setSimId(null); setHtml(null); setEvents([]);
          }}>+ начать новую</button>
        )}
        <ProgressFeed events={events} />
        {error && <div className="error-box">{error}</div>}
        <div className="composer">
          {phase !== 'ready' && (
            <div className="composer-row">
              <select value={mode} onChange={(e) => setMode(e.target.value as QualityMode)}>
                <option value="max">Максимум (3-6 мин)</option>
                <option value="standard">Стандарт (1-3 мин)</option>
                <option value="fast">Быстрый (~1 мин)</option>
              </select>
              <button onClick={() => fileRef.current?.click()}>
                {image ? '🖼 картинка ✓' : '🖼 картинка'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            </div>
          )}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={phase === 'ready'
              ? 'Что изменить? Например: сделай частицы медленнее'
              : 'Опишите симуляцию. Например: диффузия молекул духов в комнате'}
            rows={3}
          />
          <button className="primary" disabled={phase === 'generating'} onClick={submit}>
            {phase === 'generating' ? 'Работаю…' : phase === 'ready' ? 'Доработать' : 'Создать'}
          </button>
        </div>
      </aside>
      <section className="preview-pane">
        <PreviewFrame html={html} />
        {simId && (
          <div className="preview-actions">
            <a href={`/present/${simId}`} target="_blank">▶ Режим презентации</a>
            <a href={`/api/simulations/${simId}/export`}>⬇ Экспорт HTML</a>
          </div>
        )}
      </section>
    </div>
  );
}
```

`src/app/page.tsx`:
```tsx
import { Suspense } from 'react';
import Workbench from '@/components/Workbench';

export default function Home() {
  return (
    <Suspense>
      <Workbench />
    </Suspense>
  );
}
```

- [ ] **Step 4: Добавить в `src/app/globals.css`**

```css
.workbench { display: flex; height: calc(100vh - 45px); }
.chat-pane { width: 380px; min-width: 380px; display: flex; flex-direction: column;
  gap: 10px; padding: 16px; background: var(--panel); overflow-y: auto;
  border-right: 1px solid #232a35; }
.chat-pane h2 { margin: 0; font-size: 16px; }
.preview-pane { flex: 1; display: flex; flex-direction: column; }
.preview-frame { flex: 1; width: 100%; border: none; background: #101318; }
.preview-empty { flex: 1; display: grid; place-items: center; color: var(--muted); }
.preview-actions { display: flex; gap: 16px; padding: 8px 16px;
  background: var(--panel); border-top: 1px solid #232a35; }
.preview-actions a { color: var(--accent); text-decoration: none; }
.composer { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.composer-row { display: flex; gap: 8px; }
.composer textarea, .composer select, .composer button {
  background: #10151d; color: var(--text); border: 1px solid #2a3341;
  border-radius: var(--radius); padding: 8px; font: inherit; }
.composer button { cursor: pointer; }
.composer button.primary { background: var(--accent); border-color: var(--accent);
  color: #fff; font-weight: 600; }
.composer button:disabled { opacity: .6; cursor: default; }
.progress-feed { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.progress-line { color: var(--muted); }
.progress-cands { display: flex; flex-direction: column; gap: 6px; }
.cand-chip { background: #10151d; border: 1px solid #2a3341; border-radius: 8px;
  padding: 6px 8px; font-size: 12px; }
.cand-shot { display: block; width: 100%; margin-top: 6px; border-radius: 6px; }
.progress-scores { font-size: 11px; color: var(--muted); white-space: pre-wrap; }
.error-box { background: #3a1d1c; border: 1px solid var(--danger); color: #f2b8b5;
  border-radius: var(--radius); padding: 10px; font-size: 13px; }
.link-btn { background: none; border: none; color: var(--accent); cursor: pointer;
  padding: 0; text-align: left; font-size: 13px; }
```

- [ ] **Step 5: Проверка**

Run: `npx tsc --noEmit && npm run build`
Expected: без ошибок.
Ручной смоук: `npm run dev` → на `/` виден чат-панель слева и «Здесь появится симуляция» справа.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/globals.css src/components
git commit -m "feat: main workbench UI with SSE progress and preview"
```

---

### Task 13: UI — библиотека и режим презентации

**Files:**
- Create: `src/app/library/page.tsx`, `src/app/present/[id]/page.tsx`
- Modify: `src/app/globals.css` (стили ниже)

**Interfaces:**
- Consumes: HTTP-контракт Task 11.

- [ ] **Step 1: Библиотека**

`src/app/library/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import type { SimulationMeta } from '@/lib/types';

export default function Library() {
  const [sims, setSims] = useState<SimulationMeta[]>([]);
  const [q, setQ] = useState('');

  async function load() {
    setSims(await (await fetch('/api/simulations')).json());
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm('Удалить симуляцию?')) return;
    await fetch(`/api/simulations/${id}`, { method: 'DELETE' });
    load();
  }

  const shown = sims.filter((s) =>
    (s.title + s.prompt + s.subject + s.tags.join(' ')).toLowerCase()
      .includes(q.toLowerCase()));

  return (
    <div className="library">
      <div className="library-head">
        <h1>Библиотека</h1>
        <input placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {shown.length === 0 && <p className="muted">Пока пусто — создайте первую симуляцию.</p>}
      <div className="cards">
        {shown.map((s) => (
          <div key={s.id} className="card">
            <a href={`/?id=${s.id}`}>
              <img src={`/api/simulations/${s.id}/thumbnail`} alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <h3>{s.title}</h3>
            </a>
            <p className="muted">{s.subject} · {new Date(s.updatedAt).toLocaleDateString('ru')}</p>
            {s.warning && <p className="warn">⚠ {s.warning}</p>}
            <div className="card-actions">
              <a href={`/present/${s.id}`} target="_blank">▶ Показать</a>
              <a href={`/api/simulations/${s.id}/export`}>⬇ Экспорт</a>
              <button onClick={() => remove(s.id)}>Удалить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Режим презентации**

`src/app/present/[id]/page.tsx`:
```tsx
import { getArtifact } from '@/lib/storage';

export default async function Present({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let html: string;
  try {
    html = getArtifact(id);
  } catch {
    return <p style={{ padding: 20 }}>Симуляция не найдена.</p>;
  }
  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={html}
      title="Презентация"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none' }}
    />
  );
}
```

- [ ] **Step 3: Стили в `globals.css`**

```css
.library { padding: 24px; max-width: 1100px; margin: 0 auto; }
.library-head { display: flex; justify-content: space-between; align-items: center; }
.library-head input { background: var(--panel); border: 1px solid #2a3341; color: var(--text);
  border-radius: var(--radius); padding: 8px 12px; width: 260px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px; margin-top: 16px; }
.card { background: var(--panel); border: 1px solid #232a35; border-radius: 12px;
  padding: 12px; }
.card img { width: 100%; border-radius: 8px; aspect-ratio: 16/10; object-fit: cover; }
.card h3 { margin: 8px 0 4px; font-size: 15px; }
.card a { color: var(--text); text-decoration: none; }
.card-actions { display: flex; gap: 12px; margin-top: 8px; font-size: 13px; }
.card-actions a { color: var(--accent); }
.card-actions button { background: none; border: none; color: var(--danger);
  cursor: pointer; padding: 0; font-size: 13px; }
.muted { color: var(--muted); font-size: 13px; }
.warn { color: #e3b341; font-size: 12px; }
```

- [ ] **Step 4: Проверка**

Run: `npx tsc --noEmit && npm run build`
Expected: без ошибок. Ручной смоук: `/library` открывается, пустое состояние видно.

- [ ] **Step 5: Commit**

```bash
git add src/app/library src/app/present src/app/globals.css
git commit -m "feat: library page and fullscreen presentation mode"
```

---

### Task 14: UI — настройки провайдеров

**Files:**
- Create: `src/app/settings/page.tsx`
- Modify: `src/app/globals.css` (стили ниже)

**Interfaces:**
- Consumes: `GET/PUT /api/settings` (Task 11). Ключи приходят маскированными; немодифицированный маскированный ключ сервер сохраняет как старый.

- [ ] **Step 1: Страница настроек**

`src/app/settings/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Settings, ProviderProfile } from '@/lib/types';

const EMPTY: ProviderProfile = { id: '', name: '', baseURL: 'https://api.openai.com/v1',
  apiKey: '', generationModel: '', visionModel: '' };

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then(setS);
  }, []);
  if (!s) return <p style={{ padding: 20 }}>Загрузка…</p>;

  function patchProvider(i: number, patch: Partial<ProviderProfile>) {
    setS((prev) => prev && {
      ...prev,
      providers: prev.providers.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    });
  }
  function addProvider() {
    setS((prev) => prev && {
      ...prev,
      providers: [...prev.providers, { ...EMPTY, id: crypto.randomUUID() }],
    });
  }
  async function save() {
    await fetch('/api/settings', { method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="settings">
      <h1>Настройки</h1>
      <label className="field">
        <span>Режим качества по умолчанию</span>
        <select value={s.qualityMode}
          onChange={(e) => setS({ ...s, qualityMode: e.target.value as Settings['qualityMode'] })}>
          <option value="max">Максимум</option>
          <option value="standard">Стандарт</option>
          <option value="fast">Быстрый</option>
        </select>
      </label>
      <h2>Провайдеры</h2>
      {s.providers.map((p, i) => (
        <fieldset key={p.id} className="provider">
          <label className="radio">
            <input type="radio" name="active" checked={s.activeProviderId === p.id}
              onChange={() => setS({ ...s, activeProviderId: p.id })} /> активный
          </label>
          <label className="field"><span>Название</span>
            <input value={p.name} onChange={(e) => patchProvider(i, { name: e.target.value })} /></label>
          <label className="field"><span>Base URL</span>
            <input value={p.baseURL} onChange={(e) => patchProvider(i, { baseURL: e.target.value })}
              placeholder="https://openrouter.ai/api/v1" /></label>
          <label className="field"><span>API-ключ</span>
            <input value={p.apiKey} onChange={(e) => patchProvider(i, { apiKey: e.target.value })} /></label>
          <label className="field"><span>Модель генерации</span>
            <input value={p.generationModel}
              onChange={(e) => patchProvider(i, { generationModel: e.target.value })} /></label>
          <label className="field"><span>Vision-модель (пусто = нет)</span>
            <input value={p.visionModel}
              onChange={(e) => patchProvider(i, { visionModel: e.target.value })} /></label>
          <button className="danger" onClick={() => setS({ ...s,
            providers: s.providers.filter((_, j) => j !== i) })}>Удалить провайдера</button>
        </fieldset>
      ))}
      <div className="settings-actions">
        <button onClick={addProvider}>+ Добавить провайдера</button>
        <button className="primary" onClick={save}>{saved ? 'Сохранено ✓' : 'Сохранить'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Стили в `globals.css`**

```css
.settings { padding: 24px; max-width: 640px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 12px; }
.settings .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.settings .field span { color: var(--muted); }
.settings input, .settings select { background: var(--panel); border: 1px solid #2a3341;
  color: var(--text); border-radius: var(--radius); padding: 8px 10px; font: inherit; }
.provider { border: 1px solid #232a35; border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 10px; background: var(--panel); }
.radio { font-size: 13px; color: var(--muted); }
.settings-actions { display: flex; gap: 12px; }
.settings button { background: var(--panel); color: var(--text); border: 1px solid #2a3341;
  border-radius: var(--radius); padding: 8px 14px; cursor: pointer; }
.settings button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.settings button.danger { color: var(--danger); align-self: flex-start; }
```

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit && npm run build`
Expected: без ошибок. Ручной смоук: добавить провайдера, сохранить, перезагрузить страницу — ключ маскирован, данные на месте.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings src/app/globals.css
git commit -m "feat: provider settings UI"
```

---

### Task 15: E2E-смоук с мок-провайдером

**Files:**
- Create: `e2e/mock-provider.ts`, `e2e/generate.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: всё приложение целиком (dev-сервер) + mock OpenAI-совместимый сервер.

- [ ] **Step 1: Мок-провайдер**

`e2e/mock-provider.ts` — OpenAI-совместимый HTTP-сервер, отвечает по содержимому system-промпта:
```ts
import http from 'node:http';

const SPEC = {
  title: 'Диффузия духов', subject: 'Физика', mode: '2d',
  learningGoals: ['понять диффузию'], physics: 'случайные блуждания частиц',
  parameters: [{ name: 'speed', label: 'Скорость', min: 1, max: 10, step: 1,
    value: 3, unit: '' }],
  visualPlan: 'частицы на canvas',
};

const ARTIFACT = `<!DOCTYPE html><html><head><title>sim</title></head><body>
<canvas id="c" width="800" height="600"></canvas>
<script>
  var ctx = document.getElementById('c').getContext('2d'); var t = 0;
  SimUI.title('Диффузия духов');
  SimUI.slider({label:'Скорость',min:1,max:10,step:1,value:3,unit:'',onChange:function(){}});
  SimUI.playPause({onPlay:function(){},onPause:function(){},onReset:function(){}});
  (function loop(){ ctx.fillStyle='#000'; ctx.fillRect(0,0,800,600);
    ctx.fillStyle='#4f8ff7'; ctx.fillRect((t+=3)%800, 300, 30, 30);
    requestAnimationFrame(loop); })();
</script></body></html>`;

function reply(system: string): string {
  if (system.includes('методист')) return JSON.stringify(SPEC);
  // ВАЖНО: судью проверяем ДО рецензента — JUDGE_SYSTEM содержит слово «рецензента»
  if (system.includes('судья качества'))
    return JSON.stringify({ winnerIndex: 0,
      scores: [{ physics: 9, clarity: 9, interactivity: 9, aesthetics: 9 }],
      feedback: '' });
  if (system.includes('рецензент')) return '{"physicsOk": true, "issues": []}';
  return '```html\n' + ARTIFACT + '\n```';
}

export function startMockProvider(port: number): Promise<() => Promise<void>> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { messages } = JSON.parse(body || '{}');
      const system = String(messages?.[0]?.content ?? '');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        choices: [{ message: { content: reply(system) } }],
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, () =>
      resolve(() => new Promise((r) => server.close(() => r()))));
  });
}
```

Важно: у судьи в JUDGE_SYSTEM первая строка — «Ты — судья качества учебных симуляций», у планировщика — «Ты — методист», у критика — «придирчивый физик-рецензент». Роутинг мока опирается на эти маркеры; при переименовании промптов обнови мок.

- [ ] **Step 2: Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:3300' },
  webServer: {
    command: 'npm run dev -- --port 3300',
    port: 3300,
    reuseExistingServer: false,
    env: { SHOWMEHOW_DATA_DIR: './e2e/.data' },
  },
});
```

- [ ] **Step 3: E2E-тест**

`e2e/generate.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { startMockProvider } from './mock-provider';

let stop: () => Promise<void>;

test.beforeAll(async () => {
  fs.rmSync('./e2e/.data', { recursive: true, force: true });
  fs.mkdirSync('./e2e/.data', { recursive: true });
  fs.writeFileSync('./e2e/.data/settings.json', JSON.stringify({
    activeProviderId: 'mock',
    qualityMode: 'fast',
    providers: [{ id: 'mock', name: 'mock', baseURL: 'http://localhost:3399/v1',
      apiKey: 'test', generationModel: 'mock-gen', visionModel: 'mock-vision' }],
  }));
  stop = await startMockProvider(3399);
});
test.afterAll(async () => { await stop(); });

test('generate simulation end-to-end', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Опишите симуляцию/).fill('диффузия духов в комнате');
  await page.getByRole('combobox').selectOption('fast');
  await page.getByRole('button', { name: 'Создать' }).click();
  // прогресс виден
  await expect(page.getByText(/Составляю план/)).toBeVisible({ timeout: 30_000 });
  // превью появилось
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('canvas')).toBeVisible({ timeout: 90_000 });
  // симуляция в библиотеке
  await page.goto('/library');
  await expect(page.getByText('Диффузия духов')).toBeVisible();
});
```

- [ ] **Step 4: Run**

Run: `npm run test:e2e`
Expected: PASS (1 тест). Мок-сервер должен отвечать мгновенно, всё время уходит на headless-рендер (~10-20 сек).

- [ ] **Step 5: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: e2e smoke with mock OpenAI-compatible provider"
```

---

### Task 16: Eval-набор + README

**Files:**
- Create: `evals/prompts.json`, `evals/score.ts`, `evals/run.ts`, `README.md`
- Test: `tests/unit/score.test.ts`

**Interfaces:**
- Consumes: `makeCtx/runPipeline` (Task 10), `RubricScores/minScore` из types.
- Produces:
  - `aggregate(rows: {prompt: string; scores: RubricScores | null; error?: string}[]): {avg: RubricScores; passRate: number; failures: string[]}` (score.ts) — passRate = доля строк с minScore ≥ 8
  - `npm run eval` — прогон всех промптов, отчёт в `evals/results/<ISO-дата>.md`

- [ ] **Step 1: Failing test для aggregate**

`tests/unit/score.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { aggregate } from '../../evals/score';

const S = (n: number) => ({ physics: n, clarity: n, interactivity: n, aesthetics: n });

describe('aggregate', () => {
  it('computes averages, pass rate and failures', () => {
    const r = aggregate([
      { prompt: 'a', scores: S(9) },
      { prompt: 'b', scores: S(7) },
      { prompt: 'c', scores: null, error: 'boom' },
    ]);
    expect(r.avg.physics).toBe(8);        // (9+7)/2
    expect(r.passRate).toBeCloseTo(1 / 3); // только 'a' прошёл (min>=8), из 3 промптов
    expect(r.failures).toEqual(['c: boom']);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- tests/unit/score.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Implementation**

`evals/score.ts`:
```ts
import type { RubricScores } from '../src/lib/types';
import { minScore } from '../src/lib/types';

export interface EvalRow {
  prompt: string;
  scores: RubricScores | null;
  error?: string;
}

export function aggregate(rows: EvalRow[]): {
  avg: RubricScores; passRate: number; failures: string[];
} {
  const ok = rows.filter((r) => r.scores) as (EvalRow & { scores: RubricScores })[];
  const sum = (k: keyof RubricScores) =>
    ok.reduce((a, r) => a + r.scores[k], 0) / Math.max(ok.length, 1);
  return {
    avg: { physics: sum('physics'), clarity: sum('clarity'),
      interactivity: sum('interactivity'), aesthetics: sum('aesthetics') },
    passRate: rows.length ? ok.filter((r) => minScore(r.scores) >= 8).length / rows.length : 0,
    failures: rows.filter((r) => !r.scores).map((r) => `${r.prompt}: ${r.error}`),
  };
}
```

`evals/prompts.json` (15 эталонных промптов):
```json
[
  "Диффузия молекул духов в комнате",
  "Циркуляция тёплого воздуха в комнате с батареей у окна",
  "Как работает четырёхтактный двигатель внутреннего сгорания",
  "Математический маятник: период и амплитуда",
  "Интерференция волн от двух точечных источников",
  "Преломление света на границе вода-воздух, полное внутреннее отражение",
  "Броуновское движение крупной частицы среди молекул",
  "Электрическое поле двух точечных зарядов, силовые линии",
  "Идеальный газ: давление, температура и объём (модель частиц в сосуде)",
  "Гармонические колебания груза на пружине с графиком энергии",
  "Осмос через полупроницаемую мембрану",
  "Движение планеты по эллиптической орбите, законы Кеплера",
  "Резонанс: вынужденные колебания при разной частоте вынуждающей силы",
  "Дифракция волны на щели",
  "Теплопроводность: распространение тепла по металлическому стержню"
]
```

`evals/run.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import prompts from './prompts.json';
import { aggregate, type EvalRow } from './score';
import { makeCtx, runPipeline } from '../src/lib/pipeline/run';
import { rescore } from '../src/lib/pipeline/judge';
import { plan } from '../src/lib/pipeline/stages';
import { getArtifact } from '../src/lib/storage';
import { renderArtifact, closeBrowser } from '../src/lib/renderer';
import type { RubricScores } from '../src/lib/types';

async function evalOne(prompt: string): Promise<EvalRow> {
  try {
    const ctx = makeCtx(() => {});
    const meta = await runPipeline(ctx, { prompt, mode: 'max' });
    // финальная независимая оценка сохранённого артефакта
    const spec = await plan(ctx, prompt);
    const render = await renderArtifact(getArtifact(meta.id));
    const { scores } = await rescore(ctx, spec,
      { html: getArtifact(meta.id), render, critic: null, alive: render.ok });
    return { prompt, scores };
  } catch (e) {
    return { prompt, scores: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function fmt(s: RubricScores): string {
  return `физика ${s.physics.toFixed(1)}, наглядность ${s.clarity.toFixed(1)}, ` +
    `интерактив ${s.interactivity.toFixed(1)}, эстетика ${s.aesthetics.toFixed(1)}`;
}

const rows: EvalRow[] = [];
for (const p of prompts) {
  console.log('▶', p);
  rows.push(await evalOne(p));
}
await closeBrowser();

const agg = aggregate(rows);
const lines = [
  `# Eval ${new Date().toISOString().slice(0, 10)}`,
  '',
  `Средние: ${fmt(agg.avg)}`,
  `Порог пройден (все ≥ 8): ${(agg.passRate * 100).toFixed(0)}%`,
  '',
  ...rows.map((r) => `- ${r.scores ? '✅' : '❌'} ${r.prompt}` +
    (r.scores ? ` — ${fmt(r.scores)}` : ` — ${r.error}`)),
];
const out = path.join('evals', 'results', `${new Date().toISOString().slice(0, 10)}.md`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n'));
console.log('Отчёт:', out);
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- tests/unit/score.test.ts`
Expected: PASS. (Сам `npm run eval` требует настоящего провайдера — запускается вручную, в CI не гоняется.)

- [ ] **Step 5: README.md**

````markdown
# ShowMeHow

Генератор интерактивных научных симуляций для преподавателей. Опишите явление —
получите интерактивную визуализацию (2D/3D) для показа на занятии.

## Запуск

```bash
npm install
npx playwright install chromium
npm run dev
```

Откройте http://localhost:3000 → Настройки → добавьте провайдера
(любой OpenAI-совместимый: OpenAI, OpenRouter, Ollama...). Укажите модель генерации
и vision-модель (для критика и судьи качества).

## Как это работает

Пайплайн: план симуляции → 1-3 кандидата → headless-проверка (Playwright) с
автопочинкой → физик-критик по скриншотам → судья по рубрике → доводка до порога
качества. Режимы: быстрый / стандарт / максимум.

Результат — самодостаточный HTML-файл: работает в библиотеке, в полноэкранном
режиме презентации и как экспортированный файл без сервера.

## Команды

- `npm test` — юнит/интеграционные тесты
- `npm run test:e2e` — e2e с мок-провайдером
- `npm run eval` — прогон эталонных промптов с оценкой качества (нужен настроенный провайдер)
````

- [ ] **Step 6: Полная проверка и Commit**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: всё зелёное.

```bash
git add evals tests/unit/score.test.ts README.md
git commit -m "feat: eval harness with rubric scoring and README"
```

---

## Порядок и зависимости

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → {12, 13, 14 параллельно} → 15 → 16.
Задачи 12-14 независимы друг от друга (общий контракт — API из Task 11).

## Self-Review отметки

- Spec coverage: план (Task 8), N кандидатов (Task 10), автопочинка (Task 8), критик (Task 8), судья (Task 9), доводка с порогом ≥8/3 круга (Task 10), режимы качества (Task 10), SSE-прогресс (Task 11-12), чат-доработка + история версий (Task 10, 3), библиотека/презентация/экспорт (Task 13, 11), настройки с маскировкой ключей (Task 11, 14), vision-деградация (Task 8-10), таймаут 15с (Task 6), evals (Task 16), e2e (Task 15). Покрыто всё из спеки.
- Деградация «vision недоступен» помечается warning в meta — реализовано в Task 10.







