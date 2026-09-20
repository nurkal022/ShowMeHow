import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody, withUserErrors } from '@/lib/http/route-kit';
import { studentRisks, weekFacts, weekStartOf } from '@/lib/org/reports';
import { adviseOnStudent, explainResult, planQuestion, saveWeekReport, writeWeekSummary } from '@/lib/org/ai';
import { runPlan, sanitizePlan } from '@/lib/org/datasets';

type P = { params: Promise<{ slug: string }> };
const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Помощник администрации. week — собрать недельный отчёт (цифры + текст) и сохранить;
 * advise — совет по ученику из зоны риска; ask — вопрос на естественном языке → таблица,
 * график и вывод; run — перезапуск уже готового плана (правка сортировки без модели).
 */
export async function POST(req: Request, { params }: P) {
  const { slug } = await params;
  const g = await guardOrg(req, slug, ['org_admin']);
  if (g instanceof Response) return g;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const orgId = g.membership.orgId;
  return withUserErrors(async () => {
    switch (body.action) {
      case 'week': {
        const raw = str(body.weekStart, 10);
        const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStartOf(new Date(`${raw}T00:00:00`)) : weekStartOf();
        const facts = await weekFacts(orgId, weekStart);
        const summary = await writeWeekSummary(facts);
        await saveWeekReport(orgId, g.user.id, facts, summary);
        return NextResponse.json({ weekStart });
      }
      case 'advise': {
        const risk = (await studentRisks(orgId)).find((r) => r.id === str(body.studentId));
        if (!risk) return badRequest('Ученик не найден.');
        return NextResponse.json({ advice: await adviseOnStudent(risk) });
      }
      case 'ask': {
        const question = str(body.question, 500);
        if (question.length < 4) return badRequest('Сформулируйте вопрос, например: «Какие классы отстают по физике?»');
        const plan = await planQuestion(question);
        const result = await runPlan(orgId, plan);
        const insight = await explainResult(question, result);
        return NextResponse.json({ result, insight });
      }
      case 'run': {
        const plan = sanitizePlan(body.plan);
        if (!plan) return badRequest('Некорректный запрос.');
        return NextResponse.json({ result: await runPlan(orgId, plan) });
      }
      default:
        return badRequest('Неизвестное действие.');
    }
  });
}
