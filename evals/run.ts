import fs from 'node:fs';
import path from 'node:path';
import prompts from './prompts.json';
import { aggregate, complexity, type EvalRow } from './score';
import { makeCtx, runPipeline } from '../src/lib/pipeline/run';
import { rescore } from '../src/lib/pipeline/judge';
import { getArtifact, getSpec } from '../src/lib/storage';
import { renderArtifact, closeBrowser } from '../src/lib/renderer';
import { listSections } from '../src/lib/pipeline/sections';
import type { PipelineEvent, QualityMode, RubricScores } from '../src/lib/types';

/**
 * Эталонный прогон: запросы из prompts.json через настоящий пайплайн. Кроме оценок
 * судьи, пишет то, по чему видно, стало ли лучше: сложность результата (параметры,
 * виды, шаги урока, секции, контролы), числовые проверки ядра, пробы, время по этапам
 * и токены по ролям. Отчёт — evals/results/<дата>.md и .json рядом.
 *
 *   npm run eval -- --mode standard --limit 5 --only Лабораторная
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Прогоны эвалов принадлежат конкретному пользователю — id задаётся окружением. */
function evalOwnerId(): string {
  const id = process.env.SHOWMEHOW_EVAL_OWNER_ID;
  if (!id) {
    throw new Error('Задайте SHOWMEHOW_EVAL_OWNER_ID: id пользователя, которому принадлежат прогоны');
  }
  return id;
}

async function evalOne(prompt: string, mode: QualityMode): Promise<EvalRow> {
  const events: PipelineEvent[] = [];
  const started = Date.now();
  try {
    const ownerId = evalOwnerId();
    const ctx = makeCtx((e) => events.push(e));
    const meta = await runPipeline(ctx, { ownerId, prompt, mode });
    const html = await getArtifact(ownerId, meta.id);
    const spec = await getSpec(ownerId, meta.id);
    if (html === null || spec === null) throw new Error('Артефакт прогона не найден');
    // Финальная независимая оценка сохранённого артефакта.
    const render = await renderArtifact(html, { probes: true });
    const { scores } = await rescore(ctx, spec, { html, render, critic: null, alive: render.ok });
    return {
      prompt, scores, simulationId: meta.id, ms: Date.now() - started,
      ...complexity(spec, events, render, listSections(html).length),
    };
  } catch (e) {
    return { prompt, scores: null, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}

function fmt(s: RubricScores): string {
  return `физ ${s.physics.toFixed(1)} · нагл ${s.clarity.toFixed(1)} · инт ${s.interactivity.toFixed(1)} · ` +
    `эст ${s.aesthetics.toFixed(1)}${s.depth !== undefined ? ` · глуб ${s.depth.toFixed(1)}` : ''}`;
}

const mode = (arg('mode') ?? 'standard') as QualityMode;
const only = arg('only');
const limit = Number(arg('limit') ?? prompts.length);
const list = prompts.filter((p) => !only || p.includes(only)).slice(0, limit);

const rows: EvalRow[] = [];
for (const p of list) {
  console.log('▶', p);
  const row = await evalOne(p, mode);
  console.log(row.scores ? `  ${fmt(row.scores)} · ${Math.round(row.ms / 1000)} с` : `  ✗ ${row.error}`);
  rows.push(row);
}
await closeBrowser();

const agg = aggregate(rows);
const stamp = new Date().toISOString().slice(0, 16).replace(':', '-');
const lines = [
  `# Eval ${stamp} · режим ${mode}`,
  '',
  `Средние: ${fmt(agg.avg)}`,
  `Порог пройден (все ≥ 8): ${(agg.passRate * 100).toFixed(0)}%`,
  `Сложность в среднем: ${agg.complexity}`,
  `Время в среднем: ${agg.avgSeconds} с; по этапам: ${agg.stageSeconds}`,
  '',
  '| Запрос | Оценки | Уровень | Парам. | Видов | Шагов | Секций | Ядро | Пробы | Время |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => r.scores
    ? `| ${r.prompt} | ${fmt(r.scores)} | ${r.level} | ${r.params} | ${r.views} | ${r.steps} | ${r.sections} | ` +
      `${r.coreChecks ?? '—'} | ${r.probePass !== undefined ? Math.round(r.probePass * 100) + '%' : '—'} | ${Math.round(r.ms / 1000)} с |`
    : `| ${r.prompt} | ❌ ${r.error} | | | | | | | | ${Math.round(r.ms / 1000)} с |`),
];
const dir = path.join('evals', 'results');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${stamp}.md`), lines.join('\n'));
fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify({ mode, rows }, null, 2));
console.log('Отчёт:', path.join(dir, `${stamp}.md`));
