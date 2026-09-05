import { NextResponse } from 'next/server';

/** Единый ответ 401 для роутов, которые отвечают через NextResponse.json. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Требуется вход в систему.' }, { status: 401 });
}
