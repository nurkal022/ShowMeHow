import { activeProvider, NO_PROVIDER_MESSAGE } from '../settings';
import { bindChat } from '../provider';
import { extractJson } from '../artifact';
import { getSpec } from '../storage';
import { buildModel, buildPlot, type ModelDoc, type PlotDoc, type SimDoc } from './doc';
import { columnStats } from './data';
import { formatNum, formatWithError } from './fit';
import {
  sectionTitle, stripUnknownCitations, figureOrder, type ArticleDoc, type ArticleLang, type ArticleSection, type Reference,
} from './article';
import { ResearchError, type ResearchItem } from './store';

/**
 * ИИ-помощник статьи. Главное правило — модель не источник фактов:
 * - числа, формулы и рисунки берутся только из блока ФАКТЫ (посчитаны в проекте автора);
 * - ссылки — только ключи из блока ИСТОЧНИКИ, выдуманные вычищаются кодом после ответа;
 * - чего не хватает — модель ставит пометку [[TODO: …]], а не додумывает.
 * Всё, что модель предлагает, автор принимает или отклоняет; журнал этого — в doc.aiLog.
 */

const LANG_NAME: Record<ArticleLang, string> = { ru: 'русском', kk: 'казахском', en: 'английском (академический British/American English, без смешения)' };

const RULES = `Правила, которые нельзя нарушать:
1. Не выдумывай данные, числа, единицы, названия приборов, образцы и результаты. Используй только блок ФАКТЫ и текст автора.
2. Ссылки на литературу — только в форме [@ключ] и только с ключами из блока ИСТОЧНИКИ. Нет подходящего источника — не ставь ссылку.
3. Рисунки упоминай только как [[fig:ID]] с ID из блока ФАКТЫ — при выводе это само станет «рис. N», поэтому не пиши перед ним слово «рисунок» («как видно из [[fig:ID]]», «(см. [[fig:ID]])»). Отдельной строкой рисунок вставляется как {{fig:ID}}.
4. Если для хорошего текста не хватает сведений — вставь пометку [[TODO: что нужно уточнить]].
5. Формулы — в LaTeX внутри $…$ (в строке) или отдельной строкой $$…$$.
6. Стиль — научный, безличный, без воды и без рекламных слов («уникальный», «революционный»).
7. Весь текст — на одном языке, без вкраплений слов из других языков (кроме общепринятых обозначений и названий).
8. Разметка: абзацы через пустую строку, **жирный**, *курсив*, «## » подзаголовок, «- » список. Без Markdown-заголовков «#».`;

function chat() {
  const p = activeProvider();
  if (!p) throw new ResearchError(NO_PROVIDER_MESSAGE);
  return bindChat(p, 'planner');
}

/** onDelta — куски ответа по мере генерации: редактор показывает текст вживую. */
export type OnDelta = (chunk: string) => void;

async function askText(system: string, user: string, onDelta?: OnDelta): Promise<string> {
  let out: string;
  try {
    out = await chat()([{ role: 'system', content: system }, { role: 'user', content: user }], onDelta ? { onDelta } : undefined);
  } catch (e) {
    if (e instanceof ResearchError) throw e;
    throw new ResearchError('Помощник сейчас недоступен. Попробуйте через минуту.');
  }
  // Модели любят оборачивать ответ в ``` — снимаем обёртку, текст оставляем как есть.
  return out.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
}

async function askJson<T>(system: string, user: string): Promise<T> {
  const out = await askText(`${system}\nОтвечай только JSON без пояснений вокруг.`, user);
  try {
    return extractJson<T>(out);
  } catch {
    throw new ResearchError('Помощник ответил не по формату. Попробуйте ещё раз.');
  }
}

/* ------------------------------- факты проекта ------------------------------- */

/** Что посчитано в проекте — текстом для модели. Модель пересказывает это, а не придумывает. */
export async function projectFacts(ownerId: string, items: ResearchItem[]): Promise<string> {
  const parts: string[] = [];
  for (const it of items) {
    const head = `### Рисунок ID=${it.id} — ${it.kind === 'plot' ? 'график по данным' : it.kind === 'model' ? 'модель' : 'интерактивная симуляция'}: «${it.title}»`;
    const lines = [head];
    if (it.caption) lines.push(`Подпись/заметки автора: ${it.caption}`);
    try {
      if (it.kind === 'plot') {
        const doc = it.doc as PlotDoc;
        const b = buildPlot(doc);
        lines.push(`Оси: X — «${doc.xLabel}», Y — «${doc.yLabel}»${doc.xLog || doc.yLog ? ` (логарифмическая шкала: ${[doc.xLog && 'X', doc.yLog && 'Y'].filter(Boolean).join(', ')})` : ''}.`);
        const t = b.table;
        if (t) {
          lines.push(`Таблица: ${t.rows} строк; столбцы: ${t.headers.join(', ')}.`);
          t.headers.forEach((h, i) => {
            const s = columnStats(t.columns[i]);
            if (s.n) lines.push(`- ${h}: n=${s.n}, среднее ${formatNum(s.mean)}, SD ${formatNum(s.sd)}, диапазон ${formatNum(s.min)}…${formatNum(s.max)}`);
          });
        }
        doc.series.forEach((s, i) => {
          const f = b.fits[i];
          const errCol = s.err !== null && t ? ` с погрешностями из столбца «${t.headers[s.err]}»` : '';
          lines.push(`Серия «${s.label || t?.headers[s.y]}»${errCol}.`);
          if (f) {
            lines.push(`Аппроксимация y = ${f.expr} методом наименьших квадратов (Левенберг–Марквардт${f.chi2red !== null ? ', с весами 1/σ²' : ''}): `
              + `${f.params.map((p) => `${p.name} = ${formatWithError(p.value, p.error)}`).join(', ')}; R² = ${f.r2.toFixed(4)}; RMSE = ${formatNum(f.rmse, 3)}`
              + `${f.chi2red !== null ? `; χ²/ν = ${formatNum(f.chi2red, 3)}` : ''}; n = ${f.n}.`);
          }
        });
      } else if (it.kind === 'model') {
        const doc = it.doc as ModelDoc;
        lines.push(`${doc.mode === 'ode' ? 'Система ОДУ' : 'Явные зависимости'}: ${doc.lines.filter((l) => l.trim()).join('; ')}.`);
        lines.push(`Параметры: ${doc.params.map((p) => `${p.name} = ${formatNum(p.value)} (исследуемый диапазон ${formatNum(p.min)}…${formatNum(p.max)})`).join(', ')}.`);
        lines.push(`Интервал: ${doc.mode === 'ode' ? 't' : 'аргумент'} от ${doc.from} до ${doc.to}.`);
        if (doc.mode === 'ode') lines.push(`Начальные условия: ${Object.entries(doc.initial).map(([k, v]) => `${k}(0) = ${v}`).join(', ')}. Численное решение — метод Рунге–Кутты 4-го порядка.`);
        const b = buildModel(doc);
        if (b.errors.length) lines.push(`Замечания расчёта: ${b.errors.join(' ')}`);
      } else {
        const spec = await getSpec(ownerId, (it.doc as SimDoc).simulationId).catch(() => null);
        if (spec) {
          lines.push(`Физика и допущения: ${spec.physics}`);
          lines.push(`Параметры: ${spec.parameters.map((p) => `${p.label} (${p.name}, ${p.min}…${p.max} ${p.unit})`).join('; ')}.`);
        }
      }
    } catch { /* битый документ — остаётся заголовок */ }
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n') || '(в проекте нет рисунков и данных)';
}

function sourcesBlock(refs: Reference[]): string {
  if (refs.length === 0) return '(список литературы пуст — ссылки не ставь)';
  return refs.map((r) => `[@${r.id}] ${r.authors.slice(0, 3).map((a) => a.family).join(', ')}${r.authors.length > 3 ? ' et al.' : ''} (${r.year ?? 'n.d.'}). ${r.title}. ${r.container}.${r.abstract ? ` Аннотация: ${r.abstract.slice(0, 700)}` : ''}`).join('\n');
}

function outline(doc: ArticleDoc, skipId?: string): string {
  return doc.sections.filter((s) => s.id !== skipId && s.body.trim())
    .map((s) => `## ${s.title}\n${s.body.slice(0, 2500)}`).join('\n\n') || '(остальные разделы пока пусты)';
}

/** Чистка ответа: выдуманные ссылки и рисунки не попадают в текст. */
export function sanitizeDraft(text: string, refs: Reference[], figureIds: string[]): string {
  const figs = new Set(figureIds);
  return stripUnknownCitations(text, refs)
    .replace(/\{\{fig:([\w-]+)\}\}/g, (w, id: string) => (figs.has(id) ? w : ''))
    .replace(/\[\[fig:([\w-]+)\]\]/g, (w, id: string) => (figs.has(id) ? w : '[[TODO: рисунок]]'))
    .replace(/^#\s+/gm, '## ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------------------------------- действия ---------------------------------- */

export type RewriteMode = 'academic' | 'shorter' | 'simpler' | 'grammar' | 'expand' | 'clarity';

const REWRITE_TASK: Record<RewriteMode, string> = {
  academic: 'Перепиши фрагмент в академическом стиле научной статьи: точные термины, безличные конструкции, связность. Смысл и все числа сохрани.',
  shorter: 'Сократи фрагмент примерно на треть без потери смысла, чисел и ссылок.',
  simpler: 'Перепиши проще и яснее: короче предложения, меньше канцелярита. Смысл, числа и ссылки сохрани.',
  grammar: 'Исправь только грамматику, орфографию, пунктуацию и согласование. Стиль и формулировки не меняй.',
  expand: 'Разверни фрагмент: поясни логику и связи, но НЕ добавляй новых фактов, чисел и ссылок — где нужны сведения, ставь [[TODO: …]].',
  clarity: 'Улучши ясность и логику изложения: порядок мыслей, связки между предложениями. Факты не добавляй.',
};

export async function rewrite(text: string, mode: RewriteMode, lang: ArticleLang, refs: Reference[], onDelta?: OnDelta): Promise<string> {
  const out = await askText(
    `Ты — научный редактор. Пишешь на ${LANG_NAME[lang]} языке.\n${RULES}\nВерни только исправленный фрагмент, без комментариев. Разметку [@…], [[fig:…]], {{fig:…}} и $…$ сохраняй как есть.`,
    `ЗАДАЧА: ${REWRITE_TASK[mode]}\n\nИСТОЧНИКИ:\n${sourcesBlock(refs)}\n\nФРАГМЕНТ:\n${text}`,
    onDelta,
  );
  return stripUnknownCitations(out, refs);
}

export async function translate(text: string, to: ArticleLang, refs: Reference[], onDelta?: OnDelta): Promise<string> {
  const out = await askText(
    `Ты — переводчик научных статей. Переводишь на ${LANG_NAME[to]} язык с точной научной терминологией, принятой в журналах этой области.\n`
    + 'Сохраняй без изменений разметку [@…], [[fig:…]], {{fig:…}}, $…$ и $$…$$, числа и единицы (единицы — в принятой в языке записи). Верни только перевод.',
    text,
    onDelta,
  );
  return stripUnknownCitations(out, refs);
}

export interface LogicIssue { quote: string; problem: string; suggestion: string }

export async function reviewLogic(text: string, lang: ArticleLang, facts: string): Promise<LogicIssue[]> {
  const r = await askJson<{ issues?: LogicIssue[] }>(
    `Ты — строгий, но доброжелательный рецензент научного журнала. Отвечаешь на ${LANG_NAME[lang]} языке.`,
    `Найди в тексте проблемы: выводы, которые не следуют из данных; противоречия с ФАКТАМИ; неточные формулировки; утверждения без обоснования; повторы.\n`
    + 'Формат: {"issues":[{"quote":"точная короткая цитата из текста","problem":"в чём проблема","suggestion":"как исправить"}]} — не больше 8 пунктов, самые важные первыми. Нет проблем — пустой список.\n\n'
    + `ФАКТЫ:\n${facts}\n\nТЕКСТ:\n${text}`,
  );
  return (r.issues ?? []).filter((i) => i && typeof i.problem === 'string').slice(0, 8);
}

export interface CitationNeed { quote: string; why: string; candidates: string[] }

export async function citationNeeds(text: string, lang: ArticleLang, refs: Reference[]): Promise<CitationNeed[]> {
  const r = await askJson<{ claims?: CitationNeed[] }>(
    `Ты — научный редактор. Отвечаешь на ${LANG_NAME[lang]} языке.`,
    'Найди утверждения, которым нужна ссылка на литературу (общеизвестные факты, чужие результаты, «известно, что…»), но ссылки нет. '
    + 'Для каждого предложи подходящие ключи из ИСТОЧНИКОВ (только оттуда; если подходящих нет — пустой список).\n'
    + 'Формат: {"claims":[{"quote":"точная цитата","why":"почему нужна ссылка","candidates":["ключ"]}]} — не больше 10.\n\n'
    + `ИСТОЧНИКИ:\n${sourcesBlock(refs)}\n\nТЕКСТ:\n${text}`,
  );
  const known = new Set(refs.map((x) => x.id));
  return (r.claims ?? []).filter((c) => c && typeof c.quote === 'string')
    .map((c) => ({ ...c, candidates: (c.candidates ?? []).map((k) => String(k).replace(/^@/, '')).filter((k) => known.has(k)) })).slice(0, 10);
}

const DRAFT_TASK: Record<ArticleSection['key'], string> = {
  introduction: 'Напиши «Введение»: контекст области → что известно (ТОЛЬКО по ИСТОЧНИКАМ, с [@ключ]) → чего не хватает → цель и вклад работы (по тезисам автора и фактам). 3–5 абзацев.',
  methods: 'Напиши «Материалы и методы» по ФАКТАМ: модель (формулы в LaTeX), параметры, численный метод, обработка данных, метод аппроксимации и оценки погрешностей. Приборы, образцы и условия, которых нет в фактах, — пометками [[TODO: …]].',
  results: 'Напиши «Результаты» по ФАКТАМ: что показывает каждый рисунок (вставь рисунки строкой {{fig:ID}} и сошлись на них [[fig:ID]]), значения параметров с погрешностями и единицами, качество аппроксимации. Без интерпретаций — только результаты.',
  discussion: 'Напиши «Обсуждение»: что значат результаты (по ФАКТАМ и тезисам автора), сравнение с литературой (ТОЛЬКО по ИСТОЧНИКАМ), ограничения работы, что дальше.',
  conclusion: 'Напиши «Заключение»: 3–5 главных выводов, каждый следует из результатов. Без новых фактов.',
  acknowledgements: 'Напиши «Благодарности» по тезисам автора (грант, ИРН, организации). Номер гранта не выдумывай — [[TODO: номер ИРН]].',
  custom: 'Напиши этот раздел по тезисам автора и фактам.',
};

export async function draftSection(input: {
  doc: ArticleDoc; section: ArticleSection; title: string; facts: string; figureIds: string[];
}, onDelta?: OnDelta): Promise<string> {
  const { doc, section } = input;
  const notes = doc.notes[section.id]?.trim();
  const out = await askText(
    `Ты — соавтор-редактор, помогающий учёному написать черновик статьи. Пишешь на ${LANG_NAME[doc.lang]} языке.\n${RULES}\nВерни только текст раздела, без заголовка раздела.`,
    `СТАТЬЯ: «${input.title}» (${doc.kind}).\nРАЗДЕЛ: «${section.title}».\nЗАДАЧА: ${DRAFT_TASK[section.key]}\n\n`
    + `ТЕЗИСЫ АВТОРА К РАЗДЕЛУ:\n${notes || '(нет — опирайся на факты и другие разделы)'}\n\n`
    + `ФАКТЫ (посчитано в проекте автора):\n${input.facts}\n\nИСТОЧНИКИ:\n${sourcesBlock(doc.references)}\n\n`
    + `ДРУГИЕ РАЗДЕЛЫ (для связности, не повторяй их):\n${outline(doc, section.id)}\n\n`
    + (section.body.trim() ? `ТЕКУЩИЙ ТЕКСТ РАЗДЕЛА (улучши и дополни, сохрани мысли автора):\n${section.body}` : ''),
    onDelta,
  );
  return sanitizeDraft(out, doc.references, input.figureIds);
}

export async function caption(item: ResearchItem, facts: string, lang: ArticleLang): Promise<string> {
  return askText(
    `Ты — научный редактор. Пишешь подписи к рисункам на ${LANG_NAME[lang]} языке.\n${RULES}`,
    'Напиши подпись к рисунку для статьи: что изображено, обозначения (точки, линии, погрешности), условия. Одно-три предложения. Без слова «Рисунок N» в начале. Верни только подпись.\n\n'
    + `ФАКТЫ О РИСУНКЕ:\n${facts}\n\nТЕКУЩАЯ ЗАМЕТКА АВТОРА: ${item.caption || '(нет)'}`,
  );
}

export interface AbstractDraft { abstract: Partial<Record<ArticleLang, string>>; keywords: Partial<Record<ArticleLang, string>>; titles: string[] }

export async function abstractDraft(doc: ArticleDoc, title: string, langs: ArticleLang[], wordLimit: number): Promise<AbstractDraft> {
  const r = await askJson<AbstractDraft>(
    `Ты — научный редактор. ${RULES}`,
    `По тексту статьи напиши структурированную аннотацию (цель, методы, результаты с ключевыми числами из текста, вывод) — не больше ${wordLimit} слов, одним абзацем, без ссылок и рисунков — `
    + `на языках: ${langs.join(', ')} (содержание одинаковое, термины — принятые в каждом языке). 5–7 ключевых слов через «; » на тех же языках. И 3 варианта названия статьи на языке статьи (${doc.lang}).\n`
    + 'Формат: {"abstract":{"ru":"…","kk":"…","en":"…"},"keywords":{"ru":"…"},"titles":["…"]} — только запрошенные языки.\n\n'
    + `ТЕКУЩЕЕ НАЗВАНИЕ: ${title}\n\nТЕКСТ СТАТЬИ:\n${outline(doc)}`,
  );
  const pick = (o: unknown) => Object.fromEntries(langs.map((l) => [l, typeof (o as Record<string, unknown>)?.[l] === 'string' ? String((o as Record<string, string>)[l]).trim() : '']).filter(([, v]) => v));
  return { abstract: pick(r.abstract), keywords: pick(r.keywords), titles: Array.isArray(r.titles) ? r.titles.map(String).slice(0, 5) : [] };
}

export interface GraphicalDraft { headline: string; steps: { label: string; detail: string }[]; takeaway: string }

/** Содержание графического абстракта по проекту: описание, посчитанные факты и аннотация статьи, если есть. */
export async function graphicalAbstract(input: { title: string; description: string; facts: string; abstract: string; lang: ArticleLang }): Promise<GraphicalDraft> {
  const r = await askJson<Partial<GraphicalDraft>>(
    `Ты — научный иллюстратор. Готовишь содержание графического абстракта на ${LANG_NAME[input.lang]} языке: очень коротко, крупные слова. Не выдумывай чисел — только из ФАКТОВ. Это подписи на картинке: без LaTeX, без $ и без разметки — формулы и числа обычным текстом с символами Юникода (R² = 0,9999, a·e^(bt)).`,
    'Графический абстракт — схема «что сделали → как → что получили». Дай: headline (до 8 слов), steps — 3 или 4 шага, у каждого label (1–3 слова) и detail (до 10 слов, можно с ключевым числом из фактов), takeaway (главный вывод, до 12 слов).\n'
    + 'Формат: {"headline":"…","steps":[{"label":"…","detail":"…"}],"takeaway":"…"}\n\n'
    + `ПРОЕКТ «${input.title}»: ${input.description || '(без описания)'}\n\nАННОТАЦИЯ СТАТЬИ: ${input.abstract || '(нет)'}\n\nФАКТЫ:\n${input.facts}`,
  );
  return {
    headline: String(r.headline ?? input.title).slice(0, 120),
    steps: (r.steps ?? []).slice(0, 4).map((st) => ({ label: String(st?.label ?? '').slice(0, 40), detail: String(st?.detail ?? '').slice(0, 90) })),
    takeaway: String(r.takeaway ?? '').slice(0, 140),
  };
}

/** Заголовок раздела на языке статьи — для черновиков, если автор его стёр. */
export function titleFor(section: ArticleSection, lang: ArticleLang): string {
  return section.key === 'custom' ? section.title : section.title || sectionTitle(section.key, lang);
}

/** ID рисунков, которые можно упоминать: материалы проекта плюс уже вставленные в текст. */
export function allowedFigures(doc: ArticleDoc, items: ResearchItem[]): string[] {
  return [...new Set([...items.map((i) => i.id), ...figureOrder(doc.sections)])];
}
