import { NextResponse } from 'next/server';

/**
 * Предохранитель для дорогих действий веб-процесса: план (вызов модели), проверка
 * качества и настройки (Chromium). Они идут мимо очереди заданий — их ждут, глядя
 * на кнопку, — поэтому «одно задание на человека» из очереди их не сдерживает.
 * На человека и вид действия: не больше одного одновременно и не больше perMinute
 * за минуту. Живёт в памяти процесса (globalThis — роуты в dev собираются отдельно):
 * веб на сервере один, а после рестарта счётчики начинаются заново — это не беда.
 */

export interface ThrottleRule { perMinute: number }

export const THROTTLE: Record<'plan' | 'check' | 'config', ThrottleRule> = {
  plan: { perMinute: 8 },
  check: { perMinute: 6 },
  config: { perMinute: 12 },
};

interface Slot { running: boolean; starts: number[] }

const KEY = Symbol.for('tesseract.throttle');
function slots(): Map<string, Slot> {
  const g = globalThis as unknown as Record<symbol, Map<string, Slot> | undefined>;
  g[KEY] ??= new Map();
  return g[KEY]!;
}

export const THROTTLE_MESSAGE = 'Слишком часто: дождитесь окончания предыдущего запроса и попробуйте через минуту.';

/** Занять слот; null — нельзя (уже идёт или лимит минуты исчерпан). Вернуть слот обязательно через release. */
export function acquire(
  userId: string, kind: keyof typeof THROTTLE, now: () => number = Date.now,
): (() => void) | null {
  const key = `${kind}:${userId}`;
  const t = now();
  const slot = slots().get(key) ?? { running: false, starts: [] };
  slot.starts = slot.starts.filter((at) => t - at < 60_000);
  if (slot.running || slot.starts.length >= THROTTLE[kind].perMinute) {
    slots().set(key, slot);
    return null;
  }
  slot.running = true;
  slot.starts.push(t);
  slots().set(key, slot);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slot.running = false;
  };
}

/** Выполнить действие под предохранителем; при отказе — 429 с понятным текстом. */
export async function throttled(
  userId: string, kind: keyof typeof THROTTLE, fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const release = acquire(userId, kind);
  if (!release) return NextResponse.json({ error: THROTTLE_MESSAGE }, { status: 429 });
  try {
    return await fn();
  } finally {
    release();
  }
}
