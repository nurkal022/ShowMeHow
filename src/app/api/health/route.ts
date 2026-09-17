import { NextResponse } from 'next/server';
import { getJobStore } from '@/lib/jobs/current';
import { healthCode } from '@/lib/jobs/policy';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Открыта без входа: её опрашивает внешний мониторинг. Только счётчики — ни id,
 * ни промптов, ни имён. 503 — база не отвечает или очередь стоит без воркеров.
 */
export async function GET() {
  try {
    const stats = await getJobStore().stats();
    return NextResponse.json({ db: 'ok', ...stats },
      { status: healthCode(stats), headers: NO_STORE });
  } catch (e) {
    console.error('Проверка здоровья: база недоступна:', e);
    return NextResponse.json({ db: 'error' }, { status: 503, headers: NO_STORE });
  }
}
