import { activeProvider } from '../settings';
import { bindChat } from '../provider';
import { extractJson } from '../artifact';

/**
 * Уточняющий вопрос перед доработкой. Короткая просьба вроде «сделай быстрее» или
 * «добавь график» допускает несколько несовместимых прочтений, и модель раньше молча
 * выбирала одно из них — человек видел только изменившийся файл. Теперь неоднозначную
 * просьбу сначала переспрашиваем вариантами, как это делает редактор кода.
 *
 * Спрашиваем один раз и только до постановки задания: очередь и воркер тут не при чём,
 * это разговор, а не работа. Любой сбой модели означает «не спрашиваем» — доработка
 * важнее уточнения, и молчащий провайдер не должен блокировать правку.
 */

export interface Clarification {
  question: string;
  options: string[];
}

const SYSTEM = `Ты — инженер интерактивных учебных симуляций. Преподаватель прислал просьбу доработать
готовый тренажёр. Твоя задача — решить, понятно ли, что именно делать.

Переспрашивай только тогда, когда просьбу можно выполнить несколькими способами и результаты
заметно разойдутся: непонятно, какой объект менять, насколько сильно, или что именно показывать.
Если разумное прочтение одно — не переспрашивай, даже если формулировка короткая.

Ответь ТОЛЬКО JSON:
{"clear": true} — всё понятно, вопросов нет;
{"clear": false, "question": "вопрос в одну строку", "options": ["вариант", "вариант", "вариант"]}
Вариантов 2–4, каждый — готовое решение в 2–7 словах по-русски (не «да»/«нет»), варианты различны по сути.`;

export interface ClarifyInput {
  instruction: string;
  title: string;
  subject: string;
  /** Прошлые просьбы по этой симуляции: по ним видно, что уже обсуждалось. */
  past: string[];
}

export async function clarifyRefine(input: ClarifyInput): Promise<Clarification | null> {
  const provider = activeProvider();
  if (!provider) return null;
  const past = input.past.slice(-5).map((p) => `- ${p}`).join('\n');
  const user = `Тренажёр: ${input.title || 'без названия'}${input.subject ? ` (${input.subject})` : ''}
${past ? `Уже просили раньше:\n${past}\n` : ''}
Новая просьба: ${input.instruction}`;
  try {
    const chat = bindChat(provider, 'planner');
    const out = await chat([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ]);
    return readClarification(out);
  } catch {
    return null;
  }
}

/** Отдельно от сети — чтобы разбор ответа модели проверялся тестом. */
export function readClarification(out: string): Clarification | null {
  let raw: unknown;
  try {
    raw = extractJson<unknown>(out);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { clear, question, options } = raw as
    { clear?: unknown; question?: unknown; options?: unknown };
  if (clear !== false) return null;
  const text = typeof question === 'string' ? question.trim().slice(0, 200) : '';
  if (!text || !Array.isArray(options)) return null;
  const list: string[] = [];
  for (const o of options) {
    if (typeof o !== 'string') continue;
    const v = o.trim().slice(0, 80);
    if (v && !list.includes(v)) list.push(v);
    if (list.length === 4) break;
  }
  // Один вариант — это не выбор, а навязанное решение: такую «неоднозначность» игнорируем.
  return list.length >= 2 ? { question: text, options: list } : null;
}
