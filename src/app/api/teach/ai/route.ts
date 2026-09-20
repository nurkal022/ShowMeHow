import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { staffBlock, staffCourse, staffTopic } from '@/lib/lms/access';
import { createTopic, listTopics, setTopicFormat } from '@/lib/lms/courses';
import { sanitizeLessonSpec } from '@/lib/lms/lesson-builder';
import { createBlock, listBlocks } from '@/lib/lms/blocks';
import { getSubmission } from '@/lib/lms/submissions';
import {
  draftCourseDescription, draftCourseOutline, draftCoursePlan, draftGrade, draftLesson, draftLessonFromSpec, draftRubric, draftSimulationBrief, draftTasks, draftVariants, suggestSimulation,
} from '@/lib/lms/ai';
import { findOrgBySlug } from '@/lib/org/orgs';
import { requireOrgRole } from '@/lib/org/access';
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
          grade: str(body.grade, 40) || staff.course.grade, wishes: str(body.wishes, 800), exam: body.exam === true,
        });
        // Подходящий тренажёр из библиотеки или каталога — сразу после объяснения.
        const sim = body.exam === true ? null : await suggestSimulation(user.id, `${staff.topic.title} ${str(body.topic)}`);
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
      case 'build': {
        // Конструктор урока: новая тема (или дополнение выбранной) по шаблону и слотам учителя.
        const staff = await staffCourse(user, str(body.courseId, 40));
        if (!staff) return notFound();
        const spec = sanitizeLessonSpec(body.spec);
        if (!spec.title) return badRequest('Напишите, о чём урок.');
        if (!spec.grade) spec.grade = staff.course.grade;
        if (spec.slots.length === 0) return badRequest('Добавьте в урок хотя бы один блок.');
        const target = body.topicId ? await staffTopic(user, str(body.topicId, 40)) : null;
        if (body.topicId && (!target || target.course.id !== staff.course.id)) return notFound();
        const bodies = await draftLessonFromSpec(spec, staff.course.subject, user.id);
        const topic = target?.topic ?? await createTopic(staff.course.id, spec.title);
        if (!target && spec.exam) await setTopicFormat(topic.id, 'exam', Math.max(10, Math.min(300, spec.minutes)));
        const existing = target ? await listBlocks(topic.id) : [];
        const ids = await insertAll(topic.id, bodies, existing[existing.length - 1]?.id ?? null);
        return NextResponse.json({ topicId: topic.id, created: ids.length, firstId: ids[0] }, { status: 201 });
      }
      case 'describe': {
        const staff = await staffCourse(user, str(body.courseId, 40));
        if (!staff) return notFound();
        const c = staff.course;
        return NextResponse.json({ description: await draftCourseDescription({
          title: str(body.title, 200) || c.title, subject: str(body.subject, 60) || c.subject, grade: str(body.grade, 40) || c.grade,
          topics: (await listTopics(c.id)).map((t) => t.title), wishes: str(body.wishes, 800),
        }) });
      }
      case 'outline': {
        const staff = await staffCourse(user, str(body.courseId, 40));
        if (!staff) return notFound();
        const c = staff.course;
        const lessons = Number(body.lessons);
        return NextResponse.json({ topics: await draftCourseOutline({
          title: c.title, subject: c.subject, grade: c.grade, existing: (await listTopics(c.id)).map((t) => t.title),
          lessons: Number.isInteger(lessons) ? Math.max(2, Math.min(40, lessons)) : 10, wishes: str(body.wishes, 800),
        }) });
      }
      case 'plan': {
        const org = await findOrgBySlug(str(body.org, 80));
        if (!org || !(await requireOrgRole(user, org.id, ['teacher']))) return notFound();
        const program = str(body.program, 12000);
        if (program.length < 20) return badRequest('Вставьте программу: список тем, КТП или оглавление учебника.');
        const weeks = Number(body.weeks);
        return NextResponse.json({ plan: await draftCoursePlan({
          program, subject: str(body.subject, 60), grade: str(body.grade, 40),
          weeks: Number.isInteger(weeks) ? Math.max(0, Math.min(80, weeks)) : 0, wishes: str(body.wishes, 800),
        }) });
      }
      case 'rubric': {
        // Форма задания может быть не сохранена: текст приходит из редактора, доступ — по блоку.
        const staff = await staffBlock(user, str(body.blockId, 40));
        if (!staff) return notFound();
        const prompt = str(body.prompt, 8000);
        const points = Number(body.points);
        if (!prompt) return badRequest('Сначала напишите текст задания.');
        if (!Number.isFinite(points) || points <= 0) return badRequest('Укажите баллы за задание — критерии в сумме дадут столько же.');
        return NextResponse.json(await draftRubric({
          prompt, points: Math.round(points), subject: staff.course.subject, type: str(body.type, 20),
        }));
      }
      case 'simBrief': {
        const staff = await staffBlock(user, str(body.blockId, 40));
        if (!staff || staff.block.body.kind !== 'assignment') return notFound();
        const payload = { ...staff.block.body.payload, prompt: str(body.prompt, 8000) || staff.block.body.payload.prompt };
        return NextResponse.json({ brief: await draftSimulationBrief(payload, staff.course.subject) });
      }
      default:
        return badRequest('Неизвестное действие помощника.');
    }
  });
}
