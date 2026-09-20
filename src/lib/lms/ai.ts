import { db } from '../db/client';
import { activeProvider, NO_PROVIDER_MESSAGE } from '../settings';
import { bindChat } from '../provider';
import { extractJson } from '../artifact';
import {
  sanitizeBlockBody, type AssignmentPayload, type BlockBody, type BlockKind,
} from './block-schema';
import { LmsError } from './types';
import { LABS } from '../labs';
import { SLOT_META, type LessonSpec, type Slot, type SlotKind } from './lesson-builder';

/**
 * ИИ-помощник учителя: урок по теме, задания по тексту, варианты задания, черновик оценки.
 * Модель возвращает JSON; каждый блок проходит ту же санацию, что и ручной ввод, —
 * что не прошло, выбрасывается молча, а не ломает урок. Решает всегда учитель: помощник
 * только предлагает, блоки ложатся в тему обычными, их можно править и удалять.
 */

const MATERIAL_KINDS = new Set<BlockKind>(['text', 'callout', 'formula', 'spoiler']);

const BLOCK_FORMAT = `Каждый блок — объект {"kind": ..., "payload": ...}. Допустимые kind и payload:
- "text": {"title": "...", "body": "..."} — body в простой разметке: абзацы через пустую строку, **жирный**, *курсив*, "- " для списка, "## " для подзаголовка, формулы $...$ в строке.
- "callout": {"tone": "definition"|"important"|"warning"|"example"|"info", "title": "...", "body": "..."}
- "formula": {"latex": "LaTeX без $", "caption": "..."}
- "spoiler": {"title": "Показать решение", "body": "..."}
- "assignment": {"prompt": "...", "points": 10, "allowRetry": false, "explanation": "почему ответ такой", "spec": SPEC,
  "rubric": [{"label": "критерий", "points": 2}], "reference": "эталонный ответ"} — rubric и reference только для type "text" и "table", иначе [] и ""
  Если задание про измерение или эксперимент — сформулируй его так, чтобы ответ находился на интерактивном тренажёре.
SPEC — один из:
- {"type": "choice", "multiple": false, "shuffle": true, "options": [{"text": "...", "correct": true}, ...]} — 3–5 вариантов, неправильные — правдоподобные, по типичным ошибкам учеников
- {"type": "number", "answer": 9.8, "tolerance": 0.1, "unit": "м/с²"}
- {"type": "short", "accepted": ["слово", "другое написание"]}
- {"type": "gaps", "text": "Период {{растёт|увеличивается}} при ..."} — пропуск в двойных фигурных скобках, варианты через |
- {"type": "match", "pairs": [{"left": "термин", "right": "определение"}, ...]} — 3–5 пар
- {"type": "order", "items": [{"text": "шаг 1"}, ...]} — в правильном порядке, 3–6 шагов
- {"type": "table", "columns": [{"label": "Длина нити", "unit": "м"}, ...], "minRows": 5} — таблица измерений, 2–4 колонки, проверяет учитель
- {"type": "text"} — развёрнутый ответ, проверяет учитель`;

const SYSTEM = `Ты — методист и опытный учитель. Пишешь по-русски, коротко, точно и понятно ученику указанного класса.
Факты и числа проверяй: ошибка в учебном материале недопустима. Отвечай только JSON без пояснений вокруг.
${BLOCK_FORMAT}`;

/** Запрос к модели с ответом в JSON. system — роль модели; по умолчанию методист с форматом блоков. */
export async function askJson(prompt: string, system: string = SYSTEM): Promise<unknown> {
  const p = activeProvider();
  if (!p) throw new LmsError(NO_PROVIDER_MESSAGE);
  const chat = bindChat(p, 'planner');
  let out: string;
  try {
    out = await chat([{ role: 'system', content: system }, { role: 'user', content: prompt }]);
  } catch {
    throw new LmsError('Помощник сейчас недоступен. Попробуйте через минуту.');
  }
  try {
    return extractJson<unknown>(out);
  } catch {
    throw new LmsError('Помощник ответил не по формату. Попробуйте ещё раз.');
  }
}

/** Всё, что прошло санацию. Материалы — только разрешённых видов. */
function toBlocks(raw: unknown, allowMaterials: boolean): BlockBody[] {
  const list = typeof raw === 'object' && raw !== null && Array.isArray((raw as { blocks?: unknown }).blocks)
    ? (raw as { blocks: unknown[] }).blocks : [];
  const out: BlockBody[] = [];
  for (const item of list.slice(0, 16)) {
    if (typeof item !== 'object' || item === null) continue;
    const { kind, payload } = item as { kind?: unknown; payload?: unknown };
    const ok = kind === 'assignment' || (allowMaterials && typeof kind === 'string' && MATERIAL_KINDS.has(kind as BlockKind));
    if (!ok) continue;
    try {
      const body = sanitizeBlockBody(kind as BlockKind, payload);
      // Стенд модель выдумать не может: он указывает на реальные симуляции.
      if (body.kind === 'assignment') body.payload.stand = null;
      out.push(body);
    } catch { /* блок не прошёл проверку — пропускаем */ }
  }
  if (out.length === 0) throw new LmsError('Помощник не смог собрать ни одного годного блока. Уточните тему и попробуйте снова.');
  return out;
}

export interface LessonBrief { topic: string; subject: string; grade: string; wishes: string; exam?: boolean }

export async function draftLesson(b: LessonBrief): Promise<BlockBody[]> {
  if (b.exam) {
    const raw = await askJson(`Составь контрольную работу.
Тема: ${b.topic}
Предмет: ${b.subject || 'не указан'}
Класс: ${b.grade || 'средняя школа'}
Что проверить: ${b.wishes || 'основные понятия и умения темы'}

Верни {"blocks": [...]} из 6–8 блоков "assignment" нарастающей сложности: выбор, число, пропуски, сопоставление,
одна задача с развёрнутым решением (type "text"). У развёрнутых заданий заполни "rubric" (2–4 критерия,
сумма баллов = points) и "reference" — эталонное решение.`);
    return toBlocks(raw, false);
  }
  const raw = await askJson(`Собери урок.
Тема: ${b.topic}
Предмет: ${b.subject || 'не указан'}
Класс: ${b.grade || 'средняя школа'}
Пожелания учителя: ${b.wishes || 'нет'}

Верни {"blocks": [...]}: 1) короткое объяснение ("text", 120–220 слов), 2) определение или ключевая формула ("callout" или "formula"),
3) пример с решением в "spoiler", 4) 4–5 заданий разных типов (выбор, число, пропуски, сопоставление или порядок; одно — развёрнутый ответ).`);
  return toBlocks(raw, true);
}

export async function draftTasks(text: string, count: number): Promise<BlockBody[]> {
  const raw = await askJson(`По этому материалу урока составь ${count} заданий разных типов, которые проверяют понимание, а не память.
Материал:
"""${text.slice(0, 6000)}"""

Верни {"blocks": [...]} только из блоков "assignment".`);
  return toBlocks(raw, false);
}

export async function draftVariants(p: AssignmentPayload, count: number): Promise<BlockBody[]> {
  const raw = await askJson(`Сделай ${count} варианта этого задания для разных учеников: тот же тип и та же проверяемая идея,
но другие числа, объекты или формулировки. Правильные ответы пересчитай заново и проверь.
Исходное задание: ${JSON.stringify({ prompt: p.prompt, points: p.points, allowRetry: p.allowRetry, explanation: p.explanation, spec: p.spec })}

Верни {"blocks": [...]} из ${count} блоков "assignment" того же типа "${p.spec.type}".`);
  return toBlocks(raw, false).filter((b) => b.kind === 'assignment' && b.payload.spec.type === p.spec.type);
}

export interface GradeSuggestion { score: number; comment: string; marks: Record<string, number> }

/** Черновик оценки развёрнутого ответа. Балл зажат в пределы задания; решение — за учителем. */
export async function draftGrade(p: AssignmentPayload, answerText: string): Promise<GradeSuggestion> {
  const raw = await askJson(`Оцени ответ ученика как строгий, но доброжелательный учитель.
Задание: ${p.prompt}
Максимум баллов: ${p.points}
${p.rubric.length ? `Критерии: ${JSON.stringify(p.rubric.map((r) => ({ id: r.id, label: r.label, points: r.points })))}` : ''}
${p.reference ? `Эталонный ответ учителя: ${p.reference.slice(0, 3000)}` : ''}
${p.explanation ? `Пояснение учителя: ${p.explanation}` : ''}
Ответ ученика:
"""${answerText.slice(0, 5000)}"""

Верни {"score": число, "comment": "2–3 предложения ученику: что верно и что поправить", "marks": {"id критерия": баллы}}.
Если критериев нет — marks пустой объект.`) as Partial<GradeSuggestion>;
  const clamp = (n: unknown, max: number) => Math.max(0, Math.min(max, Math.round((Number(n) || 0) * 2) / 2));
  const marks: Record<string, number> = {};
  for (const r of p.rubric) if (raw.marks && r.id in raw.marks) marks[r.id] = clamp(raw.marks[r.id], r.points);
  return {
    score: p.rubric.length && Object.keys(marks).length === p.rubric.length
      ? Math.min(p.points, Object.values(marks).reduce((a, v) => a + v, 0)) : clamp(raw.score, p.points),
    comment: typeof raw.comment === 'string' ? raw.comment.slice(0, 1500) : '',
    marks,
  };
}

/** Тренажёр под тему урока: своя библиотека учителя или общий каталог, по словам из названия. */
export async function suggestSimulation(userId: string, topic: string): Promise<string | null> {
  const words = topic.toLowerCase().split(/[^a-zа-яё0-9]+/i).filter((w) => w.length >= 5).map((w) => `%${w.slice(0, 6)}%`);
  if (words.length === 0) return null;
  const { rows } = await db().query<{ id: string }>(
    `SELECT id FROM simulations WHERE (owner_id = $1 OR visibility = 'catalog') AND lower(title) LIKE ANY($2::text[])
     ORDER BY (owner_id = $1) DESC, updated_at DESC LIMIT 1`, [userId, words]);
  return rows[0]?.id ?? null;
}

/* ------------------------------ курс из программы ------------------------------ */

export interface PlanTopic { title: string; goals: string; format: 'lesson' | 'exam'; hours: number }
export interface CoursePlan { title: string; subject: string; grade: string; description: string; topics: PlanTopic[] }

const PLAN_SYSTEM = `Ты — завуч-методист. Превращаешь учебную программу (КТП, список тем, оглавление учебника или просто описание)
в план онлайн-курса. Пишешь по-русски. Отвечай только JSON без пояснений вокруг.`;

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** План курса по программе: темы с целями, контрольные — отдельными темами. Ничего не сохраняет. */
export async function draftCoursePlan(input: {
  program: string; subject: string; grade: string; weeks: number; wishes: string;
}): Promise<CoursePlan> {
  const raw = await askJson(`Составь план курса.
Предмет: ${input.subject || 'определи по программе'}
Класс: ${input.grade || 'определи по программе'}
Сколько недель/уроков примерно: ${input.weeks || 'по программе'}
Пожелания учителя: ${input.wishes || 'нет'}
Программа:
"""${input.program.slice(0, 12000)}"""

Верни {"title": "Предмет N: раздел", "subject": "Физика", "grade": "8 класс", "description": "1–2 предложения",
"topics": [{"title": "короткое название темы", "goals": "что ученик должен понять и уметь, 1–2 предложения", "format": "lesson" | "exam", "hours": 1}]}.
Темы — в порядке прохождения, 4–20 штук. После каждого крупного раздела добавь тему "exam" — контрольную по разделу.
Не выдумывай темы вне программы.`, PLAN_SYSTEM) as Record<string, unknown>;
  const topics = (Array.isArray(raw.topics) ? raw.topics : []).slice(0, 24).flatMap((t): PlanTopic[] => {
    const o = (typeof t === 'object' && t !== null ? t : {}) as Record<string, unknown>;
    const title = clip(o.title, 200);
    if (!title) return [];
    const hours = Number(o.hours);
    return [{ title, goals: clip(o.goals, 600), format: o.format === 'exam' ? 'exam' : 'lesson', hours: Number.isFinite(hours) ? Math.max(1, Math.min(10, Math.round(hours))) : 1 }];
  });
  if (topics.length === 0) throw new LmsError('Помощник не нашёл тем в программе. Вставьте список тем или оглавление подробнее.');
  return {
    title: clip(raw.title, 200) || 'Новый курс', subject: clip(raw.subject, 60) || input.subject,
    grade: clip(raw.grade, 40) || input.grade, description: clip(raw.description, 2000), topics,
  };
}

/* -------------------------- критерии и эталонный ответ -------------------------- */

export interface RubricDraft { rubric: { label: string; points: number }[]; reference: string }

/** Критерии с баллами (сумма = points) и эталонный ответ «на отлично» с пометкой, что отличает ответ «на 3». */
export async function draftRubric(input: { prompt: string; points: number; subject: string; type: string }): Promise<RubricDraft> {
  const raw = await askJson(`Для задания составь критерии оценивания и эталонный ответ.
Предмет: ${input.subject || 'не указан'}
Тип ответа: ${input.type === 'table' ? 'таблица измерений' : 'развёрнутый ответ'}
Максимум баллов: ${input.points}
Задание:
"""${input.prompt.slice(0, 4000)}"""

Верни {"rubric": [{"label": "что проверяем, коротко и проверяемо", "points": число}], "reference": "..."}.
2–5 критериев, сумма баллов строго ${input.points}. В "reference": сначала "Ответ на отлично:" — полный эталонный ответ,
затем "Ответ на удовлетворительно:" — каким он обычно бывает и чего в нём не хватает, затем "Типичные ошибки:" — 2–3 пункта.`,
  'Ты — опытный учитель и эксперт по оцениванию. Пишешь по-русски. Отвечай только JSON без пояснений вокруг.') as Record<string, unknown>;
  const items = (Array.isArray(raw.rubric) ? raw.rubric : []).slice(0, 8).flatMap((r) => {
    const o = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>;
    const label = clip(o.label, 300);
    const pts = Number(o.points);
    return label && pts > 0 ? [{ label, points: Math.round(pts * 2) / 2 }] : [];
  });
  // Сумма критериев должна совпасть с максимумом задания: остаток — последнему критерию.
  const sum = items.reduce((a, r) => a + r.points, 0);
  if (items.length && sum !== input.points) {
    const last = items[items.length - 1];
    last.points = Math.max(0.5, last.points + input.points - sum);
  }
  const reference = clip(raw.reference, 10000);
  if (!items.length && !reference) throw new LmsError('Помощник не смог составить критерии. Уточните текст задания.');
  return { rubric: items, reference };
}

/* -------------------------- симуляция под задание -------------------------- */

/** Описание тренажёра для мастерской: что на экране, какие ползунки и что ученик должен измерить. */
export async function draftSimulationBrief(p: AssignmentPayload, subject: string): Promise<string> {
  const raw = await askJson(`Учитель хочет интерактивную симуляцию, на которой ученик выполнит это задание.
Предмет: ${subject || 'не указан'}
Задание: ${p.prompt.slice(0, 3000)}
${p.spec.type === 'number' ? `Правильный ответ: ${p.spec.answer} ${p.spec.unit}` : ''}

Опиши симуляцию для генератора одним абзацем 60–120 слов: что изображено, какие параметры ученик меняет ползунками
(с диапазонами и единицами), какие величины показываются на экране и как с их помощью найти ответ.
Не раскрывай сам ответ. Верни {"brief": "..."}.`,
  'Ты — методист, который ставит задачи разработчику учебных симуляций. Пишешь по-русски. Отвечай только JSON.') as Record<string, unknown>;
  const brief = clip(raw.brief, 1500);
  if (!brief) throw new LmsError('Помощник не смог описать тренажёр. Попробуйте ещё раз.');
  return brief;
}

/* ----------------------------- конструктор урока ----------------------------- */

const SLOT_BRIEF: Record<SlotKind, (s: Slot) => string> = {
  hook: () => '1 блок "callout" (tone "example"): вопрос или ситуация из жизни, с которой начинается урок',
  explain: () => '1–2 блока "text": основное объяснение с подзаголовками "## ", формулами $...$ и примерами',
  definition: () => '1 блок "callout" (tone "definition"): ключевое определение',
  formula: () => '1 блок "formula": главная формула, в caption — что означает каждая буква и единицы',
  example: (s) => `${s.count} блок(а) "spoiler": в title — условие задачи коротко, в body — подробное решение с ответом`,
  important: () => '1 блок "callout" (tone "important"): что важно запомнить и типичные ошибки',
  summary: () => '1 блок "callout" (tone "info", title "Итоги урока"): 3–5 пунктов списком',
  tasks: (s) => `${s.count} блок(а) "assignment" с автопроверкой, тип: ${s.taskType === 'mix' ? 'разные (choice, number, gaps, match, order, short)' : s.taskType}; сложность нарастает`,
  check: (s) => `${s.count} блок(а) "assignment" "Проверь себя": короткие вопросы на понимание (choice или short), points 1, allowRetry true`,
  essay: () => '1 блок "assignment" со spec {"type":"text"}: объяснить своими словами; заполни rubric (2–4 критерия, сумма = points) и reference — эталонный ответ',
  lab_table: () => '1 блок "assignment" со spec {"type":"table","columns":[{"label":"величина","unit":"ед."}, ...],"minRows":5}: таблица измерений опыта; в prompt — что измерить и как',
  simulation: () => '', video: () => '', lab: () => '',
};

const LEVEL_TEXT: Record<LessonSpec['level'], string> = {
  basic: 'базовый: проще язык, больше пояснений, задачи в одно действие',
  standard: 'стандартный: как в хорошем учебнике',
  advanced: 'углублённый: строже, задачи в несколько действий, связи с другими темами',
};

/**
 * Урок по конструктору: слоты идут в заданном порядке. Модель пишет текстовые слоты
 * и помечает каждый блок номером слота; тренажёр, видео и лабораторию ставит сервер.
 */
export async function draftLessonFromSpec(spec: LessonSpec, subject: string, userId: string): Promise<BlockBody[]> {
  const llmSlots = spec.slots.map((s, i) => ({ s, i })).filter(({ s }) => SLOT_META[s.kind].llm);
  const bySlot = new Map<number, BlockBody[]>();
  if (llmSlots.length) {
    const plan = spec.slots.map((s, i) => SLOT_META[s.kind].llm
      ? `${i}. ${SLOT_META[s.kind].label}: ${SLOT_BRIEF[s.kind](s)}${s.note ? `. Пожелание учителя: ${s.note}` : ''}`
      : `${i}. ${SLOT_META[s.kind].label} — вставит учитель, ничего не пиши`).join('\n');
    const raw = await askJson(`Собери ${spec.exam ? 'контрольную работу' : 'урок'} строго по плану учителя.
Тема: ${spec.title}
Предмет: ${subject || 'не указан'}
Класс: ${spec.grade || 'средняя школа'}
Уровень: ${LEVEL_TEXT[spec.level]}
Длительность: около ${spec.minutes} минут
${spec.goals ? `Цели урока: ${spec.goals}` : ''}
${spec.materials ? `Материалы учителя — опирайся на них, бери факты, примеры и задачи отсюда:\n"""${spec.materials.slice(0, 10000)}"""` : ''}

План (номер слота. что нужно):
${plan}

Верни {"blocks": [{"slot": номер_слота, "kind": ..., "payload": ...}, ...]} — блоки в порядке слотов.
Блоки следующего слота учитывают предыдущие: задания проверяют то, что объяснено выше.`) as { blocks?: unknown };
    const list = Array.isArray(raw.blocks) ? raw.blocks : [];
    for (const item of list.slice(0, 40)) {
      if (typeof item !== 'object' || item === null) continue;
      const { slot, kind, payload } = item as { slot?: unknown; kind?: unknown; payload?: unknown };
      const index = Number(slot);
      if (!Number.isInteger(index) || !llmSlots.some((x) => x.i === index)) continue;
      if (kind !== 'assignment' && !(typeof kind === 'string' && MATERIAL_KINDS.has(kind as BlockKind))) continue;
      try {
        const body = sanitizeBlockBody(kind as BlockKind, payload);
        if (body.kind === 'assignment') body.payload.stand = null;
        bySlot.set(index, [...(bySlot.get(index) ?? []), body]);
      } catch { /* блок не прошёл проверку — пропускаем */ }
    }
    if (bySlot.size === 0) throw new LmsError('Помощник не смог собрать урок. Уточните тему или материалы и попробуйте снова.');
  }
  const out: BlockBody[] = [];
  for (const [i, s] of spec.slots.entries()) {
    if (s.kind === 'simulation') {
      const sim = await suggestSimulation(userId, `${spec.title} ${s.note}`);
      out.push({ kind: 'simulation', payload: { simulationId: sim, caption: s.note || 'Попробуйте сами: меняйте параметры и наблюдайте.', preset: {}, locked: [] } });
    } else if (s.kind === 'video') {
      try {
        out.push(sanitizeBlockBody('video', { url: spec.videoUrl, caption: s.note || 'Посмотрите видео и ответьте на вопросы ниже.' }));
      } catch {
        out.push(sanitizeBlockBody('video', { url: '', caption: s.note || 'Вставьте ссылку на видео.' }));
      }
    } else if (s.kind === 'lab') {
      const slug = LABS.some((l) => l.slug === spec.labSlug) ? spec.labSlug : LABS[0].slug;
      out.push(sanitizeBlockBody('lab', { slug, caption: s.note }));
    } else {
      out.push(...(bySlot.get(i) ?? []));
    }
  }
  return out;
}

/* ------------------------------ паспорт курса ------------------------------ */

/** Описание курса для учеников: о чём курс, что будут уметь, как устроен. */
export async function draftCourseDescription(c: { title: string; subject: string; grade: string; topics: string[]; wishes: string }): Promise<string> {
  const raw = await askJson(`Напиши описание курса для страницы курса — его читают ученики и родители.
Курс: ${c.title}
Предмет: ${c.subject || 'не указан'}
Класс: ${c.grade || 'не указан'}
${c.topics.length ? `Темы: ${c.topics.slice(0, 30).join('; ')}` : ''}
${c.wishes ? `Пожелания учителя: ${c.wishes}` : ''}

3–5 предложений простым живым языком: о чём курс, что ученик будет понимать и уметь в конце, как он устроен
(интерактивные тренажёры, задания с проверкой, контрольные). Без канцелярита и без обещаний, которых нет в темах.
Верни {"description": "..."}.`, PLAN_SYSTEM) as Record<string, unknown>;
  const text = clip(raw.description, 2000);
  if (!text) throw new LmsError('Помощник не смог написать описание. Попробуйте ещё раз.');
  return text;
}

/** План тем по названию курса: продолжает уже созданные темы, не повторяя их. */
export async function draftCourseOutline(c: {
  title: string; subject: string; grade: string; existing: string[]; lessons: number; wishes: string;
}): Promise<PlanTopic[]> {
  const plan = await draftCoursePlan({
    program: `Курс «${c.title}»${c.subject ? `, предмет ${c.subject}` : ''}${c.grade ? `, ${c.grade}` : ''}.
Составь программу курса по стандартной школьной программе этого предмета и класса.
${c.existing.length ? `Уже есть темы (не повторяй их, продолжай после них): ${c.existing.join('; ')}` : ''}`,
    subject: c.subject, grade: c.grade, weeks: c.lessons, wishes: c.wishes,
  });
  const have = new Set(c.existing.map((t) => t.trim().toLowerCase()));
  return plan.topics.filter((t) => !have.has(t.title.trim().toLowerCase()));
}
