# Demos + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 10 вшитых образцовых демо-симуляций с установкой в библиотеку + закрытие всех отложенных улучшений системы.

**Architecture:** Демки живут в `demos/<slug>/` (сырой HTML + meta.json), устанавливаются через `src/lib/demos.ts` (инжект runtime + thumbnail рендерером), доступны через `npm run seed` и `POST /api/demos/install` (+ кнопка в пустой библиотеке). Гейт качества — интеграционный тест: каждая демка обязана пройти headless-рендер (ok+animated+0 ошибок). Улучшения — точечные правки существующих модулей с тестами.

**Tech Stack:** без новых зависимостей. Vitest, Playwright, существующие модули.

**Spec:** docs/superpowers/specs/2026-07-08-demos-and-polish-design.md (нормативна; таблица демок — раздел 2.4, требования к демкам — 2.3).

## Global Constraints

- Все прежние Global Constraints плана 2026-07-07 действуют (CDN whitelist, sandbox, dataDir(), TS strict, русский UI).
- Гейты каждой задачи: `npm test`, `npx tsc --noEmit`; для UI-задач + `npm run build`.
- Демо-артефакты в `demos/` хранятся БЕЗ runtime-инжекта (инжект при установке) и БЕЗ маркера `showmehow-runtime`.
- Демка обязана проходить гейт-тест: `instrument(html)` → `renderArtifact` → `ok && animated && errors.length===0`.
- Идемпотентность установки — по `meta.demo` (slug).

## ОТСТУПЛЕНИЕ ОТ ПРАВИЛА «полный код в плане» (задачи 3-12)

Демо-артефакты — творческие HTML-файлы по 200-400 строк; их код НЕ включён в план.
Вместо него: точная содержательная спецификация каждой демки + объективный гейт
(интеграционный тест на реальном Chromium) + чек-лист 2.3 спеки. Имплементер обязан
визуально проверить скриншоты из renderArtifact перед коммитом.

---

### Task 1: Инфраструктура демок (demos.ts, seed, гейт-тест)

**Files:**
- Modify: `src/lib/types.ts` (поле `demo?: string` в SimulationMeta), `src/lib/storage.ts` (createSimulation принимает `demo?`), `package.json` (script `"seed": "tsx scripts/seed-demos.ts"`)
- Create: `src/lib/demos.ts`, `scripts/seed-demos.ts`, `tests/unit/demos.test.ts`, `tests/integration/demos.test.ts`, `demos/.gitkeep`

**Interfaces (Produces):**
```ts
// src/lib/demos.ts
export interface DemoEntry { slug: string; title: string; prompt: string; subject: string; tags: string[]; html: string }
export function demosRoot(): string          // path.join(process.cwd(), 'demos'); override env SHOWMEHOW_DEMOS_DIR (для тестов)
export function listBundledDemos(): DemoEntry[]  // читает demos/*/{meta.json,artifact.html}; папки без обоих файлов пропускает
export function installDemos(render?: RenderFn): Promise<{installed: string[]; skipped: string[]}>
// для каждой демки: если listSimulations() содержит meta.demo===slug → skipped;
// иначе createSimulation({...meta, demo: slug}, instrument(html)); thumbnail из render (screenshots[1]??[0]); render по умолчанию = renderArtifact
```

- [ ] **Step 1: Failing unit tests** — `tests/unit/demos.test.ts`: tmp SHOWMEHOW_DATA_DIR + tmp SHOWMEHOW_DEMOS_DIR c фикстурной демкой (простая анимация canvas, как tests/fixtures/ok.html + meta.json); проверки: listBundledDemos находит фикстуру; installDemos с фейковым render (возвращает ok-отчёт с 1 скриншотом) устанавливает симуляцию (meta.demo===slug, артефакт содержит `showmehow-runtime`, thumbnail сохранён); повторный installDemos → skipped, listSimulations().length не растёт; папка без meta.json пропускается.
- [ ] **Step 2: Run — verify fail**
- [ ] **Step 3: Implement** types.ts (+`demo?: string`), storage.createSimulation (input добавляет `demo?: string` — просто попадает в meta через spread, тип input расширить), src/lib/demos.ts, scripts/seed-demos.ts (вызывает installDemos() с реальным renderArtifact, печатает installed/skipped, closeBrowser() в конце), package.json script.
- [ ] **Step 4: Integration gate test** — `tests/integration/demos.test.ts` (vitest, включить путь `tests/integration/**` в vitest.config.ts): читает listBundledDemos() из НАСТОЯЩЕЙ папки demos/; если демок нет — `it.skip`; для каждой: `renderArtifact(instrument(html), {shotTimes:[300,1500]})` → expect ok, animated, errors []. Таймаут теста 60с/демка. afterAll closeBrowser.
- [ ] **Step 5: npm test + tsc; Step 6: Commit** `feat: bundled demos infrastructure with seed and quality gate`

---

### Task 2: POST /api/demos/install + кнопка в библиотеке

**Files:**
- Create: `src/app/api/demos/route.ts` (POST — installDemos(), ответ `{installed, skipped}`; ошибки → 500 c {error})
- Modify: `src/app/library/page.tsx` — когда список пуст И нет ни одной симуляции с `demo`, вместо «Пока пусто...» блок: текст + кнопка «Установить 10 примеров»; клик → POST /api/demos → load(); во время установки кнопка disabled с текстом «Устанавливаю…» (установка рендерит thumbnails — до ~минуты)
- Test: `tests/unit/demos-api.test.ts` — прямой вызов POST-хэндлера с tmp dirs + фикстурной демкой и фейковым рендером? Рендер внутри роута реальный — для юнит-теста установить SHOWMEHOW_DEMOS_DIR на фикстуру и замокать renderArtifact нельзя без DI → installDemos принимает render?; роут вызывает installDemos() без аргумента. Тест роута: подменить demosRoot через env на пустую папку → `{installed: [], skipped: []}` (без запуска браузера). Полный путь проверяет e2e (Task 14).

- [ ] Steps: failing test → implement → `npm test && npx tsc --noEmit && npm run build` → commit `feat: demo install API and library button`

---

### Tasks 3-12: Десять демок (по одной на задачу)

Общее для каждой задачи N (slug из таблицы спеки 2.4):
- **Files:** Create `demos/<slug>/artifact.html`, `demos/<slug>/meta.json`
- **meta.json:** `{"title": "<из таблицы>", "prompt": "<реалистичный промпт преподавателя>", "subject": "<предмет>", "tags": [3-5 тегов]}`
- **Требования:** спека 2.3 (SimUI, dt-цикл, reset, русские подписи, KaTeX где уместно, ≤2000 частиц) + содержательные требования ниже.
- **Гейт:** `npm test -- tests/integration/demos.test.ts` зелёный; имплементер сохраняет скриншоты renderArtifact во временную папку и ОПИСЫВАЕТ в отчёте, что на них видно (сцена не пустая, контролы на месте).
- **Commit:** `feat(demo): <slug>`

Содержательные требования:

- **Task 3 — diffusion:** комната (вид сверху), источник духов в углу; 600-1200 частиц, случайные блуждания с шагом ∝ √T; полупрозрачный след концентрации (fade). Слайдеры: температура 0-40°C, молярная масса 50-300 г/моль (тяжелее — медленнее, v ∝ 1/√M). Формула ⟨x²⟩=2Dt (KaTeX). Reset очищает частицы к источнику.
- **Task 4 — convection:** батарея слева-снизу (горячая, красная), окно справа-сверху (холодное, синее при «открытом»); стационарное поле скоростей (аналитическая циркуляционная ячейка, без CFD), 300-600 трассеров, окрашенных температурой (сине-красный градиент); слайдеры: мощность батареи (скорость циркуляции), открытость окна (усиливает нисходящий поток). Стрелки поля опционально.
- **Task 5 — engine:** three.js: цилиндр в разрезе (полупрозрачный), поршень, шатун, коленвал, 2 клапана, свеча; корректная кинематика кривошипа; 4 такта подписаны по-русски, текущий такт подсвечен (впуск — синяя струя частиц, рабочий ход — вспышка); слайдер оборотов 60-3000 об/мин; OrbitControls НЕ нужен — камера фиксирована с лёгким автоповоротом; preserveDrawingBuffer:true.
- **Task 6 — pendulum:** маятник (уравнение θ'' = -(g/L)sinθ - bθ', интегрирование RK4 или полунеявный Эйлер с малым dt); слайдеры: длина 0.5-3 м, начальная амплитуда 5-90°, затухание 0-0.5; chart.js — линии Eк, Eп, Eполн по времени (скользящее окно 20с); период T=2π√(L/g) в KaTeX с текущим числом.
- **Task 7 — interference:** поле амплитуд от 2 точечных источников на canvas (ImageData, разрешение ≤ 320×240, масштабировать на весь экран), анимация фазы; цветовая карта (тёмный-акцент); слайдеры: частота, расстояние между источниками; максимумы/минимумы явно видны; формула Δd = mλ.
- **Task 8 — refraction:** луч из воды в воздух (или слайдер n₁ 1.0-2.0); углы отрисованы дугами с подписями θ₁/θ₂; закон Снеллиуса KaTeX; при θ > θкрит — полное внутреннее отражение (луч отражается, подпись «ПВО»); частичное отражение всегда (бледный луч); слайдер угла падения 0-89°.
- **Task 9 — ideal-gas:** сосуд с подвижным поршнем (слайдер объёма), 300-500 частиц, упругие столкновения со стенками (между собой не обязательно); скорость ∝ √T (слайдер температуры); давление считается из импульса ударов о стенки (скользящее среднее) и показывается вместе с расчётным P=nRT/V; PV=nRT KaTeX; поршень двигается плавно.
- **Task 10 — kepler:** планета на эллипсе (слайдер эксцентриситета 0-0.8), интегрирование гравитации (полунеявный Эйлер, GM подобрать); след орбиты; закон площадей: заметаемый сектор за фиксированный Δt подсвечивается и его площадь показывается числом (≈константа); скорость у перигелия видимо выше; 2-й закон Кеплера KaTeX.
- **Task 11 — efield:** два заряда (слайдеры -5..+5 мкКл каждый); силовые линии интегрированы из точек вокруг зарядов (RK2, ~16-24 линии с заряда, обрываются у зарядов/границ); цвет по знаку; пробный заряд следует за курсором, вектор силы на нём стрелкой; закон Кулона KaTeX; перерисовка линий при изменении слайдеров (можно не каждый кадр).
- **Task 12 — osmosis:** два отсека, мембрана с порами посередине; частицы воды (маленькие, проходят) и растворённого вещества (крупные, не проходят); слайдер концентрации справа; чистый поток воды в сторону раствора → уровни жидкости видимо меняются (полоски уровня); подписи «вода»/«раствор»; осмотическое давление π=cRT KaTeX.

---

### Task 13: Качество пайплайна (best-so-far, CDN-скан, few-shot)

**Files:** Modify `src/lib/pipeline/stages.ts`, `src/lib/pipeline/prompts.ts`, `src/lib/artifact.ts`; Test `tests/unit/stages.test.ts`, `tests/unit/artifact.test.ts`, `tests/unit/prompts.test.ts`

- [ ] **best-so-far в verifyCandidate:** хранить `best = {html, report}` — лучший по рангу (ok+animated > ok+static > broken); если после попытки починки ранг упал — в конце вернуть best, а не последний. Тест: render последовательно ok/static → broken → broken (фиксы ломают) ⇒ candidate alive, html = версия до фиксов, critic уведомлён о статичности.
- [ ] **CDN-скан:** в `src/lib/artifact.ts` добавить `export function findForbiddenUrls(html: string, allowed: string[]): string[]` — все абсолютные `http(s)://` URL из `src=`/`href=` атрибутов, не начинающиеся ни с одного allowed-URL-префикса (сравнивать по origin+path префиксу; data: и относительные игнорировать). В verifyCandidate после каждого рендера: `findForbiddenUrls(current, Object.values(CDN_WHITELIST))` → непустой список добавляется к errors и идёт в автопочинку (в общий 2-attempt цикл). Тесты: чистый html → []; левый CDN → найден; whitelist-URL → не найден; интеграция в verifyCandidate (нарушение → вызов фиксера с текстом «Запрещённые внешние ресурсы»).
- [ ] **Few-shot скелет:** в prompts.ts константа `EXAMPLE_SKELETON` (~60 строк: doctype→head(katex по необходимости)→canvas на всё окно→константы физики→state+reset()→SimUI.title/slider/playPause→dt-цикл с physics(dt)/draw()) и включить в `generatorSystem` под заголовком «Каркас качественной симуляции (следуй структуре)». Тест: generatorSystem содержит маркер каркаса.
- [ ] Гейты + commit `feat: pipeline quality - best-so-far, CDN scan, few-shot skeleton`

### Task 14: Провайдер retry-классификация + renderer self-heal

**Files:** Modify `src/lib/provider.ts`, `src/lib/renderer.ts`; Test `tests/unit/provider.test.ts`, `tests/unit/renderer.test.ts`

- [ ] provider: `function isRetryable(e: unknown): boolean` — если у ошибки есть числовой `status` и он ∈ {400,401,403,404,422} → false; иначе true (429, 5xx, сеть). В цикле chatWithClient: не retryable → бросить сразу. Тесты: status 401 → 1 вызов; status 429 → 3 вызова; ошибка без status → 3 вызова.
- [ ] renderer: после успешного launch: `browser.on('disconnected', () => { browserPromise = null; })`. Тест через `__setLauncherForTests`: фейковый Browser-объект с EventEmitter-подобным on/newPage; эмулировать disconnected → следующий renderArtifact вызывает launcher снова.
- [ ] Гейты + commit `fix: no retry on 4xx client errors; renderer self-heals on browser death`

### Task 15: UX-батч

**Files:** Modify `src/components/PreviewFrame.tsx`, `src/components/Workbench.tsx`, `src/components/ProgressFeed.tsx`, `src/app/library/page.tsx`, `src/app/api/simulations/[id]/history/route.ts`, `src/lib/pipeline/run.ts`, `src/app/globals.css`

- [ ] **sim-error оверлей:** PreviewFrame — useEffect-слушатель `message`; `e.data?.type==='sim-error'` → плашка снизу превью («Ошибка в симуляции: <текст>», кнопка ×, максимум 3 последних); сбрасывается при смене html.
- [ ] **История:** в Workbench подписи версий — `new Date(parsed).toLocaleString('ru')` (парсить имя файла `2026-07-07T03-49-12-345Z.html` обратно в ISO: заменить `-` на `:` в позиции времени, регуляркой `T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z` → `T$1:$2:$3.$4Z`; суффиксы `-N` до `.html` показывать « (N)»); POST history роут после restoreVersion обновляет thumbnail (renderArtifact + saveThumbnail; при ошибке рендера thumbnail не трогать, restore всё равно успешен).
- [ ] **SSE-strand guard:** consumeSSE — если цикл чтения завершился, а done/error не пришли → setError('Поток прервался, попробуйте ещё раз'), phase 'error'.
- [ ] **Индексы кандидатов:** run.ts — при формировании событий `scores` мапить индексы alive-массива в исходные индексы кандидатов (сохранить `origIndex` при verifyCandidate-обходе); тип события scores расширить полем `candidateIndices: number[]`; ProgressFeed показывает «Кандидат {candidateIndices[i]+1}». Юнит-тест: 3 кандидата, второй умер → scores.candidateIndices == [0,2].
- [ ] **Thumbnail placeholder:** карточка — контейнер с фиксированным aspect-ratio и фоном; img поверх, при onError скрывается только img (фон остаётся).
- [ ] Гейты (+ build) + commit `feat: UX polish - artifact error overlay, history dates, SSE guard, candidate indices`

### Task 16: API/код-батч

**Files:** Modify `src/app/api/simulations/[id]/export/route.ts`, `.../thumbnail/route.ts`, `.../[id]/route.ts` (DELETE), `src/app/api/settings/route.ts`, `src/lib/artifact.ts`, `src/lib/settings.ts`, `src/app/globals.css`, `evals/run.ts`; Tests: `tests/unit/api.test.ts`, `tests/unit/artifact.test.ts`, `tests/unit/settings.test.ts`, `tests/unit/storage.test.ts`, `tests/unit/stages.test.ts`

- [ ] export/thumbnail/DELETE: try/catch — `invalid path segment` → 400, ENOENT/прочее «не найдено» → 404 (DELETE неизвестного валидного id остаётся идемпотентным 200). Тесты на все три роута с `../evil` и незнакомым uuid.
- [ ] instrument(): нет `<head>` → вставка после `<html...>`; нет и `<html>` → после doctype; нет и doctype → prepend. Тесты на все ветки (runtime не раньше doctype).
- [ ] loadSettings: try/catch JSON.parse + валидация формы (providers Array, qualityMode ∈ enum, activeProviderId string|null; невалидно → structuredClone(DEFAULTS) + console.warn). Тест: битый JSON → дефолты.
- [ ] PUT settings: маскированный ключ с id, отсутствующим в текущих настройках → 400 `{error}`. Тест.
- [ ] evals/run.ts: `const today = new Date().toISOString().slice(0,10)` один раз.
- [ ] CSS: `.provider` → `.settings .provider`, `.radio` → `.settings .radio` (и в JSX ничего менять не надо — классы те же).
- [ ] Детерминированный тест коллизии: vi.useFakeTimers + vi.setSystemTime, 3 updateArtifact при замороженном времени → history 3 файла с суффиксами. Тест ветки fixer-throws: genChat бросает при вызове фиксера → candidate failed, verifyCandidate не бросает.
- [ ] Гейты (+ build) + commit `fix: API status codes, instrument edge cases, settings validation, test hardening`

### Task 17: E2E установки демок + README + финальная проверка

**Files:** Modify `e2e/generate.spec.ts` (или новый `e2e/demos.spec.ts`), `README.md`, `docs/superpowers/2026-07-07-followups.md`

- [ ] Новый e2e-тест (тот же webServer): пустая библиотека → виден блок с кнопкой «Установить 10 примеров» → клик → (таймаут 180с — рендер 10 thumbnails) → 10 карточек видны, названия из таблицы спеки присутствуют (проверить 3 штуки выборочно). ВАЖНО: e2e data dir чистится в beforeAll — установка идёт с нуля.
- [ ] README: раздел «Демо-библиотека» (`npm run seed` или кнопка) + обновить счётчик команд.
- [ ] followups doc: отметить всё закрытое `[x]`.
- [ ] Полные гейты: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e`.
- [ ] Commit `feat: demo install e2e, docs`

## Порядок

1 → 2 → {3..12 последовательно} → 13 → 14 → 15 → 16 → 17.

## Self-Review отметки

- Спека 2.1-2.4 покрыта задачами 1-12, 17; спека 3.1 → задачи 13-14; 3.2 → 15; 3.3 → 16; тестирование (4) → гейты в каждой задаче + 17.
- Отступление от «полного кода» для демок задекларировано и компенсировано объективным гейтом.
- Тип события `scores` меняется (candidateIndices) — единственный потребитель ProgressFeed обновляется в той же задаче 15; run.test.ts assertions обновить там же.
