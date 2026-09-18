import { NextResponse } from 'next/server';
import { OrgError } from '../org/types';
import { LmsError } from '../lms/types';

/** Общие ответы роутов кабинетов. Чужое и несуществующее неотличимы — 404. */

export const NOT_FOUND_MESSAGE = 'Не найдено.';
export const INVALID_BODY_MESSAGE = 'Некорректный запрос.';

export type IdParams = { params: Promise<{ id: string }> };

export function notFound(): NextResponse {
  return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Тело запроса — JSON-объект; иначе null. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await req.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Отказы с текстом для человека — 400; всё прочее пробрасывается, и Next ответит 500. */
export async function withUserErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OrgError || e instanceof LmsError) return badRequest(e.message);
    throw e;
  }
}
