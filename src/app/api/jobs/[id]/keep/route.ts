import { NextResponse } from 'next/server';
import { getJobStore, getOwnedJob } from '@/lib/jobs/current';
import { getDraft, linkKeptSimulation, listDrafts } from '@/lib/jobs/drafts';
import { JOB_NOT_FOUND_MESSAGE } from '@/lib/jobs/messages';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';
import { createSimulation, saveThumbnail } from '@/lib/storage';
import { renderArtifact } from '@/lib/renderer';
import type { GenerateRequest } from '@/lib/jobs/store';

type P = { params: Promise<{ id: string }> };

/**
 * «Оставить эту версию»: черновик сразу становится симуляцией в библиотеке, а полировка
 * останавливается. Ждать воркера не нужно — человек продолжает работать в ту же секунду.
 * Работает и для давно отменённого задания из истории.
 */
export async function POST(req: Request, { params }: P) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const job = await getOwnedJob(user.id, id);
  if (!job || job.kind !== 'generate') return NextResponse.json({ error: JOB_NOT_FOUND_MESSAGE }, { status: 404 });
  if (job.simulationId) return NextResponse.json({ simulationId: job.simulationId });

  const body = await req.json().catch(() => ({})) as { version?: unknown };
  const drafts = await listDrafts(id);
  const version = typeof body.version === 'number' ? body.version : drafts[drafts.length - 1]?.version;
  const draft = version ? await getDraft(id, version) : null;
  if (!draft) return NextResponse.json({ error: 'У этой генерации ещё нет версии, которую можно оставить.' }, { status: 409 });

  const store = getJobStore();
  // Название и предмет берём из плана: он уже в журнале задания.
  const events = await store.events(id, 0);
  const planned = events.map((e) => e.event).find((e) => e.type === 'plan-ready');
  const spec = planned && planned.type === 'plan-ready' ? planned.spec : null;
  const prompt = (job.request as GenerateRequest).prompt ?? '';
  const meta = await createSimulation(user.id, {
    title: spec?.title ?? (prompt.slice(0, 60) || 'Симуляция'), prompt, subject: spec?.subject ?? 'Другое',
    tags: spec?.goals.slice(0, 3) ?? [],
    warning: 'Сохранена по ходу генерации: полировка остановлена вручную.',
  }, draft.html);
  await linkKeptSimulation(id, meta.id);
  // Обложка рисуется в фоне: человек не ждёт браузер ради картинки в библиотеке.
  void renderArtifact(draft.html)
    .then((r) => { const shot = r.screenshots[1] ?? r.screenshots[0]; return shot ? saveThumbnail(user.id, meta.id, shot) : undefined; })
    .catch(() => {});
  await store.requestCancel(id);
  return NextResponse.json({ simulationId: meta.id }, { status: 201 });
}
