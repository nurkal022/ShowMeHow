import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { staffBlock, staffTopic } from '@/lib/lms/access';
import { createBlock, listBlocks } from '@/lib/lms/blocks';
import { getSubmission } from '@/lib/lms/submissions';
import { draftGrade, draftLesson, draftTasks, draftVariants, suggestSimulation } from '@/lib/lms/ai';
import type { BlockBody } from '@/lib/lms/block-schema';
import { renderMarkup } from '@/lib/lms/markup';

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const count = (v: unknown, def: number) => Math.max(1, Math.min(6, Number.isInteger(v) ? Number(v) : def));

/** Кладёт блоки подряд: первый — под after (null — в конец темы), каждый следующий — под предыдущим. */
async function insertAll(topicId: string, bodies: BlockBody[], after: string | null): Promise<string[]> {
  const ids: string[] = [];
  let anchor: string | null | undefined = after ?? undefined;
  for (const b of bodies) {
    const block = await createBlock(topicId, b.kind, { afterBlockId: anchor, payload: b.payload });
    ids.push(block.id);
    anchor = block.id;
  }
  return ids;
}

/**
 * Помощник учителя. lesson — урок по теме в пустую или текущую тему; tasks — задания по тексту
 * блока; variants — варианты задания; grade — черновик оценки ответа (ничего не сохраняет).
 */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withUserErrors(async () => {
    switch (body.action) {
      case 'lesson': {
        const staff = await staffTopic(user, str(body.topicId, 40));
        if (!staff) return notFound();
        const bodies = await draftLesson({
          topic: str(body.topic) || staff.topic.title, subject: staff.course.subject,
          grade: str(body.grade, 40), wishes: str(body.wishes, 800),
        });
        // Подходящий тренажёр из библиотеки или каталога — сразу после объяснения.
        const sim = await suggestSimulation(user.id, `${staff.topic.title} ${str(body.topic)}`);
        if (sim) bodies.splice(1, 0, { kind: 'simulation', payload: { simulationId: sim, caption: 'Попробуйте сами: меняйте параметры и наблюдайте.', preset: {}, locked: [] } });
        const existing = await listBlocks(staff.topic.id);
        const ids = await insertAll(staff.topic.id, bodies, existing[existing.length - 1]?.id ?? null);
        return NextResponse.json({ created: ids.length, firstId: ids[0] });
      }
      case 'tasks': {
        const staff = await staffBlock(user, str(body.blockId, 40));
        if (!staff) return notFound();
        const b = staff.block.body;
        const text = b.kind === 'text' || b.kind === 'callout' || b.kind === 'spoiler'
          ? `${b.payload.title}\n${b.payload.body}` : '';
        if (!text.trim()) return badRequest('Задания составляются по текстовому блоку — в этом нет текста.');
        const ids = await insertAll(staff.topic.id, await draftTasks(text, count(body.count, 3)), staff.block.id);
        return NextResponse.json({ created: ids.length, firstId: ids[0] });
      }
      case 'variants': {
        const staff = await staffBlock(user, str(body.blockId, 40));
        if (!staff || staff.block.body.kind !== 'assignment') return notFound();
        const bodies = await draftVariants(staff.block.body.payload, count(body.count, 3));
        if (bodies.length === 0) return badRequest('Помощник не смог сделать варианты этого задания. Попробуйте ещё раз.');
        const ids = await insertAll(staff.topic.id, bodies, staff.block.id);
        return NextResponse.json({ created: ids.length, firstId: ids[0] });
      }
      case 'grade': {
        const sub = await getSubmission(str(body.submissionId, 40));
        const staff = sub ? await staffBlock(user, sub.blockId) : null;
        if (!sub || !staff || staff.block.body.kind !== 'assignment') return notFound();
        const a = sub.answer;
        const text = a?.type === 'text' ? a.text
          : a?.type === 'table' ? a.rows.map((r) => r.join(' | ')).join('\n') : '';
        if (!text.trim()) return badRequest('Черновик оценки делается для развёрнутых ответов и таблиц.');
        const suggestion = await draftGrade(staff.block.body.payload, text);
        return NextResponse.json({ ...suggestion, commentHtml: renderMarkup(suggestion.comment) });
      }
      default:
        return badRequest('Неизвестное действие помощника.');
    }
  });
}
