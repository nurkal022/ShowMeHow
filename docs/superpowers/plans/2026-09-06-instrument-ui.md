# Интерфейс «научный прибор» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать интерфейсу характер научного прибора — тёмная тема с миллиметровой сеткой и моноширинными числами — и пересобрать четыре экрана так, чтобы на них было что делать.

**Architecture:** Сначала меняются значения токенов в `:root` (имена сохраняются, поэтому ни одно существующее правило не ломается), затем дублирующие объявления кнопок и полей сводятся к единственным `.btn`/`.input`/`.card`, и только после этого пересобираются экраны. Логика нигде не трогается: событийная модель прогресса, роуты и хранилище остаются как есть; вся новая логика выносится в чистые функции и покрывается юнит-тестами, потому что библиотеки для рендера React-компонентов в проекте нет и вводить её не будем.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, обычный CSS с переменными, vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-instrument-ui-design.md`

## Global Constraints

- **Никаких новых зависимостей.** Ни CSS-фреймворков, ни библиотек компонентов, ни testing-library.
- **Не запускать `npm run test:e2e`** — набор красный по причинам, предшествующим этой работе.
- Комментарии по-русски, идентификаторы по-английски, строки для пользователя по-русски целыми предложениями.
- Код внутри шаблонных строк рантайма (`src/lib/runtime/*`) и в `demos/*/artifact.html` — строго ES5. Эта работа их **не трогает вовсе**.
- **Светлой темы нет.** Переключателя тем не заводить.
- **Логика не меняется.** `deriveProgress`, роуты, хранилище, пайплайн — только оформление и раскладка.
- Существующие тесты обязаны остаться зелёными: `npx vitest run`, `npx tsc --noEmit`, `npm run build`.
- Интеграционные тесты с базой: `SHOWMEHOW_TEST_DATABASE_URL=postgres://showmehow:showmehow@localhost:5434/showmehow npx vitest run tests/integration` (контейнер `showmehow-pg` уже поднят; порты 5432 и 5433 заняты чужими проектами — не трогать).
- Каждый коммит заканчивается строкой:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: Тёмные токены, сетка и моноширинные числа

**Files:**
- Modify: `src/app/globals.css:1-49`

**Interfaces:**
- Consumes: ничего.
- Produces: переменные `--bg --surface --surface-2 --border --text --muted --accent --accent-hover --accent-soft --success --danger --danger-soft --warn --warn-soft --grid-line --mono --shadow-sm --shadow-md`; служебный класс `.num` (моноширинные табличные цифры).

- [ ] **Step 1: Заменить значения токенов**

В `src/app/globals.css`, в блоке `:root`, заменить светлый набор на тёмный. Имена переменных **не менять** — от них зависят все существующие правила.

```css
:root {
  /* --- Токены тёмной темы «научный прибор» --- */
  --bg: #0d1117;
  --surface: #151b24;
  --surface-2: #1c232e;
  --border: #28313d;
  --text: #e6edf3;
  --muted: #8b98a9;
  --accent: #22d3ee;
  --accent-hover: #67e8f9;
  --accent-soft: #12313a;
  --success: #3fb950;
  --danger: #f85149;
  --danger-soft: #2d1618;
  --warn: #d29922;
  --warn-soft: #2b2113;

  /* Линия фоновой миллиметровки. Она обязана быть на грани различимости:
     чуть ярче — и текст читается поверх шума. */
  --grid-line: rgba(120, 140, 170, .05);

  /* Всё числовое на экране набирается этим шрифтом — это второй по силе
     носитель характера после сетки. */
  --mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;

  /* На тёмном фоне тень почти не видна, объём создаёт светлая внутренняя
     граница сверху. */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, .4), inset 0 1px 0 rgba(255, 255, 255, .03);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, .45), inset 0 1px 0 rgba(255, 255, 255, .04);

  --r-sm: 8px;
  --r: 12px;
  --r-lg: 16px;

  --panel: var(--surface);
  --radius: var(--r-sm);

  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  color-scheme: dark;
}
```

- [ ] **Step 2: Положить сетку на фон**

Заменить правило `body`:

```css
body {
  margin: 0;
  color: var(--text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  /* Миллиметровка: два градиента поверх сплошного фона, шаг 32px. */
  background-color: var(--bg);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 32px 32px;
}
```

- [ ] **Step 3: Добавить класс для чисел**

Сразу после правила `a { color: var(--accent); }` добавить:

```css
/* Числовые значения: моноширинный шрифт и табличные цифры, чтобы столбцы
   не «прыгали» при изменении значения. */
.num {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  font-size: .95em;
}

/* Технические подписи панелей: капитель прибора. */
.label {
  font-family: var(--mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--muted);
}
```

- [ ] **Step 4: Поправить жёстко заданные цвета, ставшие нечитаемыми**

В файле есть цвета, вписанные мимо токенов, — на тёмном фоне они больше не работают. Заменить:

- `.sim-error-item` и `.sim-error-item button`: `color: #9a2d31` → `color: var(--danger)`.
- `.error-box`: `color: #9a2d31` → `color: var(--danger)`.
- `.quota-line.quota-exhausted`: `color: #9a2d31` → `color: var(--danger)`.
- `.warn-banner`: `color: #8a5417` → `color: var(--warn)`.
- `.stage-chip.stage-done`: `color: #0f9d58; border-color: #cdeedd; background: #eafbf1` → `color: var(--success); border-color: #1c3b26; background: #10261a`.
- `.badge-2d`: `color: #2a6ebb; background: #e9f2fd; border-color: #cfe2f7` → `color: #58a6ff; background: #0d2440; border-color: #1c3f66`.
- `.badge-3d`: `color: #b3611a; background: #fdf1e4; border-color: #f5dcb8` → `color: #e3a047; background: #2b2113; border-color: #4a3a1c`.
- `.input:hover, .select:hover`: `border-color: #c7cedb` → `border-color: #3a4655`.
- `.stage-progressbar-fill` и `.stage-chip.stage-active`: во втором цвете градиента `#7c74f0` → `#67e8f9`, `#e4e6fd` → `#1a4652`.
- `.cand-probes.ok` fallback `#2e7d4f` → `var(--success)`, `.cand-probes.warn` fallback `#a35b00` → `var(--warn)`.
- `.present-exit`: `background: rgba(22, 28, 38, .55)` → `rgba(13, 17, 23, .72)`, hover → `rgba(13, 17, 23, .9)`.
- `.composer` в медиазапросе: `box-shadow: 0 -6px 12px -8px rgba(22, 28, 38, .18)` → `rgba(0, 0, 0, .5)`.

- [ ] **Step 5: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: зелёные. Тесты этой правки не касаются — меняется только CSS.

```bash
git add -A
git commit -m "feat(ui): dark instrument palette, graph-paper grid and monospaced numerals

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Один набор примитивов

**Files:**
- Modify: `src/app/globals.css`, `src/components/Workbench.tsx`, `src/components/AuthForm.tsx`, `src/app/library/page.tsx`, `src/components/NavLinks.tsx`

**Interfaces:**
- Consumes: токены Task 1.
- Produces: единственные объявления `.btn` (+ модификаторы `.btn-primary .btn-secondary .btn-ghost .btn-danger`), `.input`, `.card`. Никакой другой селектор в проекте не задаёт `background`+`border`+`padding` для `button`, `input`, `textarea`, `select`.

- [ ] **Step 1: Удалить дублирующие объявления в CSS**

В `src/app/globals.css` удалить полностью:

- правила `.composer textarea, .composer select, .composer button { … }`, `.composer button { … }`, `.composer button:hover`, `.composer button.primary`, `.composer button.primary:hover`, `.composer button:disabled` — от `.composer` остаётся только раскладка (`margin-top: auto; display: flex; flex-direction: column; gap: 8px;`) и правило фокуса для `textarea`;
- правила `.auth-card input`, `.auth-card input:focus`, `.auth-card button.primary`, `.auth-card button.primary:hover`, `.auth-card button.primary:disabled`;
- правила `.empty-library button`, `.empty-library button:hover`, `.empty-library button:disabled`;
- правило `.library-head input` и `.library-head input:focus` (остаётся только `width: 260px` внутри `.library-head .input`).

- [ ] **Step 2: Перевести компоненты на общие классы**

- `src/components/Workbench.tsx`: `<button className="primary" …>` → `className="btn btn-primary"`; кнопка выбора картинки и остальные кнопки композера → `className="btn"`; `<select aria-label="Режим качества">` → `className="select"`; `<textarea>` → `className="input"`.
- `src/components/AuthForm.tsx`: `<input …>` → `className="input"`; `<button className="primary">` → `className="btn btn-primary"`.
- `src/app/library/page.tsx`: поле поиска → `className="input"`; кнопка установки примеров → `className="btn btn-primary"`; кнопка удаления в карточке → `className="btn btn-ghost btn-danger"`.
- `src/components/NavLinks.tsx`: кнопка «Выйти» остаётся `link-btn` — это ссылка по смыслу, не кнопка.

Проверить глазами каждый экран после правки: цель — чтобы визуально ничего не потерялось, а объявление осталось одно.

- [ ] **Step 3: Убедиться, что дублей не осталось**

Run: `grep -n "button" src/app/globals.css`
Expected: `button` встречается только в `.btn*`, `.icon-btn*`, `.link-btn*`, `.mobile-tabs button`, `.card-actions button`, `.history-dropdown li button`, `.sim-error-item button` — то есть в описании самих примитивов и в узких контекстных правилах, но нигде не задаётся заново полный набор «фон + рамка + отступы + радиус» для кнопки.

- [ ] **Step 4: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "refactor(ui): collapse duplicated button and input styles into the shared primitives

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Цвет предмета

**Files:**
- Create: `src/lib/subject-color.ts`, `tests/unit/subject-color.test.ts`
- Modify: `src/app/library/page.tsx`, `src/components/progress/PlanCard.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: ничего.
- Produces:

```ts
export interface SubjectColor { fg: string; bg: string; border: string }
export function subjectColor(subject: string): SubjectColor;
```

- [ ] **Step 1: Написать падающий тест**

`tests/unit/subject-color.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { subjectColor } from '@/lib/subject-color';

describe('цвет предмета', () => {
  it('один и тот же предмет всегда даёт один цвет', () => {
    expect(subjectColor('Механика')).toEqual(subjectColor('Механика'));
  });

  it('разные предметы расходятся по палитре', () => {
    const subjects = ['Механика', 'Оптика', 'Термодинамика', 'Электричество',
      'Молекулярная физика', 'Астрономия'];
    const distinct = new Set(subjects.map((s) => subjectColor(s).fg));
    // Палитра из шести цветов; шесть разных предметов обязаны занять больше одного.
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('пустая строка не роняет функцию', () => {
    const c = subjectColor('');
    expect(c.fg).toMatch(/^#/);
    expect(c.bg).toMatch(/^#/);
    expect(c.border).toMatch(/^#/);
  });

  it('регистр и пробелы по краям не меняют цвет', () => {
    expect(subjectColor('  оптика ')).toEqual(subjectColor('Оптика'));
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/subject-color.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать**

`src/lib/subject-color.ts`:

```ts
export interface SubjectColor {
  fg: string;
  bg: string;
  border: string;
}

/**
 * Палитра бейджей предметов. Закрытого списка предметов нет и быть не может —
 * их формулирует модель, — поэтому цвет выводится из самой строки, а не из
 * заранее заданного соответствия.
 */
const PALETTE: SubjectColor[] = [
  { fg: '#22d3ee', bg: '#0e2f36', border: '#164e5b' },
  { fg: '#a78bfa', bg: '#241c3d', border: '#3c2f63' },
  { fg: '#e3a047', bg: '#2b2113', border: '#4a3a1c' },
  { fg: '#3fb950', bg: '#10261a', border: '#1c3b26' },
  { fg: '#f472b6', bg: '#331c2a', border: '#55203c' },
  { fg: '#58a6ff', bg: '#0d2440', border: '#1c3f66' },
];

export function subjectColor(subject: string): SubjectColor {
  const key = subject.trim().toLowerCase();
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return PALETTE[sum % PALETTE.length];
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/unit/subject-color.test.ts`
Expected: PASS.

- [ ] **Step 5: Применить в бейджах**

В `src/app/library/page.tsx` вместо строки `<p className="muted">{s.subject} · …</p>` вывести бейдж предмета:

```tsx
<span className="subject-badge" style={{
  color: subjectColor(s.subject).fg,
  background: subjectColor(s.subject).bg,
  borderColor: subjectColor(s.subject).border,
}}>{s.subject}</span>
```

и дату отдельной строкой с классом `num`.

В `src/components/progress/PlanCard.tsx` заменить `<span className="plan-card-subject">{plan.subject}</span>` на такой же бейдж.

В `src/app/globals.css` добавить:

```css
.subject-badge {
  display: inline-flex; align-items: center;
  padding: 3px 10px; border-radius: 999px;
  border: 1px solid; font-size: 11px; font-weight: 600; line-height: 1.3;
}
```

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(ui): deterministic subject colours for badges

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Экран входа с живой витриной

**Files:**
- Create: `src/app/api/showcase/route.ts`, `src/components/Showcase.tsx`, `tests/unit/showcase-api.test.ts`
- Modify: `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `listBundledDemos()` из `@/lib/demos` (возвращает массив `{ slug, title, html, … }`), `instrument(html)` из `@/lib/artifact`.
- Produces: `GET /api/showcase` → `text/html` с инструментированной демкой; компонент `<Showcase />`.

- [ ] **Step 1: Написать падающий тест**

`tests/unit/showcase-api.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GET as showcase } from '@/app/api/showcase/route';

describe('витрина на экране входа', () => {
  it('отдаёт html вшитой демки без сессии и без базы', async () => {
    // Ни DATABASE_URL, ни cookie не заданы: витрина обязана работать до входа.
    const res = await showcase();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<!--showmehow-runtime-->');
    expect(html.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/showcase-api.test.ts`
Expected: FAIL — роута нет.

- [ ] **Step 3: Реализовать роут**

`src/app/api/showcase/route.ts`:

```ts
import { listBundledDemos } from '@/lib/demos';
import { instrument } from '@/lib/artifact';

/**
 * Витрина для экрана входа: отдаёт одну вшитую демку из demos/ как есть.
 * Публичный роут — единственный в приложении. Он не обращается ни к базе,
 * ни к хранилищу пользовательских симуляций и не принимает параметров,
 * поэтому расширить его до чтения чужих данных нечем.
 */
const SHOWCASE_SLUG = 'pendulum';

export async function GET(): Promise<Response> {
  const demo = listBundledDemos().find((d) => d.slug === SHOWCASE_SLUG);
  if (!demo) {
    return new Response('Витрина недоступна', { status: 404 });
  }
  return new Response(instrument(demo.html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

- [ ] **Step 4: Открыть роут в middleware**

В `src/middleware.ts` в массив `PUBLIC_PREFIXES` добавить `'/api/showcase'`:

```ts
const PUBLIC_PREFIXES = ['/login', '/register', '/api/auth/', '/api/showcase'];
```

- [ ] **Step 5: Написать компонент витрины**

`src/components/Showcase.tsx`:

```tsx
/**
 * Живая демка на экране входа: человек видит продукт до того, как заведёт аккаунт.
 * Симуляция изолирована песочницей, как и везде в приложении.
 */
export default function Showcase() {
  return (
    <div className="showcase">
      <iframe
        className="showcase-frame"
        sandbox="allow-scripts"
        src="/api/showcase"
        title="Пример симуляции"
      />
      <div className="showcase-caption">
        <span className="label">Пример</span>
        <p>Математический маятник — одна из десяти готовых симуляций.
          Такие же собираются по описанию явления словами.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Пересобрать страницы входа и регистрации**

`src/app/login/page.tsx`:

```tsx
import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import Showcase from '@/components/Showcase';

export default function LoginPage() {
  return (
    <div className="auth-page">
      <Suspense><AuthForm mode="login" /></Suspense>
      <Showcase />
    </div>
  );
}
```

То же в `src/app/register/page.tsx` с `mode="register"` и именем `RegisterPage`.

- [ ] **Step 7: Стили двух колонок**

В `src/app/globals.css` заменить правило `.auth-page` и добавить витрину:

```css
.auth-page {
  min-height: calc(100vh - 56px);
  display: grid; grid-template-columns: 360px minmax(0, 1fr);
  align-items: center; justify-content: center;
  gap: 40px; padding: 24px; max-width: 1100px; margin: 0 auto;
}
.showcase { display: flex; flex-direction: column; gap: 12px; }
.showcase-frame {
  width: 100%; aspect-ratio: 4 / 3; border: 1px solid var(--border);
  border-radius: var(--r); background: var(--surface); box-shadow: var(--shadow-md);
}
.showcase-caption p { margin: 4px 0 0; color: var(--muted); font-size: 13px; max-width: 46ch; }

@media (max-width: 899px) {
  /* На узком экране витрина уходит: форма важнее. */
  .auth-page { grid-template-columns: minmax(0, 1fr); }
  .showcase { display: none; }
}
```

- [ ] **Step 8: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(ui): live demo showcase on the sign-in screen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Композер — примеры и сегментированный режим

**Files:**
- Create: `src/components/composer/examples.ts`, `tests/unit/composer-examples.test.ts`
- Modify: `src/components/Workbench.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: состояние `prompt`, `setPrompt`, `mode`, `setMode` внутри `Workbench`.
- Produces: `EXAMPLE_PROMPTS: { label: string; prompt: string }[]` — ровно шесть примеров; `QUALITY_MODES: { value: QualityMode; label: string; hint: string }[]`.

- [ ] **Step 1: Написать падающий тест**

`tests/unit/composer-examples.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EXAMPLE_PROMPTS, QUALITY_MODES } from '@/components/composer/examples';

describe('примеры и режимы композера', () => {
  it('ровно шесть примеров, все с непустым текстом и подписью', () => {
    expect(EXAMPLE_PROMPTS).toHaveLength(6);
    for (const e of EXAMPLE_PROMPTS) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.prompt.length).toBeGreaterThan(10);
    }
  });

  it('подписи примеров не повторяются', () => {
    expect(new Set(EXAMPLE_PROMPTS.map((e) => e.label)).size).toBe(EXAMPLE_PROMPTS.length);
  });

  it('три режима качества в порядке от самого полного к быстрому', () => {
    expect(QUALITY_MODES.map((m) => m.value)).toEqual(['max', 'standard', 'fast']);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/composer-examples.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать**

`src/components/composer/examples.ts`:

```ts
import type { QualityMode } from '@/lib/types';

/** Шесть примеров по разным разделам физики: подсказка тому, кто не знает, с чего начать. */
export const EXAMPLE_PROMPTS: { label: string; prompt: string }[] = [
  { label: 'Диффузия', prompt: 'Диффузия молекул духов в комнате: как запах доходит до дальнего угла' },
  { label: 'Маятник Фуко', prompt: 'Маятник Фуко: плоскость качаний поворачивается из-за вращения Земли' },
  { label: 'Преломление', prompt: 'Преломление луча света на границе воздуха и воды, с показателем преломления' },
  { label: 'Цикл Карно', prompt: 'Цикл Карно на диаграмме давление-объём с поршнем и двумя резервуарами' },
  { label: 'Поле зарядов', prompt: 'Электростатическое поле двух точечных зарядов с линиями напряжённости' },
  { label: 'Орбита', prompt: 'Орбита спутника вокруг Земли: как скорость запуска меняет форму орбиты' },
];

export const QUALITY_MODES: { value: QualityMode; label: string; hint: string }[] = [
  { value: 'max', label: 'Максимум', hint: '3-6 мин' },
  { value: 'standard', label: 'Стандарт', hint: '1-3 мин' },
  { value: 'fast', label: 'Быстрый', hint: '~1 мин' },
];
```

- [ ] **Step 4: Встроить в композер**

В `src/components/Workbench.tsx`, в блоке `.composer`:

- заменить `<select aria-label="Режим качества">` на сегментированный переключатель:

```tsx
<div className="segmented" role="radiogroup" aria-label="Режим качества">
  {QUALITY_MODES.map((m) => (
    <button
      key={m.value}
      type="button"
      role="radio"
      aria-checked={mode === m.value}
      className={mode === m.value ? 'segmented-item active' : 'segmented-item'}
      disabled={phase === 'generating'}
      onClick={() => setMode(m.value)}
    >
      {m.label}
      <span className="num segmented-hint">{m.hint}</span>
    </button>
  ))}
</div>
```

- под `<textarea>` добавить чипы-примеры, видимые только когда симуляция не открыта и поле пустое:

```tsx
{!hasSim && prompt.trim() === '' && (
  <div className="example-chips">
    {EXAMPLE_PROMPTS.map((e) => (
      <button key={e.label} type="button" className="chip chip-action"
        onClick={() => setPrompt(e.prompt)}>{e.label}</button>
    ))}
  </div>
)}
```

Нажатие подставляет текст и **не запускает** генерацию.

- [ ] **Step 5: Стили**

В `src/app/globals.css`:

```css
.segmented { display: flex; gap: 2px; padding: 2px; background: var(--surface-2);
  border: 1px solid var(--border); border-radius: var(--r-sm); }
.segmented-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px;
  min-height: 44px; padding: 5px 8px; border: none; border-radius: 6px;
  background: transparent; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: background .12s ease, color .12s ease; }
.segmented-item:hover:not(:disabled) { color: var(--text); }
.segmented-item.active { background: var(--accent-soft); color: var(--accent); }
.segmented-item:disabled { opacity: .5; cursor: default; }
.segmented-hint { font-size: 10px; opacity: .8; font-weight: 400; }

.example-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip-action { cursor: pointer; transition: border-color .12s ease, color .12s ease; }
.chip-action:hover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(ui): example prompts and a segmented quality switch in the composer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Прогресс — вертикальная лента прибора

**Files:**
- Modify: `src/components/progress/StageTimeline.tsx`, `src/components/PreviewFrame.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `StageInfo`, `STAGE_LABELS` из `deriveProgress` (не менять), `stageCopy` из `stepCopy`.
- Produces: ничего для других задач.

- [ ] **Step 1: Переписать разметку таймлайна**

`src/components/progress/StageTimeline.tsx` — раскладка становится вертикальной, логика вычисления `suffix` и `pct` **сохраняется дословно**:

```tsx
        <ol className="stage-rail">
          {stages.map((s) => (
            <li key={s.stage} className={`rail-item rail-${s.status}`}>
              <span className="rail-dot" aria-hidden>
                {s.status === 'done' ? '✓' : s.status === 'active' ? '' : ''}
              </span>
              <span className="rail-label">{STAGE_LABELS[s.stage]}</span>
              {suffixFor(s) && <span className="num rail-suffix">{suffixFor(s)}</span>}
            </li>
          ))}
        </ol>
```

где `suffixFor` — вынесенная наверх файла функция с тем же телом, что нынешний блок вычисления `suffix` (она принимает `s: StageInfo` и замыкает `now`). Полоса прогресса `stage-progressbar` остаётся над лентой, подпись активного этапа — под ней.

- [ ] **Step 2: Стили ленты**

В `src/app/globals.css` рядом с существующими правилами таймлайна добавить:

```css
.stage-rail { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rail-item { display: flex; align-items: center; gap: 10px; padding: 5px 0;
  font-size: 13px; color: var(--muted); position: relative; }
/* Вертикальная линия прибора, соединяющая точки этапов. */
.rail-item:not(:last-child)::before {
  content: ''; position: absolute; left: 7px; top: 24px; bottom: -5px;
  width: 1px; background: var(--border);
}
.rail-dot { width: 15px; height: 15px; flex-shrink: 0; border-radius: 50%;
  border: 1px solid var(--border); background: var(--surface-2);
  display: grid; place-items: center; font-size: 9px; color: var(--bg); }
.rail-active .rail-dot { border-color: var(--accent); background: var(--accent);
  animation: chip-pulse 1.4s ease-in-out infinite; }
.rail-active .rail-label { color: var(--text); font-weight: 600; }
.rail-done .rail-dot { border-color: var(--success); background: var(--success); }
.rail-done .rail-label { color: var(--text); }
.rail-pending { opacity: .5; }
.rail-skipped { opacity: .35; }
.rail-interrupted .rail-dot { border-color: var(--warn); background: var(--warn-soft); }
.rail-suffix { margin-left: auto; color: var(--muted); }
```

Старые правила `.stage-timeline` и `.stage-chip*` удалить: горизонтальных чипов больше нет.

- [ ] **Step 3: Рамка прибора вокруг превью**

В `src/components/PreviewFrame.tsx` пустое состояние сделать содержательнее, а рамку задать стилями:

```tsx
  if (!html) {
    return (
      <div className="preview-empty">
        <span className="label">Экран</span>
        <p>Здесь появится симуляция. Опишите явление слева и нажмите «Создать».</p>
      </div>
    );
  }
```

В `src/app/globals.css` заменить `.preview-empty` и `.preview-frame`:

```css
.preview-wrap { flex: 1; position: relative; display: flex; padding: 16px; }
.preview-frame { flex: 1; width: 100%; border: 1px solid var(--border);
  border-radius: var(--r); background: #0b0e13; box-shadow: var(--shadow-md); }
.preview-empty { flex: 1; margin: 16px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; text-align: center;
  color: var(--muted); border: 1px dashed var(--border); border-radius: var(--r); }
.preview-empty p { margin: 0; max-width: 34ch; font-size: 13px; }
```

- [ ] **Step 4: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: зелёные, включая `tests/unit/derive-progress.test.ts` — логика не менялась.

```bash
git add -A
git commit -m "feat(ui): vertical stage rail and instrument frame around the preview

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Галерея — фильтры, живые карточки, пустое состояние

**Files:**
- Create: `src/app/library/gallery.ts`, `tests/unit/gallery.test.ts`
- Modify: `src/app/library/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `SimulationMeta` из `@/lib/types`, `subjectColor` из Task 3.
- Produces:

```ts
export type SortKey = 'updated' | 'title';
export interface GalleryFilters { query: string; subject: string | null; sort: SortKey }
export function subjectsOf(sims: SimulationMeta[]): string[];
export function applyFilters(sims: SimulationMeta[], f: GalleryFilters): SimulationMeta[];
export function nextPlaying(current: string | null, action: { type: 'enter' | 'leave' | 'toggle'; id: string }): string | null;
```

- [ ] **Step 1: Написать падающий тест**

`tests/unit/gallery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { subjectsOf, applyFilters, nextPlaying } from '@/app/library/gallery';
import type { SimulationMeta } from '@/lib/types';

function sim(over: Partial<SimulationMeta>): SimulationMeta {
  return {
    id: 'x', title: 'т', prompt: 'п', subject: 'Физика', tags: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

describe('фильтры галереи', () => {
  const sims = [
    sim({ id: 'a', title: 'Маятник', subject: 'Механика', updatedAt: '2026-03-01T00:00:00.000Z' }),
    sim({ id: 'b', title: 'Линза', subject: 'Оптика', tags: ['свет'], updatedAt: '2026-05-01T00:00:00.000Z' }),
    sim({ id: 'c', title: 'Газ', subject: 'Механика', updatedAt: '2026-04-01T00:00:00.000Z' }),
  ];

  it('собирает предметы без повторов и по алфавиту', () => {
    expect(subjectsOf(sims)).toEqual(['Механика', 'Оптика']);
  });

  it('поиск смотрит в название, промпт, предмет и теги', () => {
    expect(applyFilters(sims, { query: 'свет', subject: null, sort: 'updated' }).map((s) => s.id))
      .toEqual(['b']);
    expect(applyFilters(sims, { query: 'МЕХАН', subject: null, sort: 'updated' }).map((s) => s.id))
      .toEqual(['c', 'a']);
  });

  it('фильтр по предмету и сортировка по дате обновления по умолчанию', () => {
    expect(applyFilters(sims, { query: '', subject: 'Механика', sort: 'updated' }).map((s) => s.id))
      .toEqual(['c', 'a']);
  });

  it('сортировка по названию', () => {
    expect(applyFilters(sims, { query: '', subject: null, sort: 'title' }).map((s) => s.id))
      .toEqual(['c', 'b', 'a']);
  });

  it('пустой фильтр отдаёт всё', () => {
    expect(applyFilters(sims, { query: '', subject: null, sort: 'updated' })).toHaveLength(3);
  });
});

describe('какая карточка играет', () => {
  it('наведение включает карточку, уход выключает только её', () => {
    expect(nextPlaying(null, { type: 'enter', id: 'a' })).toBe('a');
    expect(nextPlaying('a', { type: 'leave', id: 'b' })).toBe('a');
    expect(nextPlaying('a', { type: 'leave', id: 'a' })).toBeNull();
  });

  it('одновременно играет не более одной', () => {
    expect(nextPlaying('a', { type: 'enter', id: 'b' })).toBe('b');
  });

  it('нажатие переключает ту же карточку', () => {
    expect(nextPlaying(null, { type: 'toggle', id: 'a' })).toBe('a');
    expect(nextPlaying('a', { type: 'toggle', id: 'a' })).toBeNull();
    expect(nextPlaying('a', { type: 'toggle', id: 'b' })).toBe('b');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/gallery.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать чистые функции**

`src/app/library/gallery.ts`:

```ts
import type { SimulationMeta } from '@/lib/types';

export type SortKey = 'updated' | 'title';

export interface GalleryFilters {
  query: string;
  subject: string | null;
  sort: SortKey;
}

/** Предметы, реально встречающиеся в библиотеке, — из них строятся чипы фильтра. */
export function subjectsOf(sims: SimulationMeta[]): string[] {
  return [...new Set(sims.map((s) => s.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

function haystack(s: SimulationMeta): string {
  return `${s.title} ${s.prompt} ${s.subject} ${s.tags.join(' ')}`.toLowerCase();
}

export function applyFilters(sims: SimulationMeta[], f: GalleryFilters): SimulationMeta[] {
  const q = f.query.trim().toLowerCase();
  const out = sims.filter((s) =>
    (!q || haystack(s).includes(q)) && (!f.subject || s.subject === f.subject));
  return out.sort((a, b) => f.sort === 'title'
    ? a.title.localeCompare(b.title, 'ru')
    : b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Какая карточка воспроизводится. Правило одно: одновременно не более одной —
 * иначе десяток симуляций в фоне съедят процессор ноутбука преподавателя.
 */
export function nextPlaying(
  current: string | null,
  action: { type: 'enter' | 'leave' | 'toggle'; id: string },
): string | null {
  if (action.type === 'enter') return action.id;
  if (action.type === 'leave') return current === action.id ? null : current;
  return current === action.id ? null : action.id;
}
```

- [ ] **Step 4: Пересобрать страницу галереи**

`src/app/library/page.tsx`: добавить состояния `subject`, `sort`, `playing`; список выводить через `applyFilters`; над сеткой — панель фильтров (поле поиска, чипы предметов из `subjectsOf`, переключатель сортировки); карточку переписать так:

```tsx
<div className="card sim-card"
  onMouseEnter={() => setPlaying((p) => nextPlaying(p, { type: 'enter', id: s.id }))}
  onMouseLeave={() => setPlaying((p) => nextPlaying(p, { type: 'leave', id: s.id }))}>
  <div className="card-thumb">
    {playing === s.id && html[s.id]
      ? <iframe className="card-live" sandbox="allow-scripts" srcDoc={html[s.id]} title={s.title} />
      : <img src={`/api/simulations/${s.id}/thumbnail`} alt=""
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
    <button type="button" className="card-play"
      aria-label={playing === s.id ? 'Остановить' : 'Запустить'}
      onClick={() => setPlaying((p) => nextPlaying(p, { type: 'toggle', id: s.id }))}>
      {playing === s.id ? '■' : '▶'}
    </button>
  </div>
  …
</div>
```

HTML симуляции подгружается лениво: при первом включении карточки `fetch('/api/simulations/' + id)` и результат кладётся в состояние `html` (объект id → html), чтобы повторное наведение не ходило в сеть.

Задержка перед запуском — 150 мс: `setTimeout` в обработчике `onMouseEnter`, очищаемый в `onMouseLeave`. Без неё быстрое движение курсора через сетку запускает и гасит десяток симуляций подряд.

Кнопка `.card-play` видима всегда на устройствах без наведения и по наведению — на остальных (правило `@media (hover: hover)`).

- [ ] **Step 5: Пустое состояние и стили**

Пустое состояние — карточка по центру:

```tsx
<div className="empty-library card">
  <h2>Библиотека пуста</h2>
  <p className="muted">Опишите явление на вкладке «Создать» — или поставьте десять
    готовых симуляций и посмотрите, как это выглядит.</p>
  <button className="btn btn-primary" onClick={installDemos} disabled={installing}>
    {installing ? 'Устанавливаю…' : 'Установить 10 примеров'}
  </button>
</div>
```

Стили в `src/app/globals.css`:

```css
.gallery-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; }
.gallery-filters .input { width: 260px; }
.subject-filter { display: flex; flex-wrap: wrap; gap: 6px; }
.subject-filter .chip { cursor: pointer; }
.subject-filter .chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

.sim-card { position: relative; transition: border-color .15s ease, transform .15s ease; }
.sim-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.card-thumb { position: relative; }
.card-live { position: absolute; inset: 0; width: 100%; height: 100%; border: none; }
.card-play { position: absolute; right: 8px; bottom: 8px; width: 34px; height: 34px;
  border-radius: 50%; border: 1px solid var(--border); background: rgba(13,17,23,.8);
  color: var(--text); cursor: pointer; font-size: 12px; line-height: 1;
  backdrop-filter: blur(4px); }
@media (hover: hover) { .card-play { opacity: 0; transition: opacity .15s ease; }
  .sim-card:hover .card-play { opacity: 1; } }

.empty-library { max-width: 460px; margin: 40px auto; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px; }
.empty-library h2 { margin: 0; font-size: 18px; }
```

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(ui): gallery filters, hover-to-play cards and a real empty state

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Панель режима презентации

**Files:**
- Create: `src/components/PresentChrome.tsx`
- Modify: `src/app/present/[id]/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `simulationId: string` пропом.
- Produces: ничего для других задач.

- [ ] **Step 1: Написать компонент**

`src/components/PresentChrome.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

/**
 * Панель поверх полноэкранной симуляции: появляется при движении мыши и прячется
 * через три секунды покоя, чтобы не мешать показу на занятии.
 */
export default function PresentChrome({ simulationId }: { simulationId: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function wake() {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 3000);
    }
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen().catch(() => {
      // Браузер может отказать без пользовательского жеста — тогда просто ничего не делаем.
    });
  }

  return (
    <div className={visible ? 'present-chrome' : 'present-chrome hidden'}>
      <a className="btn btn-secondary" href="/library">← В галерею</a>
      <a className="btn btn-secondary" href={`/?id=${simulationId}`}>Доработать</a>
      <button type="button" className="btn btn-secondary" onClick={toggleFullscreen}>
        Во весь экран
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Подключить на странице**

В `src/app/present/[id]/page.tsx` заменить `<a className="present-exit" href="/library">← Выйти</a>` на `<PresentChrome simulationId={id} />`.

- [ ] **Step 3: Стили**

В `src/app/globals.css` заменить `.present-exit` и его `:hover` на:

```css
.present-chrome {
  position: fixed; top: 12px; left: 12px; z-index: 50;
  display: flex; gap: 8px;
  transition: opacity .3s ease, transform .3s ease;
}
.present-chrome.hidden { opacity: 0; transform: translateY(-8px); pointer-events: none; }
.present-chrome .btn { background: rgba(13, 17, 23, .82); backdrop-filter: blur(6px); }
```

- [ ] **Step 4: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(ui): auto-hiding control bar in presentation mode

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Онбординг из трёх шагов

**Files:**
- Create: `src/components/Onboarding.tsx`, `tests/unit/onboarding.test.ts`
- Modify: `src/components/Workbench.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: ничего.
- Produces: `ONBOARDING_KEY = 'showmehow-onboarded'`, `ONBOARDING_STEPS: { title: string; text: string }[]` (ровно три).

- [ ] **Step 1: Написать падающий тест**

`tests/unit/onboarding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ONBOARDING_STEPS, ONBOARDING_KEY } from '@/components/Onboarding';

describe('онбординг', () => {
  it('ровно три шага с непустыми заголовком и текстом', () => {
    expect(ONBOARDING_STEPS).toHaveLength(3);
    for (const s of ONBOARDING_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(10);
    }
  });

  it('ключ хранения задан', () => {
    expect(ONBOARDING_KEY).toBe('showmehow-onboarded');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/onboarding.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать**

`src/components/Onboarding.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

export const ONBOARDING_KEY = 'showmehow-onboarded';

export const ONBOARDING_STEPS: { title: string; text: string }[] = [
  { title: 'Опишите явление словами',
    text: 'Одной фразой: «диффузия духов в комнате» или «маятник Фуко». Термины и формулы не нужны.' },
  { title: 'Мы соберём интерактивную симуляцию',
    text: 'Модель напишет код, прогонит его в браузере, проверит физику и доведёт до нужного качества.' },
  { title: 'Покажите её классу',
    text: 'Полноэкранный режим, ползунки параметров и графики. Файл можно скачать и открыть без интернета.' },
];

/** Показывается один раз при первом входе; факт прохождения живёт в localStorage. */
export default function Onboarding() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) setStep(0);
    } catch {
      // Приватный режим может запретить хранилище — тогда просто не показываем.
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // Не смогли запомнить — покажем ещё раз в следующий раз, это не ошибка.
    }
    setStep(null);
  }

  if (step === null) return null;
  const last = step === ONBOARDING_STEPS.length - 1;
  const s = ONBOARDING_STEPS[step];

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding card">
        <span className="label">Шаг {step + 1} из {ONBOARDING_STEPS.length}</span>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <div className="onboarding-actions">
          <button type="button" className="btn btn-ghost" onClick={close}>Пропустить</button>
          <button type="button" className="btn btn-primary"
            onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? 'Начать' : 'Дальше'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Подключить и оформить**

В `src/components/Workbench.tsx` отрисовать `<Onboarding />` первым элементом внутри корневого `div.workbench`.

Стили:

```css
.onboarding-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center;
  background: rgba(13, 17, 23, .72); backdrop-filter: blur(3px); animation: fade-in .2s ease-out; }
.onboarding { max-width: 420px; padding: 24px; display: flex; flex-direction: column; gap: 8px;
  animation: fade-slide-in .25s ease-out; }
.onboarding h2 { margin: 4px 0 0; font-size: 19px; }
.onboarding p { margin: 0; color: var(--muted); font-size: 14px; }
.onboarding-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
```

- [ ] **Step 5: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(ui): three-step onboarding on first visit

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
