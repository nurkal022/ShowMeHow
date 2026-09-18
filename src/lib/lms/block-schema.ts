import { LABS } from '../labs';
import { sanitizeTargets, type SimTarget } from './sim-state';
import { LIMITS, LmsError, optionalText, requireText } from './types';

/**
 * Что лежит в blocks.payload. Санация по белому списку, как у настроек
 * организации: неизвестные поля в базу не попадают. Модуль чистый — его
 * импортируют клиентские редакторы. Ученику задание отдаётся только через
 * toStudentBody: правильных ответов в нём нет.
 */

export type BlockKind =
  | 'text' | 'simulation' | 'lab' | 'assignment'
  | 'callout' | 'formula' | 'image' | 'video' | 'spoiler' | 'code' | 'divider';
export const BLOCK_KINDS: readonly BlockKind[] = [
  'text', 'callout', 'formula', 'image', 'video', 'code', 'spoiler', 'divider', 'simulation', 'lab', 'assignment',
];
export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  text: 'Текст',
  callout: 'Врезка',
  formula: 'Формула',
  image: 'Картинка',
  video: 'Видео',
  code: 'Код',
  spoiler: 'Спойлер',
  divider: 'Разделитель',
  simulation: 'Тренажёр',
  lab: 'Лаборатория',
  assignment: 'Задание',
};

export function isBlockKind(v: unknown): v is BlockKind {
  return typeof v === 'string' && (BLOCK_KINDS as readonly string[]).includes(v);
}

export interface TextPayload { title: string; body: string }
export interface SimulationPayload { simulationId: string | null; caption: string }
export interface LabPayload { slug: string; caption: string }
export type CalloutTone = 'info' | 'definition' | 'important' | 'warning' | 'example';
export const CALLOUT_TONES: readonly CalloutTone[] = ['info', 'definition', 'important', 'warning', 'example'];
export const CALLOUT_TONE_LABELS: Record<CalloutTone, string> = {
  info: 'Заметка', definition: 'Определение', important: 'Важно', warning: 'Осторожно', example: 'Пример',
};
export interface CalloutPayload { tone: CalloutTone; title: string; body: string }
export interface FormulaPayload { latex: string; caption: string }
export interface ImagePayload { src: string; alt: string; caption: string; wide: boolean }
export interface VideoPayload { url: string; caption: string }
export interface SpoilerPayload { title: string; body: string }
export interface CodePayload { language: string; code: string }
export type DividerPayload = Record<string, never>;
export type Stand = { kind: 'simulation'; simulationId: string } | { kind: 'lab'; slug: string } | null;
export interface ChoiceOption { id: string; text: string; correct: boolean }

export interface MatchPair { id: string; left: string; rightId: string; right: string }
export interface OrderItem { id: string; text: string }

export type AssignmentSpec =
  | { type: 'choice'; multiple: boolean; shuffle: boolean; options: ChoiceOption[] }
  | { type: 'short'; accepted: string[] }
  | { type: 'gaps'; text: string }
  | { type: 'match'; pairs: MatchPair[] }
  | { type: 'order'; items: OrderItem[] }
  | { type: 'number'; answer: number; tolerance: number; unit: string }
  | { type: 'text' }
  | { type: 'sim_state'; simulationId: string; targets: SimTarget[]; showHints: boolean };
export type AssignmentType = AssignmentSpec['type'];
export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  choice: 'Выбор варианта',
  short: 'Короткий ответ',
  gaps: 'Пропуски в тексте',
  match: 'Сопоставление',
  order: 'Порядок',
  number: 'Число',
  text: 'Развёрнутый ответ',
  sim_state: 'Состояние симуляции',
};

export interface AssignmentPayload {
  prompt: string;
  points: number;
  stand: Stand;
  allowRetry: boolean;
  /** Пояснение к правильному ответу: ученик видит его только после проверки. */
  explanation: string;
  spec: AssignmentSpec;
}

export const DEFAULT_POINTS = 10;

export type BlockBody =
  | { kind: 'text'; payload: TextPayload }
  | { kind: 'simulation'; payload: SimulationPayload }
  | { kind: 'lab'; payload: LabPayload }
  | { kind: 'callout'; payload: CalloutPayload }
  | { kind: 'formula'; payload: FormulaPayload }
  | { kind: 'image'; payload: ImagePayload }
  | { kind: 'video'; payload: VideoPayload }
  | { kind: 'spoiler'; payload: SpoilerPayload }
  | { kind: 'code'; payload: CodePayload }
  | { kind: 'divider'; payload: DividerPayload }
  | { kind: 'assignment'; payload: AssignmentPayload };

export type StudentAssignmentSpec =
  | { type: 'choice'; multiple: boolean; options: { id: string; text: string }[] }
  | { type: 'short' }
  /** parts — куски текста между пропусками: пропусков на один меньше. */
  | { type: 'gaps'; parts: string[] }
  | { type: 'match'; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { type: 'order'; items: OrderItem[] }
  | { type: 'number'; unit: string }
  | { type: 'text' }
  /** Значений цели здесь нет; имена параметров — только если учитель разрешил подсказки. */
  | { type: 'sim_state'; simulationId: string; showHints: boolean; targets?: { name: string; label: string }[] };

export interface StudentAssignmentPayload {
  prompt: string;
  points: number;
  stand: Stand;
  allowRetry: boolean;
  spec: StudentAssignmentSpec;
  /** Только после проверки (см. revealFor): пояснение и учительская схема с ключом. */
  explanation?: string;
  solution?: AssignmentSpec;
}

export type StudentBlockBody =
  | Exclude<BlockBody, { kind: 'assignment' }>
  | { kind: 'assignment'; payload: StudentAssignmentPayload };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTION_ID_RE = /^[a-z0-9]{1,16}$/;
const LAB_SLUGS = new Set(LABS.map((l) => l.slug));

export function defaultBody(kind: BlockKind): BlockBody {
  switch (kind) {
    case 'text':
      return { kind, payload: { title: '', body: '' } };
    case 'simulation':
      return { kind, payload: { simulationId: null, caption: '' } };
    case 'lab':
      return { kind, payload: { slug: LABS[0].slug, caption: '' } };
    case 'callout':
      return { kind, payload: { tone: 'info', title: '', body: '' } };
    case 'formula':
      return { kind, payload: { latex: '', caption: '' } };
    case 'image':
      return { kind, payload: { src: '', alt: '', caption: '', wide: false } };
    case 'video':
      return { kind, payload: { url: '', caption: '' } };
    case 'spoiler':
      return { kind, payload: { title: '', body: '' } };
    case 'code':
      return { kind, payload: { language: '', code: '' } };
    case 'divider':
      return { kind, payload: {} };
    case 'assignment':
      return { kind, payload: {
        prompt: 'Новое задание', points: DEFAULT_POINTS, stand: null, allowRetry: false, explanation: '',
        spec: { type: 'text' },
      } };
  }
}

/* ------------------------------ пропуски ------------------------------- */

const GAP_RE = /\{\{([^{}]*)\}\}/g;
export const GAP_LIMITS = { maxGaps: 20, answer: 100 } as const;

/** «Период {{растёт|увеличивается}}» → куски текста и допустимые ответы каждого пропуска. */
export function parseGaps(text: string): { parts: string[]; answers: string[][] } {
  const parts: string[] = [];
  const answers: string[][] = [];
  let last = 0;
  for (const m of text.matchAll(GAP_RE)) {
    parts.push(text.slice(last, m.index));
    answers.push(m[1].split('|').map((a) => a.trim()).filter(Boolean));
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return { parts, answers };
}

/** Сравнение слов без учёта регистра, «ё» и лишних пробелов. */
export function normalizeWord(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
}

/** Перемешивание, одинаковое при каждом показе: зерно — сами идентификаторы. */
export function stableShuffle<T extends { id: string }>(items: T[]): T[] {
  let seed = 2166136261;
  for (const it of items) for (const ch of it.id) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Случайно получился исходный порядок — сдвигаем, иначе «порядок» решён заранее.
  if (out.length > 1 && out.every((it, i) => it === items[i])) out.push(out.shift() as T);
  return out;
}

function obj(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new LmsError('Некорректные данные блока.');
  }
  return raw as Record<string, unknown>;
}

/** Число из формы: принимает и строку с запятой. */
function finite(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sanitizeStand(raw: unknown): Stand {
  if (raw === null || raw === undefined) return null;
  const s = obj(raw);
  if (s.kind === 'simulation' && typeof s.simulationId === 'string' && UUID_RE.test(s.simulationId)) {
    return { kind: 'simulation', simulationId: s.simulationId.toLowerCase() };
  }
  if (s.kind === 'lab' && typeof s.slug === 'string' && LAB_SLUGS.has(s.slug)) {
    return { kind: 'lab', slug: s.slug };
  }
  throw new LmsError('Стенд задания указан неверно.');
}

function sanitizeOptions(raw: unknown, multiple: boolean): ChoiceOption[] {
  if (!Array.isArray(raw) || raw.length < LIMITS.minOptions || raw.length > LIMITS.maxOptions) {
    throw new LmsError(`Вариантов должно быть от ${LIMITS.minOptions} до ${LIMITS.maxOptions}.`);
  }
  const used = new Set<string>();
  const options = raw.map((item, i): ChoiceOption => {
    const o = obj(item);
    const text = requireText(o.text, LIMITS.option, `Вариант ${i + 1}`);
    let id = typeof o.id === 'string' && OPTION_ID_RE.test(o.id) ? o.id : `o${i + 1}`;
    let k = i + 1;
    while (used.has(id)) id = `o${++k}`;
    used.add(id);
    return { id, text, correct: o.correct === true };
  });
  const correct = options.filter((o) => o.correct).length;
  if (correct === 0) throw new LmsError('Отметьте хотя бы один правильный вариант.');
  if (!multiple && correct > 1) {
    throw new LmsError('В задании с одним ответом правильный вариант должен быть один.');
  }
  return options;
}

function sanitizeSpec(raw: unknown): AssignmentSpec {
  const s = obj(raw);
  if (s.type === 'choice') {
    const multiple = s.multiple === true;
    return { type: 'choice', multiple, shuffle: s.shuffle === true, options: sanitizeOptions(s.options, multiple) };
  }
  if (s.type === 'short') {
    const accepted = (Array.isArray(s.accepted) ? s.accepted : [])
      .filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean);
    if (accepted.length === 0) throw new LmsError('Укажите хотя бы один правильный ответ.');
    if (accepted.length > LIMITS.maxOptions) throw new LmsError(`Вариантов ответа — не больше ${LIMITS.maxOptions}.`);
    if (accepted.some((a) => a.length > GAP_LIMITS.answer)) throw new LmsError(`Ответ — не длиннее ${GAP_LIMITS.answer} символов.`);
    return { type: 'short', accepted: [...new Set(accepted)] };
  }
  if (s.type === 'gaps') {
    const text = requireText(s.text, LIMITS.text, 'Текст с пропусками');
    const { answers } = parseGaps(text);
    if (answers.length === 0) throw new LmsError('Отметьте хотя бы один пропуск: {{правильное слово}}.');
    if (answers.length > GAP_LIMITS.maxGaps) throw new LmsError(`Пропусков — не больше ${GAP_LIMITS.maxGaps}.`);
    if (answers.some((a) => a.length === 0)) throw new LmsError('В каждом пропуске должен быть ответ: {{слово}}.');
    return { type: 'gaps', text };
  }
  if (s.type === 'match') {
    if (!Array.isArray(s.pairs) || s.pairs.length < LIMITS.minOptions || s.pairs.length > LIMITS.maxOptions) {
      throw new LmsError(`Пар должно быть от ${LIMITS.minOptions} до ${LIMITS.maxOptions}.`);
    }
    const used = new Set<string>();
    const fresh = (want: unknown, prefix: string, i: number): string => {
      let id = typeof want === 'string' && OPTION_ID_RE.test(want) ? want : `${prefix}${i + 1}`;
      let k = i + 1;
      while (used.has(id)) id = `${prefix}${++k}`;
      used.add(id);
      return id;
    };
    return { type: 'match', pairs: s.pairs.map((item, i): MatchPair => {
      const o = obj(item);
      return {
        id: fresh(o.id, 'l', i), left: requireText(o.left, LIMITS.option, `Пара ${i + 1}, слева`),
        rightId: fresh(o.rightId, 'r', i), right: requireText(o.right, LIMITS.option, `Пара ${i + 1}, справа`),
      };
    }) };
  }
  if (s.type === 'order') {
    if (!Array.isArray(s.items) || s.items.length < LIMITS.minOptions || s.items.length > LIMITS.maxOptions) {
      throw new LmsError(`Шагов должно быть от ${LIMITS.minOptions} до ${LIMITS.maxOptions}.`);
    }
    const used = new Set<string>();
    return { type: 'order', items: s.items.map((item, i): OrderItem => {
      const o = obj(item);
      let id = typeof o.id === 'string' && OPTION_ID_RE.test(o.id) ? o.id : `s${i + 1}`;
      let k = i + 1;
      while (used.has(id)) id = `s${++k}`;
      used.add(id);
      return { id, text: requireText(o.text, LIMITS.option, `Шаг ${i + 1}`) };
    }) };
  }
  if (s.type === 'number') {
    const answer = finite(s.answer);
    if (answer === null) throw new LmsError('Укажите правильное число.');
    const tolerance = s.tolerance === undefined || s.tolerance === '' ? 0 : finite(s.tolerance);
    if (tolerance === null || tolerance < 0) throw new LmsError('Допуск — неотрицательное число.');
    return { type: 'number', answer, tolerance, unit: optionalText(s.unit, LIMITS.unit, 'Единицы') };
  }
  if (s.type === 'text') return { type: 'text' };
  if (s.type === 'sim_state') {
    if (typeof s.simulationId !== 'string' || !UUID_RE.test(s.simulationId)) {
      throw new LmsError('Выберите симуляцию для задания.');
    }
    return {
      type: 'sim_state', simulationId: s.simulationId.toLowerCase(),
      targets: sanitizeTargets(s.targets), showHints: s.showHints !== false,
    };
  }
  throw new LmsError('Неизвестный тип задания.');
}

export const MEDIA_LIMITS = { latex: 2000, url: 500 } as const;
const IMAGE_SRC_RE = /^(https:\/\/[^\s"'<>]+|\/api\/lms\/assets\/[0-9a-f-]{36})$/i;

export type VideoEmbed = { kind: 'iframe'; src: string } | { kind: 'file'; src: string };

/** Ссылка учителя → то, что можно встроить. null — источник не поддерживается. */
export function videoEmbed(url: string): VideoEmbed | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  const start = Number.parseInt(u.searchParams.get('t') ?? u.searchParams.get('start') ?? '', 10);
  const from = Number.isFinite(start) && start > 0 ? `?start=${start}` : '';
  if (host === 'youtu.be' && /^\/[\w-]{6,20}$/.test(u.pathname)) {
    return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed${u.pathname}${from}` };
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.pathname === '/watch' ? u.searchParams.get('v')
      : /^\/(embed|shorts|live)\/([\w-]{6,20})/.exec(u.pathname)?.[2];
    return id && /^[\w-]{6,20}$/.test(id) ? { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}${from}` } : null;
  }
  if (host === 'vimeo.com' && /^\/\d+$/.test(u.pathname)) return { kind: 'iframe', src: `https://player.vimeo.com/video${u.pathname}` };
  if (host === 'rutube.ru') {
    const id = /^\/video\/([0-9a-f]{32})/.exec(u.pathname)?.[1];
    return id ? { kind: 'iframe', src: `https://rutube.ru/play/embed/${id}` } : null;
  }
  if (/\.(mp4|webm)$/i.test(u.pathname)) return { kind: 'file', src: u.toString() };
  return null;
}

export function sanitizeBlockBody(kind: BlockKind, raw: unknown): BlockBody {
  const p = obj(raw);
  switch (kind) {
    case 'text':
      return { kind, payload: {
        title: optionalText(p.title, LIMITS.title, 'Заголовок'),
        body: optionalText(p.body, LIMITS.text, 'Текст'),
      } };
    case 'simulation': {
      const id = p.simulationId;
      if (id !== null && id !== undefined && (typeof id !== 'string' || !UUID_RE.test(id))) {
        throw new LmsError('Тренажёр указан неверно.');
      }
      return { kind, payload: {
        simulationId: typeof id === 'string' ? id.toLowerCase() : null,
        caption: optionalText(p.caption, LIMITS.caption, 'Подпись'),
      } };
    }
    case 'lab':
      if (typeof p.slug !== 'string' || !LAB_SLUGS.has(p.slug)) {
        throw new LmsError('Выберите лабораторию из списка.');
      }
      return { kind, payload: { slug: p.slug, caption: optionalText(p.caption, LIMITS.caption, 'Подпись') } };
    case 'callout':
      return { kind, payload: {
        tone: (CALLOUT_TONES as readonly unknown[]).includes(p.tone) ? p.tone as CalloutTone : 'info',
        title: optionalText(p.title, LIMITS.title, 'Заголовок'),
        body: optionalText(p.body, LIMITS.text, 'Текст'),
      } };
    case 'formula':
      return { kind, payload: {
        latex: optionalText(p.latex, MEDIA_LIMITS.latex, 'Формула'),
        caption: optionalText(p.caption, LIMITS.caption, 'Подпись'),
      } };
    case 'image': {
      const src = optionalText(p.src, MEDIA_LIMITS.url, 'Адрес картинки');
      if (src && !IMAGE_SRC_RE.test(src)) throw new LmsError('Картинка — загруженный файл или ссылка https://…');
      return { kind, payload: {
        src, alt: optionalText(p.alt, LIMITS.caption, 'Описание'),
        caption: optionalText(p.caption, LIMITS.caption, 'Подпись'), wide: p.wide === true,
      } };
    }
    case 'video': {
      const url = optionalText(p.url, MEDIA_LIMITS.url, 'Ссылка на видео');
      if (url && !videoEmbed(url)) throw new LmsError('Поддерживаются ссылки YouTube, Vimeo, Rutube и прямые ссылки на .mp4/.webm.');
      return { kind, payload: { url, caption: optionalText(p.caption, LIMITS.caption, 'Подпись') } };
    }
    case 'spoiler':
      return { kind, payload: {
        title: optionalText(p.title, LIMITS.title, 'Заголовок'),
        body: optionalText(p.body, LIMITS.text, 'Текст'),
      } };
    case 'code': {
      if (p.code !== undefined && typeof p.code !== 'string') throw new LmsError('Код должен быть текстом.');
      const code = (p.code as string | undefined) ?? '';
      if (code.length > LIMITS.text) throw new LmsError(`Код — не длиннее ${LIMITS.text} символов.`);
      return { kind, payload: { language: optionalText(p.language, 30, 'Язык'), code } };
    }
    case 'divider':
      return { kind, payload: {} };
    case 'assignment': {
      const points = p.points === undefined ? DEFAULT_POINTS : p.points;
      if (typeof points !== 'number' || !Number.isInteger(points) || points < 0 || points > LIMITS.maxPoints) {
        throw new LmsError(`Баллы — целое число от 0 до ${LIMITS.maxPoints}.`);
      }
      const spec = sanitizeSpec(p.spec);
      return { kind, payload: {
        prompt: requireText(p.prompt, LIMITS.text, 'Текст задания'),
        points,
        // Симуляция задания-состояния уже стоит в карточке: второй стенд не нужен.
        stand: spec.type === 'sim_state' ? null : sanitizeStand(p.stand),
        allowRetry: p.allowRetry === true,
        explanation: optionalText(p.explanation, LIMITS.comment, 'Пояснение'),
        spec,
      } };
    }
  }
}

/** Тело из базы: испорченная строка не должна ронять страницу — показываем блок по умолчанию. */
export function bodyFromRow(kind: string, payload: unknown): BlockBody {
  if (!isBlockKind(kind)) return defaultBody('text');
  try {
    return sanitizeBlockBody(kind, payload);
  } catch {
    return defaultBody(kind);
  }
}

export interface Reveal { explanation: string; solution: AssignmentSpec }

/** reveal — ответ уже проверен и скрывать ключ незачем: добавляем пояснение и учительскую схему. */
export function toStudentBody(body: BlockBody, reveal = false): StudentBlockBody {
  if (body.kind !== 'assignment') return body;
  const { spec, explanation, ...rest } = body.payload;
  let safe: StudentAssignmentSpec;
  if (spec.type === 'choice') {
    const options = spec.options.map(({ id, text }) => ({ id, text }));
    safe = { type: 'choice', multiple: spec.multiple, options: spec.shuffle ? stableShuffle(options) : options };
  } else if (spec.type === 'number') {
    safe = { type: 'number', unit: spec.unit };
  } else if (spec.type === 'short') {
    safe = { type: 'short' };
  } else if (spec.type === 'gaps') {
    safe = { type: 'gaps', parts: parseGaps(spec.text).parts };
  } else if (spec.type === 'match') {
    safe = {
      type: 'match', left: spec.pairs.map((p) => ({ id: p.id, text: p.left })),
      right: stableShuffle(spec.pairs.map((p) => ({ id: p.rightId, text: p.right }))),
    };
  } else if (spec.type === 'order') {
    safe = { type: 'order', items: stableShuffle(spec.items) };
  } else if (spec.type === 'sim_state') {
    safe = { type: 'sim_state', simulationId: spec.simulationId, showHints: spec.showHints };
    if (spec.showHints) safe.targets = spec.targets.map(({ name, label }) => ({ name, label }));
  } else {
    safe = { type: 'text' };
  }
  const payload: StudentAssignmentPayload = { ...rest, spec: safe };
  if (reveal) Object.assign(payload, revealOf(body.payload));
  return { kind: 'assignment', payload };
}

export function revealOf(p: AssignmentPayload): Reveal {
  return { explanation: p.explanation, solution: p.spec };
}

/**
 * Когда ученику можно показать ключ: работа проверена и пересдать её либо нельзя,
 * либо незачем (полный балл). Иначе «Сдать заново» превращается в списывание.
 */
export function revealFor(p: AssignmentPayload, sub: { status: string; score: number | null } | null | undefined): boolean {
  if (!sub || sub.status !== 'graded') return false;
  return !p.allowRetry || (sub.score ?? 0) >= p.points;
}

/** То, от чего зависит балл: формулировки сюда не входят. */
function answerKey(p: AssignmentPayload): string {
  const s = p.spec;
  const key = s.type === 'choice'
    ? { type: s.type, multiple: s.multiple, ids: s.options.map((o) => o.id),
      correct: s.options.filter((o) => o.correct).map((o) => o.id) }
    : s.type === 'number'
      ? { type: s.type, answer: s.answer, tolerance: s.tolerance }
      : s.type === 'short' ? { type: s.type, accepted: s.accepted.map(normalizeWord) }
      : s.type === 'gaps' ? { type: s.type, answers: parseGaps(s.text).answers.map((a) => a.map(normalizeWord)) }
      : s.type === 'match' ? { type: s.type, pairs: s.pairs.map((p) => [p.id, p.rightId]) }
      : s.type === 'order' ? { type: s.type, ids: s.items.map((i) => i.id) }
      : s.type === 'sim_state'
        ? { type: s.type, hints: s.showHints, targets: s.targets.map((t) => [t.name, t.value, t.tolerance]) }
        : { type: s.type };
  return JSON.stringify({ points: p.points, key });
}

export function answerKeyChanged(before: AssignmentPayload, after: AssignmentPayload): boolean {
  return answerKey(before) !== answerKey(after);
}

export function simulationIdsOf(body: BlockBody | StudentBlockBody): string[] {
  if (body.kind === 'simulation') return body.payload.simulationId ? [body.payload.simulationId] : [];
  if (body.kind === 'assignment') {
    if (body.payload.spec.type === 'sim_state') return [body.payload.spec.simulationId];
    if (body.payload.stand?.kind === 'simulation') return [body.payload.stand.simulationId];
  }
  return [];
}

/** Вставка симуляции: в блок «Тренажёр» или стендом в задание. */
export function withSimulation(body: BlockBody, simulationId: string): BlockBody {
  if (body.kind === 'simulation') return { kind: 'simulation', payload: { ...body.payload, simulationId } };
  if (body.kind === 'assignment' && body.payload.spec.type === 'sim_state') {
    throw new LmsError('В задании «Состояние симуляции» симуляцию выбирают в редакторе: к ней привязана цель.');
  }
  if (body.kind === 'assignment') {
    return { kind: 'assignment', payload: { ...body.payload, stand: { kind: 'simulation', simulationId } } };
  }
  throw new LmsError('Тренажёр можно вставить только в блок «Тренажёр» или в стенд задания.');
}

/** Короткая подпись задания для таблиц и журнала. */
export function assignmentTitle(prompt: string): string {
  const flat = prompt.replace(/[*#]/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/** id нового варианта в редакторе; сервер всё равно проверит его по OPTION_ID_RE. */
export function newOptionId(): string {
  return Math.random().toString(36).slice(2, 10) || 'o1';
}
