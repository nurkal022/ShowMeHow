# ShowMeHow: jobs, настраиваемые кандидаты, богатый прогресс — спецификация

**Дата:** 2026-07-13
**Статус:** утверждено

## 1. Цель

1. Число кандидатов настраивается пользователем (1-5).
2. Генерация переживает перезагрузку страницы: job-архитектура с воспроизведением событий.
3. Богатая визуализация этапов: таймлайн, карточка плана, карточки кандидатов с оценками.

## 2. Настраиваемые кандидаты

- UI: в композере селект «Кандидатов: N» (1-5). Дефолт подставляется из выбранного режима
  (fast 1 / standard 2 / max 3) и обновляется при смене режима, но пользовательский выбор
  главнее (смена режима после ручного выбора — сбрасывает на дефолт режима, это ок).
- API: `POST /api/generate` принимает `candidates?: number`; сервер клампит в [1,5];
  отсутствие поля = дефолт режима. `runPipeline` получает `candidateCount` через input
  (MODES остаётся источником judge/refine-политики).
- `STYLE_HINTS` расширяется до 5 (добавить: «СХЕМАТИЧНАЯ ЯСНОСТЬ: минимум декора, крупные
  схемы-диаграммы, стрелки и подписи, идеально для доски» и «ДАННЫЕ И ГРАФИКИ: приборная
  панель с живыми графиками величин (chart.js), численные индикаторы, экспорт понимания
  через числа»). Кандидат i использует STYLE_HINTS[i % 5].

## 3. Job-архитектура

### 3.1 Job-store (`src/lib/jobs.ts`)

```ts
interface Job {
  id: string;                  // uuid
  status: 'running' | 'done' | 'error' | 'cancelled';
  createdAt: string;
  events: PipelineEvent[];     // полный журнал
  simulationId?: string;       // при done
  error?: string;              // при error
  request: { prompt: string; mode: QualityMode; candidates: number; hasImage: boolean };
}
```

- Хранение: in-memory Map (источник истины в рамках процесса) + запись JSON-снапшота в
  `data/jobs/<id>.json` при каждом событии (throttle не нужен — событий десятки).
  При старте процесса store пуст; job-файлы со статусом running, найденные на диске при
  обращении, считаются осиротевшими → статус error «Сервер был перезапущен».
- API модуля: `createJob(request): Job`, `getJob(id)` (память → диск-фолбэк),
  `appendEvent(id, e)` (+персист; done/error события переводят статус),
  `cancelJob(id)` (ставит флаг; пайплайн проверяет между этапами и кандидатами),
  `isCancelled(id)`, `subscribe(id, cb): unsubscribe` (для live-стрима),
  `listJobs(): JobSummary[]` (для отладки, без событий).
- Отмена: `runPipeline` получает optional `signal: () => boolean`; проверка перед каждым
  этапом (генерация кандидата, критика, суд, круг доводки) → при true бросает
  `new Error('Отменено пользователем')`, job → cancelled (не error).

### 3.2 API

- `POST /api/generate` → `{jobId}` немедленно; пайплайн запускается detached
  (`void run()` с catch), все emit идут в `appendEvent`. Изображение (imageDataUrl)
  живёт только в памяти запуска (в job-файл не пишется, `hasImage: true`).
- `GET /api/jobs/[id]/stream` → SSE: сначала replay всех накопленных событий,
  затем live через subscribe; закрывается после done/error/cancelled (терминальное
  событие всегда доезжает). Отключение клиента не влияет на job.
- `POST /api/jobs/[id]/cancel` → `{ok}`.
- `GET /api/jobs/[id]` → Job без событий (status, simulationId, error, request).

### 3.3 Клиент (Workbench)

- localStorage `showmehow-active-job` = jobId; ставится при старте генерации,
  чистится при терминальном событии.
- При монтировании: если есть activeJob → `GET /api/jobs/<id>`:
  running → подключиться к stream (реплей восстановит весь прогресс);
  done → открыть симуляцию; error/cancelled → показать сообщение; 404 → почистить ключ.
- Кнопка «Отменить» видна во время генерации → POST cancel.
- `?id=` в URL работает как раньше (открытие готовой симуляции имеет приоритет
  над восстановлением job? Нет: активный running-job главнее, ?id= — если job нет).

### 3.4 Доработка (refine)

Refine остаётся синхронным запросом (короткий путь) — вне scope. При активном
running-job кнопки доработки скрыты (генерация занята).

## 4. Богатый прогресс

### 4.1 Новые/расширенные события (`PipelineEvent`)

```ts
| { type: 'stage'; stage: PipelineStage; status: 'start' | 'end'; at: number }
    // PipelineStage = 'planning'|'generating'|'critiquing'|'judging'|'refining'|'saving'
    // at = Date.now() сервера; и start и end — для таймингов
| { type: 'plan-ready'; spec: { title: string; subject: string; mode: '2d'|'3d';
    physics: string; parameters: {label: string; unit: string}[]; goals: string[] } }
| { type: 'candidate'; index: number; status: CandStatus; styleHint: string }
    // CandStatus += прежние; styleHint — короткое имя акцента («Реализм», «Наглядность»...)
| { type: 'critic-verdict'; index: number; physicsOk: boolean; issues: string[] }
| { type: 'judge-verdict'; scores: RubricScores[]; candidateIndices: number[];
    winnerIndex: number; feedback: string }   // заменяет прежний 'scores'
| { type: 'refine-round'; round: number; before: RubricScores; after: RubricScores | null }
```
Старые типы событий (screenshot, warning, done, error) остаются. Прежнее событие
`scores` заменяется `judge-verdict` (все потребители обновляются в этой же работе).
`stage` меняет форму (status/at) — потребители обновляются.

### 4.2 UI (замена ProgressFeed)

Компоненты:
- `StageTimeline` — горизонтальные чипы этапов: ожидание (тусклый) / идёт (пульс) /
  готово (галочка + длительность в секундах из at-таймингов). Этап «Кандидаты»
  агрегирует generating+critiquing.
- `PlanCard` — после plan-ready: название, предмет, 2D/3D-бейдж, физика (свёрнуто до
  2 строк, разворачивается), чипы параметров-слайдеров, цели.
- `CandidateCard` (ряд карточек): заголовок «Кандидат N · <акцент>», статус-строка,
  скриншот (обновляется), вердикт критика (✓ физика ок / ⚠ N замечаний, список по
  клику), после суда — 4 мини-бара рубрики с числами; победитель — рамка-подсветка
  и 👑.
- `RefinePanel` — круги доводки: «Круг k: минимальная оценка 6.5 → 8.2», замечания судьи.
- Ошибочные/отменённые состояния: понятный баннер.
- Всё живёт и после перезагрузки (реплей событий воспроизводит те же карточки).

### 4.3 Изменения пайплайна

Только emit'ы: stages.ts испускает critic-verdict и передаёт styleHint в candidate-события;
run.ts испускает stage start/end пары, plan-ready, judge-verdict, refine-round.
Логика этапов не меняется.

## 5. Тестирование

- Юнит: jobs.ts (create/append/persist/subscribe/cancel/orphan-on-restart/диск-фолбэк);
  кламп candidates (route-хелпер `resolveCandidates(mode, requested?)`); события
  plan-ready/critic-verdict/judge-verdict/refine-round в run.test/stages.test (обновить
  существующие assertions); style hint по модулю 5.
- E2E: новый сценарий в generate-спеке или отдельный: старт генерации (fast, мок) →
  page.reload() посреди → прогресс восстановился → превью появилось → библиотека.
  Плюс сценарий отмены (кнопка «Отменить» → статус отменено, ничего не сохранено).
- Гейты прежние: npm test, tsc, build, test:e2e.

## 6. Вне рамок

Параллельные независимые генерации из нескольких вкладок (job один активный на клиенте);
persist изображений в job-файл; refine через jobs; миграция старых событий (jobs новые).
