# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Each implementer MUST also load `frontend-design:frontend-design` for aesthetic guidance before writing UI. Steps use checkbox (`- [ ]`).

**Goal:** Светлая образовательная дизайн-система, мобильная адаптация (вкладки Создать/Превью + адаптив всех экранов), мобильный SimUI, анимированный прогресс с пошаговыми описаниями. Только представление.

**Spec (нормативна):** docs/superpowers/specs/2026-07-20-ui-redesign-design.md

**Tech Stack:** без новых зависимостей. CSS в `src/app/globals.css` (токены + классы), React-компоненты, CSS-анимации. Vitest для чисто-функциональных модулей (stepCopy, deriveProgress).

## Global Constraints

- Логику пайплайна/API/jobs/storage НЕ трогать — только представление (CSS/JSX/микротексты).
- Русский UI. Светлая тема (тёмная вне scope).
- Тач-цели интерактива ≥44px; фокус-кольцо на клавиатурной навигации (`:focus-visible`).
- Все анимации под `@media (prefers-reduced-motion: reduce)` → отключаются.
- Гейты каждой задачи: `npx tsc --noEmit && npm run build`; где есть чистые функции — `npm test`.
- Визуальная проверка обязательна: скриншоты в headless Chromium в 2 вьюпортах
  (desktop 1280×800, mobile 390×844) для затронутых экранов; имплементер СМОТРИТ
  скриншоты и описывает их в отчёте.
- CSS правится в одном `globals.css` — задачи идут СТРОГО последовательно (T1→T5),
  каждая аппендит/меняет свою секцию, чтобы не конфликтовать.
- Существующие юнит/интеграционные тесты (демо-гейт и пр.) должны оставаться зелёными.

### Как делать скриншоты (для всех UI-задач)
Запустить dev (или `next build && next start`) на свободном порту, затем throwaway tsx-скрипт
через playwright: `chromium.launch()` → `newPage({viewport})` → `goto(url, {waitUntil:'networkidle'})`
→ `screenshot(path)` в scratchpad, для 2 вьюпортов. Открыть PNG и оценить. Kill сервер.

---

### T1: Дизайн-система + шапка (фундамент)

**Files:** Modify `src/app/globals.css` (полный пересмотр: токены + базовые классы),
`src/app/layout.tsx`; Create `src/components/NavLinks.tsx` (client, active по `usePathname`).

- [ ] Загрузить frontend-design skill.
- [ ] `globals.css`: заменить прежние тёмные токены на светлую систему из спеки §2
  (палитра, тени, радиусы, типографика). Определить базовые классы:
  `.btn`+варианты (min-height 44px, hover/active/disabled/focus-visible),
  `.input/.select/.field`, `.card`, `.chip`, `.badge`, `.icon-btn`, `.topnav`/шапка.
  ВНИМАНИЕ: не удалять целиком — существующие классы (`.workbench`,`.chat-pane`,
  `.preview-*`,`.library`,`.cards`,`.card`,`.settings`,`.provider`,`.composer`,
  `.progress-*`, прогресс-компоненты, `.empty-library`) должны продолжить работать —
  их переоформить под новые токены (значения цветов/теней/радиусов), не ломая разметку.
- [ ] `NavLinks.tsx`: клиентский компонент, ссылки Создать(`/`)/Библиотека(`/library`)/
  Настройки(`/settings`), активная по `usePathname()` получает класс `active`.
- [ ] `layout.tsx`: шапка со светлым фоном, иконка-лого (эмодзи/inline-svg) + бренд,
  `<NavLinks/>`. Адаптив: на узком — компактно, ссылки в горизонтальном скролле.
- [ ] Скриншоты desktop+mobile главной (пустой) — шапка светлая, читаемая. Отчёт.
- [ ] Гейты: `npx tsc --noEmit && npm run build`. Commit `feat(ui): light design system and header`.

---

### T2: Workbench — мобильные вкладки + десктоп-полировка

**Files:** Modify `src/components/Workbench.tsx`, `src/components/PreviewFrame.tsx`,
`src/app/globals.css` (секция workbench/composer/tabs)

- [ ] Загрузить frontend-design skill.
- [ ] Мобильные вкладки: клиентское состояние `activeTab: 'create'|'preview'`
  (по умолчанию 'create'). На <900px показывать сегмент-переключатель сверху и только
  активную колонку; на ≥900px — обе колонки как сейчас (переключатель скрыт). CSS-контроль
  видимости (`@media`) + класс на корне по activeTab. По событию `done` в consumeJobStream —
  `setActiveTab('preview')`.
- [ ] Композер: sticky снизу на мобиле, крупные select'ы (Режим/Кандидаты — уже с
  aria-label), primary-кнопка «Создать» крупная. Кнопки Отменить/действия — тач-френдли.
- [ ] Превью-панель: iframe `width:100%`, высота адаптивная; на мобиле во вкладке
  «Превью» — почти весь экран; действия (презентация/экспорт/история) компактно.
- [ ] Если `phase==='generating'` и вкладка 'preview' — маленький бейдж «идёт
  генерация → к процессу» переключает на 'create'.
- [ ] Скриншоты: desktop (раскладка 2 колонки), mobile обе вкладки (Создать с
  композером; Превью с открытой демкой через `?id=`). Отчёт.
- [ ] Гейты + `feat(ui): responsive workbench with mobile tabs`.

---

### T3: Библиотека, Настройки, Презентация — адаптив

**Files:** Modify `src/app/library/page.tsx`, `src/app/settings/page.tsx`,
`src/app/present/[id]/page.tsx`, `src/app/globals.css`

- [ ] Загрузить frontend-design skill.
- [ ] Библиотека: сетка адаптивная (auto-fill minmax 260 → 1 колонка на телефоне),
  светлые карточки, поиск на всю ширину, действия иконками; пустое состояние — заметная
  primary-кнопка «Установить 10 примеров». Сохранить существующую логику fetch/install.
- [ ] Настройки: один столбец, `.card` провайдеры, `.field/.input`, адаптив (поля 100%
  на телефоне); кнопки крупные.
- [ ] Презентация: добавить полупрозрачную кнопку «← Выйти» (link `/library`) в углу
  поверх iframe, не перекрывающую контент; iframe остаётся фуллскрин.
- [ ] Скриншоты desktop+mobile: библиотека (с демками), настройки, презентация. Отчёт.
- [ ] Гейты + `feat(ui): responsive library, settings, presentation`.

---

### T4: Анимированный прогресс + пошаговые описания

**Files:** Create `src/components/progress/stepCopy.ts`, `tests/unit/step-copy.test.ts`;
Modify `src/components/progress/{StageTimeline,CandidateCard,PlanCard,RefinePanel,ProgressView}.tsx`,
`src/components/progress/deriveProgress.ts` (только если нужно производное «описание»),
`src/app/globals.css` (секция progress-анимаций)

- [ ] Загрузить frontend-design skill.
- [ ] `stepCopy.ts`: чистые функции →
  `stageCopy(stage: PipelineStage): string`,
  `candidateCopy(status): string`,
  `refineCopy(round: number): string`,
  плюс `STAGE_TITLES` (короткие подписи чипов). Тексты — из спеки §6 (русские).
- [ ] Тест `step-copy.test.ts`: каждая функция для всех значений возвращает непустую
  строку; известные соответствия (например `stageCopy('planning')` содержит «модель»
  или заданную фразу — по одному якорю на функцию, не хрупко).
- [ ] Анимации в `globals.css` (все под reduced-motion guard):
  `@keyframes pulse-active`, `pop-in` (галочка/корона), `fade-slide-in` (карточки),
  `shimmer` (бегущая полоса на активной зоне); тонкая полоса-прогресс этапов.
- [ ] Компоненты: StageTimeline — пульс активного, pop галочки + время, полоса-прогресс;
  CandidateCard — fade-slide появление, скриншот fade-in, бары рубрики с transition по
  ширине, корона pop, статус-строка = `candidateCopy(status)`; PlanCard/RefinePanel —
  fade-in + микротексты. Данные только из events (реплей воспроизводит анимации заново —
  это ок, при перезагрузке они просто проиграются один раз).
- [ ] Скриншоты живого прогресса (мок-провайдер, standard-режим — 2 кандидата — нагляднее;
  снять 2-3 момента) desktop+mobile; убедиться что бары/карточки/чипы читаемы. Отчёт.
- [ ] Гейты (`npm test` тоже) + `feat(ui): animated progress with step descriptions`.

---

### T5: Мобильный SimUI (runtime)

**Files:** Modify `src/lib/runtime.ts` (UIKIT_CSS, UIKIT_JS); Test: артефакт-гейт демок
не ломается (`tests/integration/demos.test.ts`), + возможно юнит на idempotent instrument.

- [ ] Загрузить frontend-design skill.
- [ ] UIKIT_CSS: на `@media (max-width:640px)` панель `.sim-panel` превращается в
  свёрнутую таблетку-кнопку «⚙ Параметры» внизу по центру; развёрнутое состояние —
  bottom-sheet снизу с теми же контролами; на широком — прежнее позиционирование
  справа-сверху. Слайдеры/кнопки крупнее (тач).
- [ ] UIKIT_JS: логика сворачивания (класс на панели, кнопка-переключатель); JS-API
  `SimUI.title/slider/playPause` НЕ меняется — только внутренняя вёрстка/поведение
  панели. ES5-совместимость (крутится сырьём в артефакте).
- [ ] Гейт демок: `npm test -- tests/integration/demos.test.ts` (демки в demos/ хранят
  СТАРЫЙ инжект — они не переинжектятся; но instrument() новых работает). Проверить,
  что новый instrument+render даёт ok+animated (взять demos/pendulum/artifact.html,
  прогнать instrument→renderArtifact в узком и широком вьюпорте, скриншоты обоих:
  на узком видна свёрнутая таблетка, тап разворачивает). Отчёт со скриншотами.
- [ ] Гейты + `feat(ui): mobile-friendly SimUI panel`.

---

### T6: Финальная проверка + деплой на сервер

**Files:** Modify `README.md` (короткая заметка про адаптивность/мобайл — опц.)

- [ ] Полные гейты: `npm test && npx tsc --noEmit && npm run build`.
- [ ] Сводные скриншоты desktop+mobile всех экранов (главная пустая, генерация в
  процессе, превью, библиотека, настройки, мобильный SimUI) — единый отчёт-контролька.
- [ ] Деплой на сервер (тем же способом, что уже работает):
  rsync исходников → `~/showmehow` (исключая node_modules/.next/.git/data/.superpowers),
  на сервере `npm ci` (если package-lock не менялся — можно пропустить) → `npm run build`
  → перезапуск процесса на порту 3100 (`fuser -k 3100/tcp; nohup npm run start -- -p 3100`).
  **НЕ трогать** `data/settings.json` на сервере (там ключ MaaS) и ufw/Caddy.
  Демки ПЕРЕустановить, чтобы подхватили новый мобильный SimUI: удалить
  `data/simulations`, `POST /api/demos`.
- [ ] Внешняя проверка `http://95.141.135.244:3100/` → 200; библиотека 10 демок.
- [ ] Commit `chore(ui): docs; redeploy`.

## Порядок
T1 → T2 → T3 → T4 → T5 → T6 (строго последовательно — общий globals.css).

## Self-Review
- Спека §2→T1, §3→T1, §4→T2, §5→T3, §6→T4, §7→T5, §8→скриншоты в каждой + T6.
- Логика не трогается ни в одной задаче (проверять в ревью: диффы только по CSS/JSX/
  микротексты/runtime-вёрстка).
- Общий CSS-файл → последовательность обязательна; каждая задача аппендит свою секцию.
