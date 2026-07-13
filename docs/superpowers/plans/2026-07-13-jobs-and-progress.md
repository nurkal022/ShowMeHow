# Jobs + Candidates + Rich Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Генерация как переживающее перезагрузку задание (job) с богатой визуализацией этапов и настраиваемым числом кандидатов (1-5).

**Architecture:** Модуль `src/lib/jobs.ts` — in-memory store + JSON-персист журнала событий; `POST /api/generate` возвращает jobId и запускает пайплайн detached; `GET /api/jobs/[id]/stream` — SSE с реплеем; клиент хранит активный jobId в localStorage и переподключается. Пайплайн испускает расширенные события (plan-ready, critic-verdict, judge-verdict, refine-round, stage start/end); ProgressFeed заменяется на StageTimeline + PlanCard + CandidateCard[] + RefinePanel.

**Spec (нормативна):** docs/superpowers/specs/2026-07-13-jobs-and-progress-design.md

## Global Constraints

- Все прежние (sandbox, dataDir, TS strict, русский UI, гейты npm test / tsc / build; e2e для UI-задач).
- Событие `scores` ЗАМЕНЯЕТСЯ на `judge-verdict`; `stage` меняет форму на {stage, status:'start'|'end', at} — все потребители и тесты обновляются в тех же задачах, никакой обратной совместимости не требуется (jobs новые).
- Отмена — кооперативная: проверка `signal()` между этапами; статус cancelled ≠ error.
- job-файлы в `data/jobs/` (уже под гитигнором через data/).
- ОТСТУПЛЕНИЕ от «полный код в плане»: задачи содержат точные интерфейсы/контракты и скетчи сложных мест; полный код пишет имплементер под ревью + гейты (как в плане 2026-07-08).

---

### Task 1: Job-store

**Files:** Create `src/lib/jobs.ts`, `tests/unit/jobs.test.ts`

**Produces (точный контракт):**
```ts
export type JobStatus = 'running' | 'done' | 'error' | 'cancelled';
export interface JobRequest { prompt: string; mode: QualityMode; candidates: number; hasImage: boolean }
export interface Job { id: string; status: JobStatus; createdAt: string; events: PipelineEvent[];
  simulationId?: string; error?: string; request: JobRequest }
export function createJob(request: JobRequest): Job
export function getJob(id: string): Job | null        // память → data/jobs/<id>.json фолбэк;
  // осиротевший running с диска → status 'error', error 'Сервер был перезапущен' (и персист обратно)
export function appendEvent(id: string, e: PipelineEvent): void
  // пушит, персистит; e.type==='done' → status done + simulationId; 'error' → status error + error
export function markCancelled(id: string): void        // status cancelled + терминальное событие
  // {type:'error', message:'Отменено пользователем'}? НЕТ — отдельное событие {type:'cancelled'}
export function requestCancel(id: string): void        // ставит флаг
export function isCancelled(id: string): boolean
export function subscribe(id: string, cb: (e: PipelineEvent) => void): () => void
  // события, приходящие ПОСЛЕ подписки; реплей прошлых — забота читателя (getJob().events)
```
Также в types.ts: `| { type: 'cancelled' }` в PipelineEvent. Терминальными считаются done|error|cancelled.
Персист: `fs.writeFileSync(data/jobs/<id>.json, JSON.stringify(job))` на каждый append/markCancelled. subscribe-колбэки вызываются синхронно из appendEvent/markCancelled.

**Tests:** create→getJob; appendEvent персистит (файл читается и совпадает); done-событие → status+simulationId; subscribe получает только новые события, unsubscribe работает; requestCancel/isCancelled; оolder-process сценарий: записать running-job на диск руками, очистить память (экспортировать `__clearForTests()`), getJob → error «Сервер был перезапущен»; cancelled терминален.

Commit: `feat: job store with event journal and cancellation`

---

### Task 2: События и пайплайн

**Files:** Modify `src/lib/types.ts`, `src/lib/pipeline/prompts.ts`, `src/lib/pipeline/stages.ts`, `src/lib/pipeline/run.ts`; Tests: обновить `tests/unit/run.test.ts`, `tests/unit/stages.test.ts`, `tests/unit/prompts.test.ts`, добавить хелпер-тесты.

**types.ts — PipelineEvent (итоговая форма):**
```ts
export type PipelineStage = 'planning' | 'generating' | 'critiquing' | 'judging' | 'refining' | 'saving';
export type PipelineEvent =
  | { type: 'stage'; stage: PipelineStage; status: 'start' | 'end'; at: number }
  | { type: 'plan-ready'; spec: PlanSummary }
  | { type: 'candidate'; index: number; status: 'generating'|'rendering'|'fixing'|'critiquing'|'ok'|'failed'; styleHint: string }
  | { type: 'screenshot'; index: number; dataUrl: string }
  | { type: 'critic-verdict'; index: number; physicsOk: boolean; issues: string[] }
  | { type: 'judge-verdict'; scores: RubricScores[]; candidateIndices: number[]; winnerIndex: number; feedback: string }
  | { type: 'refine-round'; round: number; before: RubricScores; after: RubricScores | null }
  | { type: 'warning'; message: string }
  | { type: 'cancelled' }
  | { type: 'done'; simulationId: string }
  | { type: 'error'; message: string };
export interface PlanSummary { title: string; subject: string; mode: '2d'|'3d';
  physics: string; parameters: { label: string; unit: string }[]; goals: string[] }
```

**prompts.ts:** STYLE_HINTS → 5 (два новых из спеки §2) + `export const STYLE_NAMES = ['Реализм','Наглядность','Интерактив','Схема','Данные']` (индексно соответствуют). Обновить prompts.test (length 5).

**stages.ts:** `verifyCandidate` и candidate-события получают styleHint (короткое имя) — простейший способ: verifyCandidate принимает `styleName: string` и включает его в каждое candidate-событие; после критика emit `critic-verdict`.

**run.ts:**
- input получает `candidates?: number`; `const count = clamp(input.candidates ?? MODES[mode].candidates, 1, 5)`; выбор хинтов: `Array.from({length: count}, (_,i) => STYLE_HINTS[i % STYLE_HINTS.length])`.
- `export function resolveCandidates(mode: QualityMode, requested?: number): number` (кламп-хелпер, юнит-тест).
- `runPipeline(ctx, input, signal?: () => boolean)`: проверки `if (signal?.()) throw new CancelledError()` перед планом, перед каждым кандидатом, перед судом, перед каждым кругом доводки, перед сохранением. `export class CancelledError extends Error`.
- emit stage-пар: `emitStage(ctx,'planning','start')` / 'end' вокруг каждого этапа (at = Date.now()).
- После plan: emit `plan-ready` (PlanSummary из PlanSpec: parameters → {label, unit}, goals = learningGoals).
- `judge-verdict` вместо `scores` (+feedback); refine-round до/после каждого круга (after=null если круг сломался/прерван).

**Обновление тестов:** все прежние assertions на 'stage'/'scores' переписать; новые: plan-ready испускается со сводкой; critic-verdict при живом критике; judge-verdict несёт feedback; refine-round before/after; candidates=5 → 5 генераций (styleHints зациклены); resolveCandidates кламп (0→1, 9→5, undefined→дефолт режима); CancelledError: signal true перед судом → runPipeline бросает CancelledError, симуляция НЕ сохранена.

Commit: `feat: rich pipeline events, candidate count, cancellation signal`

---

### Task 3: API — generate detached, jobs stream/cancel/get

**Files:** Modify `src/app/api/generate/route.ts`; Create `src/app/api/jobs/[id]/stream/route.ts`, `src/app/api/jobs/[id]/cancel/route.ts`, `src/app/api/jobs/[id]/route.ts`; Test `tests/unit/jobs-api.test.ts`

**generate/route.ts:**
```ts
POST body: { prompt, imageDataUrl?, mode?, candidates? }
→ const job = createJob({prompt, mode, candidates: resolved, hasImage: !!imageDataUrl});
  void runDetached(job.id, ...); return NextResponse.json({ jobId: job.id });
runDetached: try { ctx = makeCtx(e => appendEvent(jobId, e));
  await runPipeline(ctx, input, () => isCancelled(jobId)); }
  catch (e) { e instanceof CancelledError ? markCancelled(jobId)
    : appendEvent(jobId, {type:'error', message:...}); }
```
makeCtx может бросить синхронно (нет провайдера) — поймать и записать error-событие в job (jobId уже отдан клиенту? НЕТ: провайдер проверяется ДО createJob — если makeCtx бросает, вернуть 400 {error} сразу, job не создавать).

**stream/route.ts (GET, SSE):** getJob → 404 если нет. Реплей: все job.events как `data:` кадры; если статус уже терминальный — закрыть после реплея. Иначе subscribe; на каждый терминальный event — flush и close; `cancel()` ReadableStream — unsubscribe. Комментарий: между getJob-снапшотом и subscribe есть щель — читать события так: подписаться СНАЧАЛА в буфер, потом реплей снапшота, потом дренаж буфера с дедупликацией по количеству (индекс события) — проще: subscribe первым, затем replay job.events по индексу, буфер доставляет только события с индексом ≥ длины снапшота (передавать индекс в cb или замыканием считать). Реализовать аккуратно, тест на гонку не требуется, но код должен не дублировать и не терять события (описать инвариант в комментарии).

**cancel/route.ts (POST):** requestCancel(id) → {ok:true}; 404 если job нет; идемпотентно.

**[id]/route.ts (GET):** Job без events: {id, status, createdAt, simulationId?, error?, request}.

**Tests (прямые вызовы хэндлеров, fake provider не нужен):** generate без провайдера → 400, job не создан; с настроенным провайдером и фейковым... makeCtx реален — для юнита установить settings с провайдером и подменить? Пайплайн реально пойдёт в сеть. Решение: в generate/route.ts вынести `runDetached` и внедрить зависимость нельзя просто; вместо этого юнит тестирует: cancel 404/ok; GET job 404/shape (создав job через createJob напрямую); stream: создать job, append пару событий, вызвать GET — прочитать ReadableStream: реплей событий доехал; append ещё событие через store → доезжает live; append done → поток закрывается. Полный generate-путь покрывает e2e (Task 6).

Commit: `feat: job-based generation API with SSE replay and cancel`

---

### Task 4: Workbench — job-клиент и селектор кандидатов

**Files:** Modify `src/components/Workbench.tsx`, `src/app/globals.css`

- Селектор «Кандидатов: N» (1-5) рядом с режимом; смена режима сбрасывает N на дефолт режима.
- generate(): POST /api/generate → {jobId} (или 400 → error); localStorage['showmehow-active-job']=jobId; connectToJob(jobId).
- connectToJob: fetch stream, консюмер как прежний consumeSSE (терминальные: done → openSimulation + чистка ключа; error/cancelled → сообщение + чистка). События складываются в state (для новых компонентов T5; до T5 ProgressFeed временно адаптировать к новым типам минимально — компилируется и показывает хоть что-то; полноценный UI в T5).
- Mount: активный job из localStorage → GET /api/jobs/<id> → running: connectToJob (реплей восстановит), done: openSimulation, error/cancelled: показать и почистить, 404: почистить. ?id= обрабатывается только если активного running-job нет.
- Кнопка «Отменить» в phase generating → POST cancel (после cancelled-события UI разблокируется).
- strand-guard остаётся: поток закрылся без терминального события → error-сообщение.

Гейты: tsc, build, dev-smoke (страница 200). Commit: `feat: workbench job client - reattach, cancel, candidate count`

---

### Task 5: Компоненты прогресса

**Files:** Create `src/components/progress/StageTimeline.tsx`, `PlanCard.tsx`, `CandidateCard.tsx`, `RefinePanel.tsx`, `ProgressView.tsx` (агрегатор: events[] → derived state → раскладка); Delete/replace `src/components/ProgressFeed.tsx`; Modify `Workbench.tsx` (использует ProgressView), `globals.css`.

- ProgressView derive: Map этапов (start/end/при живом статусе — длительность тикает), PlanSummary, Map кандидатов {styleHint, status, screenshot, critic, scores?, isWinner}, раунды доводки, warnings.
- StageTimeline: чипы Планирование/Кандидаты/Суд/Доводка/Сохранение (critiquing агрегируется в «Кандидаты»); состояния тусклый/пульс/галочка + секунды.
- PlanCard: title, subject, 2D/3D бейдж, physics (line-clamp 2, разворот по клику), чипы параметров «label (unit)», цели списком.
- CandidateCard: «Кандидат N · стиль», статус, скриншот (img), критик (✓/«⚠ N замечаний» с разворотом), 4 мини-бара рубрики (ширина = score/10, число рядом), 👑+рамка у победителя.
- RefinePanel: «Круг k: min 6.5 → 8.2» + feedback судьи (свёрнуто).
- Ошибки/отмена — баннеры. Всё воспроизводимо из реплея (никакого локального состояния, только events).
- Стили: тёмная тема, существующие токены; карточки кандидатов в ряд с переносом (flex-wrap), в чат-панели 380px — колонкой.

Гейты: tsc, build, dev-smoke. Commit: `feat: rich progress view - timeline, plan card, candidate cards`

---

### Task 6: E2E (reload + cancel) + README + финальные гейты

**Files:** Modify `e2e/generate.spec.ts` (обновить под новый UI: тексты этапов из StageTimeline, поток через jobs), Create `e2e/reload.spec.ts`; Modify `README.md`.

- generate.spec: прежний сценарий должен пройти с job-архитектурой (адаптировать селекторы: например ждать чип «Планирование» или карточку кандидата; превью и библиотека как раньше).
- reload.spec (мок-провайдер, fast): старт генерации → дождаться первого события (карточка плана или чип этапа) → page.reload() → прогресс снова виден (реплей) → превью появляется → симуляция в библиотеке. Второй тест: старт → «Отменить» → баннер отмены, библиотека пуста (мок медленный? мок отвечает мгновенно — отмена может не успеть; сделать отменяемость проверяемой: у мок-провайдера искусственная задержка 1500мс на генераторный запрос через query-флаг в baseURL? проще: в mock-provider.ts задержка 1200мс для generator-ответов (константа), тесты это учитывают — генерация всё ещё быстрая, но окно для отмены есть).
- README: раздел «Как устроена генерация» — заметка про задания (переживает перезагрузку), селектор кандидатов.
- Финальные гейты: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e` (3 spec-файла).

Commit: `feat: reload/cancel e2e, docs`

## Порядок
1 → 2 → 3 → 4 → 5 → 6.

## Self-Review
- Спека §2 → T2/T4; §3.1 → T1; §3.2 → T3; §3.3 → T4; §4.1 → T2; §4.2 → T5; §5 → тесты в T1-T3 + T6. Покрыто.
- Замена scores→judge-verdict и формы stage: потребители run.test/stages.test (T2), Workbench/ProgressFeed (T4 минимально, T5 полноценно), e2e (T6). Ни один потребитель не остаётся на старом типе после T6.
- Отмена на быстром моке: решено задержкой в мок-провайдере (T6).
