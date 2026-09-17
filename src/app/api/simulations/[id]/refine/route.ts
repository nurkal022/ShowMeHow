import { NextResponse } from 'next/server';
import { getArtifact } from '@/lib/storage';
import { getJobStore } from '@/lib/jobs/current';
import { ActiveJobExistsError } from '@/lib/jobs/store';
import { jobPriority } from '@/lib/jobs/policy';
import {
  EMPTY_INSTRUCTION_MESSAGE, INSTRUCTION_TOO_LONG_MESSAGE, INVALID_REQUEST_MESSAGE,
  MAX_INSTRUCTION_LENGTH, REFINE_BUSY_MESSAGE, SIMULATION_NOT_FOUND_MESSAGE,
} from '@/lib/jobs/messages';
import { readJsonObject } from '@/lib/jobs/request-body';
import { activeProvider, NO_PROVIDER_MESSAGE } from '@/lib/settings';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { listMemberships } from '@/lib/org/access';
import { canGenerate, GENERATION_FORBIDDEN_MESSAGE } from '@/lib/org/policy';

function isInvalidSegment(e: unknown): boolean {
  return e instanceof Error && e.message.includes('invalid path segment');
}

/**
 * Доработка — такое же задание, как генерация: её выполняет воркер, и Chromium
 * больше не поднимается в веб-процессе в обход очереди. Квоту она не тратит.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  // Право проверяется до поиска симуляции и ничего о ней не выдаёт.
  const memberships = await listMemberships(user.id);
  if (!canGenerate(user, memberships)) {
    return NextResponse.json({ error: GENERATION_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const { id } = await params;
  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) {
    return NextResponse.json({ error: EMPTY_INSTRUCTION_MESSAGE }, { status: 400 });
  }
  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    return NextResponse.json({ error: INSTRUCTION_TOO_LONG_MESSAGE }, { status: 400 });
  }
  // Чужая и несуществующая симуляции дают 404; обход каталога в id — 400.
  try {
    if ((await getArtifact(user.id, id)) === null) {
      return NextResponse.json({ error: SIMULATION_NOT_FOUND_MESSAGE }, { status: 404 });
    }
  } catch (e) {
    const status = isInvalidSegment(e) ? 400 : 404;
    return NextResponse.json({ error: SIMULATION_NOT_FOUND_MESSAGE }, { status });
  }
  if (!activeProvider()) {
    return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 400 });
  }
  try {
    const job = await getJobStore().create({
      ownerId: user.id,
      kind: 'refine',
      priority: jobPriority(user, memberships),
      request: { instruction },
      targetSimulationId: id,
    });
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    if (e instanceof ActiveJobExistsError) {
      return NextResponse.json({ error: REFINE_BUSY_MESSAGE }, { status: 409 });
    }
    throw e;
  }
}
