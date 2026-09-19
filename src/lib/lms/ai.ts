import { db } from '../db/client';
import { activeProvider, NO_PROVIDER_MESSAGE } from '../settings';
import { bindChat } from '../provider';
import { extractJson } from '../artifact';
import {
  sanitizeBlockBody, type AssignmentPayload, type BlockBody, type BlockKind,
} from './block-schema';
import { LmsError } from './types';

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
- "assignment": {"prompt": "...", "points": 10, "allowRetry": false, "explanation": "почему ответ такой", "spec": SPEC}
SPEC — один из:
- {"type": "choice", "multiple": false, "shuffle": true, "options": [{"text": "...", "correct": true}, ...]} — 3–5 вариантов, неправильные — правдоподобные, по типичным ошибкам учеников
- {"type": "number", "answer": 9.8, "tolerance": 0.1, "unit": "м/с²"}
- {"type": "short", "accepted": ["слово", "другое написание"]}
- {"type": "gaps", "text": "Период {{растёт|увеличивается}} при ..."} — пропуск в двойных фигурных скобках, варианты через |
- {"type": "match", "pairs": [{"left": "термин", "right": "определение"}, ...]} — 3–5 пар
- {"type": "order", "items": [{"text": "шаг 1"}, ...]} — в правильном порядке, 3–6 шагов
- {"type": "text"} — развёрнутый ответ, проверяет учитель`;

const SYSTEM = `Ты — методист и опытный учитель. Пишешь по-русски, коротко, точно и понятно ученику указанного класса.
Факты и числа проверяй: ошибка в учебном материале недопустима. Отвечай только JSON без пояснений вокруг.
${BLOCK_FORMAT}`;

async function ask(prompt: string): Promise<unknown> {
  const p = activeProvider();
  if (!p) throw new LmsError(NO_PROVIDER_MESSAGE);
  const chat = bindChat(p, 'planner');
  let out: string;
  try {
    out = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }]);
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

export interface LessonBrief { topic: string; subject: string; grade: string; wishes: string }

export async function draftLesson(b: LessonBrief): Promise<BlockBody[]> {
  const raw = await ask(`Собери урок.
Тема: ${b.topic}
Предмет: ${b.subject || 'не указан'}
Класс: ${b.grade || 'средняя школа'}
Пожелания учителя: ${b.wishes || 'нет'}

Верни {"blocks": [...]}: 1) короткое объяснение ("text", 120–220 слов), 2) определение или ключевая формула ("callout" или "formula"),
3) пример с решением в "spoiler", 4) 4–5 заданий разных типов (выбор, число, пропуски, сопоставление или порядок; одно — развёрнутый ответ).`);
  return toBlocks(raw, true);
}

export async function draftTasks(text: string, count: number): Promise<BlockBody[]> {
  const raw = await ask(`По этому материалу урока составь ${count} заданий разных типов, которые проверяют понимание, а не память.
Материал:
"""${text.slice(0, 6000)}"""

Верни {"blocks": [...]} только из блоков "assignment".`);
  return toBlocks(raw, false);
}

export async function draftVariants(p: AssignmentPayload, count: number): Promise<BlockBody[]> {
  const raw = await ask(`Сделай ${count} варианта этого задания для разных учеников: тот же тип и та же проверяемая идея,
но другие числа, объекты или формулировки. Правильные ответы пересчитай заново и проверь.
Исходное задание: ${JSON.stringify({ prompt: p.prompt, points: p.points, allowRetry: p.allowRetry, explanation: p.explanation, spec: p.spec })}

Верни {"blocks": [...]} из ${count} блоков "assignment" того же типа "${p.spec.type}".`);
  return toBlocks(raw, false).filter((b) => b.kind === 'assignment' && b.payload.spec.type === p.spec.type);
}

export interface GradeSuggestion { score: number; comment: string; marks: Record<string, number> }

/** Черновик оценки развёрнутого ответа. Балл зажат в пределы задания; решение — за учителем. */
export async function draftGrade(p: AssignmentPayload, answerText: string): Promise<GradeSuggestion> {
  const raw = await ask(`Оцени ответ ученика как строгий, но доброжелательный учитель.
Задание: ${p.prompt}
Максимум баллов: ${p.points}
${p.rubric.length ? `Критерии: ${JSON.stringify(p.rubric.map((r) => ({ id: r.id, label: r.label, points: r.points })))}` : ''}
${p.explanation ? `Эталон учителя: ${p.explanation}` : ''}
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
